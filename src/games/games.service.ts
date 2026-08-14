import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BonusService } from '../bonus/bonus.service';
import { VipService } from '../vip/vip.service';
import { ReferralService } from '../referral/referral.service';
import { BalanceService } from '../balance/balance.service';
import {
  CatalogGame,
  GAME_CATEGORIES,
  GameCategory,
  SUB_TAGS,
  SubTag,
} from './catalog.types';
import {
  categorizeGame,
  computeSubTags,
  pinnedSlotsIndex,
  pinnedLiveCasinoIndex,
  pinnedFishingIndex,
  pinnedCardsIndex,
  pinnedHotGamesIndex,
  sportsProviderOrderIndex,
  SPORTS_ESPORTS_PROVIDER_OVERRIDE,
  ESPORTS_BROKEN_THUMBNAIL_PROVIDERS,
  hasBrokenThumbnail,
} from './category.util';

const ORACLE_BASE_URL_DEFAULT = 'https://oraclegames.net/api';
const GAME_ACCOUNT_LENGTH = 10;
// Oracle requires the launch "username" to be EXACTLY 10 lowercase letters —
// no digits, uppercase, or symbols. Digits were previously included here,
// which meant almost every generated account was rejected by Oracle.
const GAME_ACCOUNT_CHARS = 'abcdefghijklmnopqrstuvwxyz';
const GAME_ACCOUNT_PATTERN = /^[a-z]{10}$/;
const CATALOG_TTL_MS = 10 * 60 * 1000;
const PROVIDER_FETCH_DELAY_MS = 300;
const FEATURED_LOOKBACK_DAYS = 30;
const FEATURED_LIMIT = 30;

type CallbackPayload = {
  game_uid: string;
  game_round: string;
  serial_number: string;
  bet_amount: number;
  win_amount: number;
  member_account: string;
  currency_code: string;
  timestamp: number;
};

@Injectable()
export class GamesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GamesService.name);

  private catalogCache: { games: CatalogGame[]; fetchedAt: number } | null =
    null;
  private buildingPromise: Promise<CatalogGame[]> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly bonusService: BonusService,
    private readonly vipService: VipService,
    private readonly referralService: ReferralService,
    private readonly balanceService: BalanceService,
  ) {}

  onModuleInit(): void {
    // Fire-and-forget: don't block Nest's own bootstrap on a ~40-90s Oracle sweep.
    void this.ensureCatalog();
    this.refreshTimer = setInterval(() => {
      void this.rebuildCatalog();
    }, CATALOG_TTL_MS);
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private get baseUrl(): string {
    return (
      this.config.get<string>('ORACLE_BASE_URL') ?? ORACLE_BASE_URL_DEFAULT
    );
  }

  private get apiKey(): string {
    const key = this.config.get<string>('ORACLE_API_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'Game provider is not configured (missing ORACLE_API_KEY).',
      );
    }
    return key;
  }

  private randomGameAccount(): string {
    const bytes = randomBytes(GAME_ACCOUNT_LENGTH);
    let out = '';
    for (let i = 0; i < GAME_ACCOUNT_LENGTH; i++) {
      out += GAME_ACCOUNT_CHARS[bytes[i] % GAME_ACCOUNT_CHARS.length];
    }
    return out;
  }

  private async ensureGameAccount(userId: bigint): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    // Self-heal: a stored account from before the digit-charset fix would
    // never validate against Oracle, so don't trust it blindly — regenerate.
    if (user.gameAccount && GAME_ACCOUNT_PATTERN.test(user.gameAccount))
      return user.gameAccount;

    for (;;) {
      const candidate = this.randomGameAccount();
      const existing = await this.prisma.user.findUnique({
        where: { gameAccount: candidate },
      });
      if (existing) continue;

      await this.prisma.user.update({
        where: { id: userId },
        data: { gameAccount: candidate },
      });
      return candidate;
    }
  }

  async launchGame(userId: string, gameUid: string) {
    const id = BigInt(userId);
    const [user, gameAccount] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id } }),
      this.ensureGameAccount(id),
    ]);

    const amount = Number(user.balance);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Please deposit funds before playing.');
    }

    const payload = { username: gameAccount, amount, game_uid: gameUid };
    const isDev = process.env.NODE_ENV !== 'production';

    type OracleLaunchResponse = {
      status?: boolean;
      success?: boolean;
      game_url?: string;
      launch_url?: string;
      message?: string;
    };
    let res: Response;
    let data: OracleLaunchResponse | null = null;
    try {
      res = await fetch(`${this.baseUrl}/getgameurl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-oracle-key': this.apiKey,
        },
        body: JSON.stringify(payload),
      });
      data = (await res
        .json()
        .catch(() => null)) as OracleLaunchResponse | null;
    } catch (err) {
      const e = err as Error;
      this.logger.error(
        `getgameurl request errored for user ${userId}. Request: ${JSON.stringify(payload)} ` +
          `Error: ${e.message}\n${e.stack}`,
      );
      throw new BadRequestException({
        message: "Couldn't launch this game right now.",
        ...(isDev ? { oracleResponse: { error: e.message } } : {}),
      });
    }

    // Accept either field name Oracle might use for "did this work" and "where do I send the player" -
    // the documented contract is status/game_url, but be lenient in case a provider varies it.
    const isSuccess = data?.success === true || data?.status === true;
    const gameUrl = data?.launch_url || data?.game_url;

    if (!res.ok || !isSuccess || !gameUrl) {
      this.logger.error(
        `getgameurl failed for user ${userId}. Request: ${JSON.stringify(payload)} ` +
          `Response (${res.status}): ${JSON.stringify(data)}`,
      );
      throw new BadRequestException({
        message: data?.message ?? "Couldn't launch this game right now.",
        ...(isDev ? { oracleResponse: data } : {}),
      });
    }
    return { gameUrl };
  }

  async getProviders() {
    const res = await fetch(`${this.baseUrl}/manager/providerlist`, {
      headers: { 'x-oracle-key': this.apiKey },
    });
    if (!res.ok) {
      throw new BadRequestException("Couldn't load the game provider list.");
    }
    return res.json();
  }

  async getProviderGames(providerCode: string) {
    const res = await fetch(
      `${this.baseUrl}/manager/game/${encodeURIComponent(providerCode)}`,
      {
        headers: { 'x-oracle-key': this.apiKey },
      },
    );
    if (!res.ok) {
      throw new BadRequestException("Couldn't load this provider's game list.");
    }
    return res.json();
  }

  /**
   * Returns the cached catalog. Blocks only on a cold start (no cache yet);
   * a stale cache kicks off a background refresh but is still returned
   * immediately, so a normal request never waits on a live Oracle sweep.
   */
  private async ensureCatalog(): Promise<CatalogGame[]> {
    if (!this.catalogCache) return this.rebuildCatalog();
    if (Date.now() - this.catalogCache.fetchedAt > CATALOG_TTL_MS) {
      void this.rebuildCatalog();
    }
    return this.catalogCache.games;
  }

  /** Single-flight: concurrent callers await the same in-flight build. */
  private async rebuildCatalog(): Promise<CatalogGame[]> {
    if (this.buildingPromise) return this.buildingPromise;

    this.buildingPromise = this.buildCatalog()
      .then((games) => {
        this.catalogCache = { games, fetchedAt: Date.now() };
        return games;
      })
      .catch((err) => {
        // This is called fire-and-forget from onModuleInit and the refresh
        // interval (no caller awaits or catches it) — an unhandled Oracle
        // network failure here (timeout, DNS, etc.) would otherwise crash
        // the entire process, taking down every unrelated route with it.
        // Fall back to whatever's cached instead: stale data on a warm
        // refresh, or an empty catalog on a cold start.
        this.logger.error(
          `Catalog build failed, keeping ${this.catalogCache ? 'stale' : 'empty'} catalog: ${(err as Error).message}`,
        );
        return this.catalogCache?.games ?? [];
      })
      .finally(() => {
        this.buildingPromise = null;
      });

    return this.buildingPromise;
  }

  /**
   * "Featured" has no signal from Oracle — there's no "this game is popular"
   * flag anywhere in their API. Instead of guessing at well-known titles,
   * derive it from real play: the most-bet gameUids in GameTransaction over
   * a recent window are actual evidence of what this platform's own
   * Bangladeshi players are choosing, not an editorial guess. Naturally
   * empty until enough real play accumulates — that's correct, not a bug.
   */
  private async getFeaturedGameUids(): Promise<Set<string>> {
    const since = new Date(
      Date.now() - FEATURED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const rows = await this.prisma.gameTransaction.groupBy({
      by: ['gameUid'],
      where: { createdAt: { gte: since } },
      _count: { gameUid: true },
      orderBy: { _count: { gameUid: 'desc' } },
      take: FEATURED_LIMIT,
    });
    return new Set(rows.map((r) => r.gameUid));
  }

  /**
   * gameUid -> display name, resolved from the catalog cache. Public so
   * other modules (e.g. UsersService's CRM player-360 history view) can
   * label raw GameTransaction rows without reaching into catalog internals.
   */
  async getGameNameMap(): Promise<Map<string, string>> {
    const catalog = await this.ensureCatalog();
    return new Map(catalog.map((g) => [g.gameUid, g.name]));
  }

  /** Player's own bet-by-bet history — profile page "Game History" tab. */
  async getMyGameHistory(userId: bigint, page = 1, pageSize = 30) {
    const size = Math.min(pageSize, 100);
    const [rows, total, catalog] = await Promise.all([
      this.prisma.gameTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.gameTransaction.count({ where: { userId } }),
      this.ensureCatalog(),
    ]);
    const nameByUid = new Map(catalog.map((g) => [g.gameUid, g.name]));

    return {
      total,
      games: rows.map((r) => ({
        id: r.id.toString(),
        gameName: nameByUid.get(r.gameUid) ?? r.gameUid,
        betAmount: r.betAmount.toString(),
        winAmount: r.winAmount.toString(),
        net: r.winAmount.sub(r.betAmount).toString(),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  private async buildCatalog(): Promise<CatalogGame[]> {
    const started = Date.now();
    const [providers, featuredUids] = await Promise.all([
      this.getProviders() as Promise<
        Array<{ code: string; name: string; status: number }>
      >,
      this.getFeaturedGameUids().catch((err) => {
        this.logger.warn(
          `Catalog build: couldn't compute featured games (${(err as Error).message})`,
        );
        return new Set<string>();
      }),
    ]);
    const active = Array.isArray(providers)
      ? providers.filter((p) => p.status === 1)
      : [];

    const out: CatalogGame[] = [];
    for (const provider of active) {
      try {
        const data = (await this.getProviderGames(provider.code)) as {
          games?: Array<{
            name: string;
            game_uid: string;
            category: string;
            thumbnail: string;
            original: string;
            status: number;
          }>;
        };
        const sportsEsportsOverride =
          SPORTS_ESPORTS_PROVIDER_OVERRIDE[provider.code.trim().toUpperCase()];
        for (const g of data.games ?? []) {
          if (g.status !== 1) continue;
          // Sportsbook aggregators are split by provider (see the comment on
          // SPORTS_ESPORTS_PROVIDER_OVERRIDE), overriding even the raw
          // category. Otherwise, pinned titles are forced into Slots/Cards
          // regardless of their normal category — see the comments on
          // PINNED_SLOTS_ORDER and PINNED_CARDS_ORDER for why.
          const categories: GameCategory[] = sportsEsportsOverride
            ? [sportsEsportsOverride]
            : [
                pinnedSlotsIndex(g.name, provider.code) !== null
                  ? 'slots'
                  : pinnedCardsIndex(g.name, provider.code) !== null
                    ? 'cards'
                    : categorizeGame(g.category, provider.code, provider.name),
              ];
          for (const category of categories) {
            out.push({
              name: g.name,
              gameUid: g.game_uid,
              providerCode: provider.code,
              providerName: provider.name,
              category,
              featured: featuredUids.has(g.game_uid),
              hotGames: pinnedHotGamesIndex(g.name, provider.code) !== null,
              subTags: computeSubTags(g.name, g.category),
              thumbnail: g.thumbnail,
              original: g.original,
            });
          }
        }
      } catch (err) {
        this.logger.warn(
          `Catalog build: skipping provider ${provider.code} (${(err as Error).message})`,
        );
      }
      await new Promise((r) => setTimeout(r, PROVIDER_FETCH_DELAY_MS));
    }

    this.logger.log(
      `Catalog build finished: ${out.length} games from ${active.length} providers in ${Date.now() - started}ms`,
    );
    return out;
  }

  async getCatalogCounts(): Promise<Record<GameCategory, number>> {
    const games = await this.ensureCatalog();
    const counts = Object.fromEntries(
      GAME_CATEGORIES.map((c) => [c, 0]),
    ) as Record<GameCategory, number>;
    for (const g of games) {
      counts[g.category]++;
      if (g.featured) counts.featured++;
      if (g.hotGames) counts.hot_games++;
    }
    return counts;
  }

  async getSubTagCounts(
    category: GameCategory,
  ): Promise<Record<SubTag, number>> {
    const games = await this.ensureCatalog();
    const inCategory =
      category === 'featured'
        ? games.filter((g) => g.featured)
        : category === 'hot_games'
          ? games.filter((g) => g.hotGames)
          : games.filter((g) => g.category === category);
    const counts = Object.fromEntries(SUB_TAGS.map((t) => [t, 0])) as Record<
      SubTag,
      number
    >;
    for (const g of inCategory) {
      for (const tag of g.subTags) counts[tag]++;
    }
    return counts;
  }

  /**
   * This user's own gameUids, most-recently-played first, deduped (a game
   * played 5 times shows once, at its most recent play). Resolved against
   * the FULL catalog, not just the featured subset — a game this player
   * actually played always qualifies for their personal Featured row even
   * if it never cracked the platform-wide top 30.
   */
  private async getRecentlyPlayedGameUids(
    userId: bigint,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.prisma.gameTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { gameUid: true },
      take: 100, // over-fetch to dedupe repeats down to `limit` distinct games
    });
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const row of rows) {
      if (seen.has(row.gameUid)) continue;
      seen.add(row.gameUid);
      ordered.push(row.gameUid);
      if (ordered.length >= limit) break;
    }
    return ordered;
  }

  /**
   * "Featured" is normally the same platform-wide top-played list for
   * everyone (see getFeaturedGameUids). Logged-in, this puts that player's
   * own most-recently-played games first instead — an easy way back to
   * whatever they were just playing — then fills the rest with the usual
   * platform-wide list, skipping anything already shown.
   */
  private async personalizeFeatured(
    fullCatalog: CatalogGame[],
    featuredSubset: CatalogGame[],
    userId: bigint,
  ): Promise<CatalogGame[]> {
    const recentUids = await this.getRecentlyPlayedGameUids(userId, 12);
    if (recentUids.length === 0) return featuredSubset;

    const byUid = new Map(fullCatalog.map((g) => [g.gameUid, g]));
    const seen = new Set<string>();
    const personal: CatalogGame[] = [];
    for (const uid of recentUids) {
      const game = byUid.get(uid);
      if (game) {
        seen.add(uid);
        personal.push(game);
      }
    }
    const rest = featuredSubset.filter((g) => !seen.has(g.gameUid));
    return [...personal, ...rest];
  }

  async getCatalogPage(
    category: GameCategory,
    page: number,
    pageSize: number,
    tag?: SubTag,
    providerCode?: string,
    sort?: 'name_asc' | 'name_desc' | 'featured',
    userId?: bigint,
  ): Promise<{ games: CatalogGame[]; total: number }> {
    const games = await this.ensureCatalog();
    let all =
      category === 'featured'
        ? games.filter((g) => g.featured)
        : category === 'hot_games'
          ? games.filter((g) => g.hotGames)
          : games.filter((g) => g.category === category);
    if (tag) all = all.filter((g) => g.subTags.includes(tag));
    if (providerCode) {
      const code = providerCode.trim().toUpperCase();
      all = all.filter((g) => g.providerCode.trim().toUpperCase() === code);
    }

    // Only applies to the plain, unfiltered Featured view — personalized
    // picks are resolved against the full catalog (see personalizeFeatured),
    // so they could disagree with an active tag/provider filter, and an
    // explicit sort (the category page's A-Z / "Featured first" dropdown)
    // is a deliberate user choice that overrides it, same as it already
    // overrides the curated pinned order below.
    if (category === 'featured' && userId && !sort && !tag && !providerCode) {
      all = await this.personalizeFeatured(games, all, userId);
    }

    if (sort) {
      // Explicit sort (the category browse page) overrides the curated
      // pinned order below — an operator-picked order and a user-picked
      // A-Z/featured sort don't both apply at once.
      all = [...all].sort((a, b) => {
        if (sort === 'name_desc') return b.name.localeCompare(a.name);
        if (sort === 'featured') {
          return (
            Number(b.featured) - Number(a.featured) ||
            a.name.localeCompare(b.name)
          );
        }
        return a.name.localeCompare(b.name);
      });
    } else {
      // Array.prototype.sort is stable (guaranteed since ES2019), so ties
      // (everything not on the pinned list) keep their existing order.
      const pinnedIndexFor: Record<
        string,
        ((name: string, providerCode: string) => number | null) | undefined
      > = {
        slots: pinnedSlotsIndex,
        live_casino: pinnedLiveCasinoIndex,
        fishing: pinnedFishingIndex,
        cards: pinnedCardsIndex,
        hot_games: pinnedHotGamesIndex,
        sports: sportsProviderOrderIndex,
      };
      const pinnedIndex = pinnedIndexFor[category];
      if (pinnedIndex) {
        all = [...all].sort(
          (a, b) =>
            (pinnedIndex(a.name, a.providerCode) ?? Infinity) -
            (pinnedIndex(b.name, b.providerCode) ?? Infinity),
        );
      }

      // Push known-broken-thumbnail games to the end instead of hiding them
      // — the pinnedIndex mechanism above can only pull specific items
      // forward, not push them back, so this is a separate stable partition.
      // Esports keys off a known-broken provider (IA); Live Casino keys off
      // the actual URL shape (VIVO's table games 403 with no filename —
      // see hasBrokenThumbnail), so its one working VIVO entry ("Game
      // lobby") stays in its normal position.
      const isBrokenThumb: ((g: (typeof all)[number]) => boolean) | null =
        category === 'esports'
          ? (g) =>
              ESPORTS_BROKEN_THUMBNAIL_PROVIDERS.has(
                g.providerCode.trim().toUpperCase(),
              )
          : category === 'live_casino'
            ? hasBrokenThumbnail
            : null;
      if (isBrokenThumb) {
        all = [...all.filter((g) => !isBrokenThumb(g)), ...all.filter(isBrokenThumb)];
      }
    }

    const start = (page - 1) * pageSize;
    return { games: all.slice(start, start + pageSize), total: all.length };
  }

  // Providers that have at least one game within a given category — powers
  // the header's per-section dropdown (real providers, not curated cards).
  async getCategoryProviders(
    category: GameCategory,
  ): Promise<{ code: string; name: string; count: number }[]> {
    const games = await this.ensureCatalog();
    const inCategory =
      category === 'featured'
        ? games.filter((g) => g.featured)
        : category === 'hot_games'
          ? games.filter((g) => g.hotGames)
          : games.filter((g) => g.category === category);
    return this.groupByProvider(inCategory);
  }

  // Every provider with at least one active game, across all categories —
  // powers the sidebar on a provider's own catalog page.
  async getAllProviders(): Promise<
    { code: string; name: string; count: number }[]
  > {
    const games = await this.ensureCatalog();
    return this.groupByProvider(games);
  }

  private groupByProvider(
    games: CatalogGame[],
  ): { code: string; name: string; count: number }[] {
    // Defensive dedupe by gameUid, in case a future category rule ever
    // produces more than one entry per game in the flat catalog.
    const seen = new Set<string>();
    const map = new Map<
      string,
      { code: string; name: string; count: number }
    >();
    for (const g of games) {
      if (seen.has(g.gameUid)) continue;
      seen.add(g.gameUid);
      const existing = map.get(g.providerCode);
      if (existing) existing.count++;
      else
        map.set(g.providerCode, {
          code: g.providerCode,
          name: g.providerName,
          count: 1,
        });
    }
    return [...map.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    );
  }

  async getProviderCatalog(
    providerCode: string,
    page: number,
    pageSize: number,
    sort: 'name_asc' | 'name_desc' | 'featured' = 'name_asc',
  ): Promise<{ games: CatalogGame[]; total: number; providerName: string }> {
    const games = await this.ensureCatalog();
    const code = providerCode.trim().toUpperCase();
    // Same defensive gameUid dedupe as groupByProvider.
    const seen = new Set<string>();
    const all: CatalogGame[] = [];
    for (const g of games) {
      if (g.providerCode.trim().toUpperCase() !== code) continue;
      if (seen.has(g.gameUid)) continue;
      seen.add(g.gameUid);
      all.push(g);
    }
    const providerName = all[0]?.providerName ?? providerCode;
    const sorted = [...all].sort((a, b) => {
      if (sort === 'name_desc') return b.name.localeCompare(a.name);
      if (sort === 'featured') {
        return (
          Number(b.featured) - Number(a.featured) ||
          a.name.localeCompare(b.name)
        );
      }
      return a.name.localeCompare(b.name);
    });
    const start = (page - 1) * pageSize;
    return {
      games: sorted.slice(start, start + pageSize),
      total: sorted.length,
      providerName,
    };
  }

  private static readonly SEARCH_RESULT_LIMIT = 30;

  async searchCatalog(
    q: string,
  ): Promise<{ games: CatalogGame[]; total: number }> {
    const games = await this.ensureCatalog();
    const needle = q.trim().toLowerCase();
    const matches = games.filter((g) => g.name.toLowerCase().includes(needle));
    return {
      games: matches.slice(0, GamesService.SEARCH_RESULT_LIMIT),
      total: matches.length,
    };
  }

  async handleCallback(payload: CallbackPayload) {
    const {
      member_account,
      serial_number,
      bet_amount,
      win_amount,
      game_uid,
      game_round,
      currency_code,
    } = payload;
    if (!member_account || !serial_number) {
      throw new BadRequestException(
        'member_account and serial_number are required.',
      );
    }
    // Defense-in-depth sanity bounds — this endpoint has no caller
    // authentication yet (see GamesController.callback), so these are the
    // only guard against a malformed/malicious payload until real signature
    // verification is added. Negative amounts and a resulting negative
    // balance are never legitimate.
    if ((bet_amount ?? 0) < 0 || (win_amount ?? 0) < 0) {
      throw new BadRequestException('bet_amount and win_amount must not be negative.');
    }

    // Idempotency: a retried callback with the same serial_number must not be applied twice.
    const existing = await this.prisma.gameTransaction.findUnique({
      where: { serialNumber: serial_number },
    });
    if (existing) {
      return { balance: Number(existing.balanceAfter) };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { gameAccount: member_account },
        });
        if (!user) {
          throw new NotFoundException(
            `No user found for member_account ${member_account}.`,
          );
        }

        const newBalance =
          Number(user.balance) -
          Number(bet_amount || 0) +
          Number(win_amount || 0);
        if (newBalance < 0) {
          throw new BadRequestException(
            `Callback would drive balance negative for ${member_account}.`,
          );
        }
        await tx.user.update({
          where: { id: user.id },
          data: { balance: newBalance },
        });
        const gameTransaction = await tx.gameTransaction.create({
          data: {
            userId: user.id,
            gameUid: game_uid,
            gameRound: game_round,
            serialNumber: serial_number,
            betAmount: bet_amount || 0,
            winAmount: win_amount || 0,
            currencyCode: currency_code,
            balanceAfter: newBalance,
          },
        });
        return { newBalance, userId: user.id, gameTransactionId: gameTransaction.id };
      });

      // Instant wallet update in the bet app — this is a server-to-server
      // Oracle webhook, so the player's own browser has no other way to
      // learn their balance just changed until they reload.
      this.balanceService.notifyChanged(result.userId);

      // Bonus turnover runs after the bet/win balance update has already
      // committed (never nested inside that transaction — BonusService opens
      // its own). Wrapped so a bonus-processing failure can never break the
      // balance response Oracle is waiting on for this bet.
      if (bet_amount && bet_amount > 0) {
        try {
          // Resolves which category this game belongs to so a bonus
          // restricted to e.g. Slots only accepts turnover from the right
          // bets (see BonusService.processTurnover). ensureCatalog() is
          // the same in-memory cache every other catalog lookup uses — no
          // extra Oracle round-trip per bet.
          const catalog = await this.ensureCatalog();
          const category = catalog.find((g) => g.gameUid === game_uid)?.category ?? null;
          await this.bonusService.processTurnover(
            result.userId,
            new Prisma.Decimal(bet_amount),
            game_uid,
            category,
          );
        } catch (err) {
          this.logger.error(
            `Bonus turnover failed for user ${result.userId}: ${(err as Error).message}`,
          );
        }

        try {
          await this.vipService.recordBet(
            result.userId,
            new Prisma.Decimal(bet_amount),
          );
        } catch (err) {
          this.logger.error(
            `VIP bet tracking failed for user ${result.userId}: ${(err as Error).message}`,
          );
        }

        try {
          await this.referralService.checkReferralMilestone(result.userId);
        } catch (err) {
          this.logger.error(
            `Referral milestone check failed for user ${result.userId}: ${(err as Error).message}`,
          );
        }

        try {
          await this.referralService.recordBetCommission(
            result.userId,
            new Prisma.Decimal(bet_amount),
            result.gameTransactionId,
          );
        } catch (err) {
          this.logger.error(
            `Referral commission failed for user ${result.userId}: ${(err as Error).message}`,
          );
        }
      }

      return { balance: result.newBalance };
    } catch (err) {
      // Two concurrent retries can both pass the findUnique check above before either
      // commits; the serial_number unique constraint catches that race here instead.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const row = await this.prisma.gameTransaction.findUnique({
          where: { serialNumber: serial_number },
        });
        if (row) return { balance: Number(row.balanceAfter) };
      }
      throw err;
    }
  }
}
