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
import { AgentsService } from '../agents/agents.service';
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

// 9Wicket (cricket sportsbook) — unlike every other provider, Oracle's own
// per-title catalog endpoint (getProviderGames) returns zero games for this
// provider code; there's just one dedicated launch endpoint instead of a
// list of titles. buildCatalog() synthesizes a single card for it under
// this fixed gameUid so it shows up in Live Sports (and the CRM's games
// list) exactly like every other game, and launchGame() routes launches for
// this exact uid to launchNineWicket() instead of the generic getgameurl call.
const NINE_WICKET_PROVIDER_CODE = '9W';
const NINE_WICKET_GAME_UID = '9wicket-lobby';
const NINE_WICKET_ACCOUNT_LENGTH = 6;
// Oracle requires this launch "username" to be exactly 6 characters with no
// special characters — incompatible with the 10-lowercase-letter
// gameAccount used for every other provider, hence the separate column.
const NINE_WICKET_ACCOUNT_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const NINE_WICKET_ACCOUNT_PATTERN = /^[a-z0-9]{6}$/;

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
  // overrideGameUid -> real gameUid, rebuilt alongside the catalog cache —
  // lets handleCallback translate Oracle's callback (which echoes back
  // whatever uid launchGame actually sent it) back to the real/canonical
  // uid without a DB query on every single settled bet.
  private overrideReverseMap: Map<string, string> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly bonusService: BonusService,
    private readonly vipService: VipService,
    private readonly referralService: ReferralService,
    private readonly balanceService: BalanceService,
    private readonly agentsService: AgentsService,
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

  private randomNineWicketAccount(): string {
    const bytes = randomBytes(NINE_WICKET_ACCOUNT_LENGTH);
    let out = '';
    for (let i = 0; i < NINE_WICKET_ACCOUNT_LENGTH; i++) {
      out += NINE_WICKET_ACCOUNT_CHARS[bytes[i] % NINE_WICKET_ACCOUNT_CHARS.length];
    }
    return out;
  }

  private async ensureNineWicketAccount(userId: bigint): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (
      user.nineWicketAccount &&
      NINE_WICKET_ACCOUNT_PATTERN.test(user.nineWicketAccount)
    )
      return user.nineWicketAccount;

    for (;;) {
      const candidate = this.randomNineWicketAccount();
      const existing = await this.prisma.user.findUnique({
        where: { nineWicketAccount: candidate },
      });
      if (existing) continue;

      await this.prisma.user.update({
        where: { id: userId },
        data: { nineWicketAccount: candidate },
      });
      return candidate;
    }
  }

  async launchGame(userId: string, gameUid: string) {
    const id = BigInt(userId);

    if (gameUid === NINE_WICKET_GAME_UID) {
      return this.launchNineWicket(id);
    }

    const [user, gameAccount, override] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id } }),
      this.ensureGameAccount(id),
      this.prisma.gameOverride.findUnique({ where: { gameUid } }),
    ]);

    if (override?.isActive === false) {
      throw new BadRequestException('This game is currently unavailable.');
    }

    const amount = Number(user.balance);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Please deposit funds before playing.');
    }

    // A country-specific (or otherwise substitute) uid Oracle wants used
    // only for the actual launch call — see the GameOverride model comment.
    // Everything else (catalog, history, GameTransaction) keeps using the
    // real gameUid; handleCallback translates Oracle's response back.
    const launchGameUid = override?.overrideGameUid || gameUid;
    const payload = { username: gameAccount, amount, game_uid: launchGameUid };
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

  // 9Wicket has its own dedicated launch endpoint and response shape — see
  // the constant comment above launchGame. Bet settlement itself still goes
  // through the same shared handleCallback() as every other provider.
  private async launchNineWicket(id: bigint) {
    const [user, nineWicketAccount, override] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id } }),
      this.ensureNineWicketAccount(id),
      this.prisma.gameOverride.findUnique({
        where: { gameUid: NINE_WICKET_GAME_UID },
      }),
    ]);

    if (override?.isActive === false) {
      throw new BadRequestException('This game is currently unavailable.');
    }

    const amount = Number(user.balance);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Please deposit funds before playing.');
    }

    const payload = { username: nineWicketAccount, amount };
    const isDev = process.env.NODE_ENV !== 'production';

    type NineWicketLaunchResponse = {
      transfer_amount?: number;
      transfer_status?: number;
      game_url?: string;
    };
    let res: Response;
    let data: NineWicketLaunchResponse | null = null;
    try {
      res = await fetch(`${this.baseUrl}/ninewicket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-oracle-key': this.apiKey,
        },
        body: JSON.stringify(payload),
      });
      data = (await res
        .json()
        .catch(() => null)) as NineWicketLaunchResponse | null;
    } catch (err) {
      const e = err as Error;
      this.logger.error(
        `ninewicket request errored for user ${id}. Request: ${JSON.stringify(payload)} ` +
          `Error: ${e.message}\n${e.stack}`,
      );
      throw new BadRequestException({
        message: "Couldn't launch this game right now.",
        ...(isDev ? { oracleResponse: { error: e.message } } : {}),
      });
    }

    const isSuccess = data?.transfer_status === 1;
    const gameUrl = data?.game_url;

    if (!res.ok || !isSuccess || !gameUrl) {
      this.logger.error(
        `ninewicket failed for user ${id}. Request: ${JSON.stringify(payload)} ` +
          `Response (${res.status}): ${JSON.stringify(data)}`,
      );
      throw new BadRequestException({
        message: "Couldn't launch this game right now.",
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

  /**
   * Every public-facing read (catalog browsing, search, provider lists,
   * launch) goes through this instead of ensureCatalog() directly — it
   * strips games a CRM admin has deactivated (see GameOverride.isActive).
   * Admin-facing reads (adminListGames) and historical lookups (game
   * history labels, bonus turnover categorization) intentionally keep
   * using ensureCatalog() directly so a deactivated game still resolves
   * correctly for bets that already happened.
   *
   * Deliberately checked against getDeactivatedGameUids() (a cheap, short-TTL
   * DB read) rather than each game's own baked-in `isActive` — that field is
   * only as fresh as the last full catalog rebuild, which re-sweeps every
   * Oracle provider live and can take a long time. Gating on the DB instead
   * means a CRM deactivate/reactivate takes effect in seconds, not whenever
   * the next full rebuild happens to finish.
   */
  private async ensurePublicCatalog(): Promise<CatalogGame[]> {
    const [all, deactivated] = await Promise.all([
      this.ensureCatalog(),
      this.getDeactivatedGameUids(),
    ]);
    return all.filter((g) => !deactivated.has(g.gameUid));
  }

  private deactivatedCache: { uids: Set<string>; fetchedAt: number } | null = null;
  private static readonly DEACTIVATED_TTL_MS = 5_000;

  private async getDeactivatedGameUids(): Promise<Set<string>> {
    if (
      this.deactivatedCache &&
      Date.now() - this.deactivatedCache.fetchedAt < GamesService.DEACTIVATED_TTL_MS
    ) {
      return this.deactivatedCache.uids;
    }
    const rows = await this.prisma.gameOverride.findMany({
      where: { isActive: false },
      select: { gameUid: true },
    });
    const uids = new Set(rows.map((r) => r.gameUid));
    this.deactivatedCache = { uids, fetchedAt: Date.now() };
    return uids;
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
    const [providers, featuredUids, overrides] = await Promise.all([
      this.getProviders() as Promise<
        Array<{ code: string; name: string; status: number }>
      >,
      this.getFeaturedGameUids().catch((err) => {
        this.logger.warn(
          `Catalog build: couldn't compute featured games (${(err as Error).message})`,
        );
        return new Set<string>();
      }),
      this.prisma.gameOverride.findMany().catch((err) => {
        this.logger.warn(
          `Catalog build: couldn't load game overrides (${(err as Error).message})`,
        );
        return [] as Awaited<ReturnType<typeof this.prisma.gameOverride.findMany>>;
      }),
    ]);
    const active = Array.isArray(providers)
      ? providers.filter((p) => p.status === 1)
      : [];

    const overrideByUid = new Map(overrides.map((o) => [o.gameUid, o]));
    const nextReverseMap = new Map<string, string>();
    for (const o of overrides) {
      if (o.overrideGameUid) nextReverseMap.set(o.overrideGameUid, o.gameUid);
    }
    this.overrideReverseMap = nextReverseMap;

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
        // 9Wicket publishes no per-title catalog at all (getProviderGames
        // always returns an empty games list for it) — synthesize the one
        // card it needs so it flows through the exact same pipeline
        // (category, overrides, isActive, thumbnail) as every real game.
        const games =
          provider.code.trim().toUpperCase() === NINE_WICKET_PROVIDER_CODE &&
          !(data.games ?? []).length
            ? [
                {
                  name: '9Wicket',
                  game_uid: NINE_WICKET_GAME_UID,
                  category: 'Sports',
                  thumbnail: '',
                  original: '',
                  status: 1,
                },
              ]
            : (data.games ?? []);
        for (const g of games) {
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
          const override = overrideByUid.get(g.game_uid);
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
              // Staff-set replacement for a broken image — see GameOverride.
              thumbnail: override?.overrideThumbnail || g.thumbnail,
              original: override?.overrideThumbnail || g.original,
              isActive: override?.isActive ?? true,
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
    const games = await this.ensurePublicCatalog();
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
    const games = await this.ensurePublicCatalog();
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
    const games = await this.ensurePublicCatalog();
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
    const games = await this.ensurePublicCatalog();
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
    const games = await this.ensurePublicCatalog();
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
    const games = await this.ensurePublicCatalog();
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
    const games = await this.ensurePublicCatalog();
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
      game_round,
      currency_code,
    } = payload;
    // If this bet was launched with a substitute uid (see GameOverride /
    // launchGame), Oracle's callback echoes that substitute back — translate
    // it back to the real/canonical gameUid so GameTransaction, history, and
    // category lookups all stay keyed the same way regardless of whether an
    // override was involved.
    const game_uid = this.overrideReverseMap.get(payload.game_uid) ?? payload.game_uid;
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
        // member_account matches gameAccount for every provider except
        // 9Wicket, which launches with the separate 6-char
        // nineWicketAccount instead (see launchNineWicket) — falls back to
        // it here so 9Wicket callbacks settle through the exact same path
        // as everyone else.
        const user = await tx.user.findFirst({
          where: {
            OR: [
              { gameAccount: member_account },
              { nineWicketAccount: member_account },
            ],
          },
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

        try {
          await this.agentsService.recordLossCommission(
            result.userId,
            new Prisma.Decimal(bet_amount),
            new Prisma.Decimal(win_amount || 0),
            result.gameTransactionId,
          );
        } catch (err) {
          this.logger.error(
            `Agent commission failed for user ${result.userId}: ${(err as Error).message}`,
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

  // --- Admin (CRM) — Games section ---
  // Reads merge the live Oracle catalog (unpaginated in memory) with the
  // small game_overrides table; writes only ever touch game_overrides —
  // the catalog itself is never written to, matching how every other
  // catalog consumer in this file works (10-minute cache, refreshed from
  // Oracle, never persisted).

  async adminListGames(params: {
    q?: string;
    page?: number;
    pageSize?: number;
    status?: 'active' | 'inactive';
  }) {
    // Deliberately the full catalog, not ensurePublicCatalog() — staff need
    // to see (and re-activate) games they've deactivated, not just the ones
    // currently live on the site.
    const [catalog, deactivated] = await Promise.all([
      this.ensureCatalog(),
      this.getDeactivatedGameUids(),
    ]);

    // Catalog can list the same gameUid more than once (a title forced into
    // two categories — see buildCatalog's pinned-category comment); the
    // admin list is about the game itself, not per-category rows.
    const seen = new Set<string>();
    const deduped: CatalogGame[] = [];
    for (const g of catalog) {
      if (seen.has(g.gameUid)) continue;
      seen.add(g.gameUid);
      deduped.push(g);
    }

    // Same reasoning as ensurePublicCatalog() — a game's own `isActive` is
    // only as fresh as the last full catalog rebuild, so the CRM table
    // would otherwise keep showing the pre-toggle state for as long as that
    // rebuild takes. Checking the live deactivated-uid set instead means
    // the table (and its Active/Deactivated counts) reflects a toggle on
    // the very next load.
    const isActive = (g: CatalogGame) => !deactivated.has(g.gameUid);

    // Global counts (unaffected by search/status filters below) — powers
    // the "Active / Deactivated" tabs in the CRM.
    const activeCount = deduped.filter(isActive).length;
    const inactiveCount = deduped.length - activeCount;

    const q = params.q?.trim().toLowerCase();
    let filtered = q
      ? deduped.filter(
          (g) => g.name.toLowerCase().includes(q) || g.gameUid.toLowerCase().includes(q),
        )
      : deduped;
    if (params.status === 'active') filtered = filtered.filter(isActive);
    else if (params.status === 'inactive') filtered = filtered.filter((g) => !isActive(g));

    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 200);
    const total = filtered.length;
    const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

    const overrides = await this.prisma.gameOverride.findMany({
      where: { gameUid: { in: pageRows.map((g) => g.gameUid) } },
    });
    const overrideByUid = new Map(overrides.map((o) => [o.gameUid, o]));

    return {
      total,
      activeCount,
      inactiveCount,
      games: pageRows.map((g) => {
        const override = overrideByUid.get(g.gameUid);
        return {
          gameUid: g.gameUid,
          name: g.name,
          providerName: g.providerName,
          category: g.category,
          thumbnail: g.thumbnail,
          overrideGameUid: override?.overrideGameUid ?? null,
          overrideThumbnail: override?.overrideThumbnail ?? null,
          isActive: isActive(g),
        };
      }),
    };
  }

  async adminSetGameOverride(
    gameUid: string,
    dto: { overrideGameUid?: string | null; overrideThumbnail?: string | null; name?: string; providerName?: string },
  ) {
    const overrideGameUid = dto.overrideGameUid?.trim() || null;
    const overrideThumbnail = dto.overrideThumbnail?.trim() || null;

    if (!overrideGameUid && !overrideThumbnail) {
      // A deactivated game (isActive: false) still needs its row kept —
      // only drop the row when there's truly nothing left on it to store.
      const existing = await this.prisma.gameOverride.findUnique({ where: { gameUid } });
      if (existing && existing.isActive === false) {
        await this.prisma.gameOverride.update({
          where: { gameUid },
          data: { overrideGameUid: null, overrideThumbnail: null },
        });
      } else {
        // Nothing left to override — remove the row instead of leaving an
        // empty one behind.
        await this.prisma.gameOverride.deleteMany({ where: { gameUid } });
      }
      // Same immediate-rebuild reasoning as the upsert branch below —
      // otherwise the stale override (wrong image/uid) keeps being served
      // from the in-memory catalog for up to 10 more minutes after staff
      // clear it.
      void this.rebuildCatalog();
      return { gameUid, overrideGameUid: null, overrideThumbnail: null };
    }

    const saved = await this.prisma.gameOverride.upsert({
      where: { gameUid },
      create: {
        gameUid,
        name: dto.name,
        providerName: dto.providerName,
        overrideGameUid,
        overrideThumbnail,
      },
      update: {
        overrideGameUid,
        overrideThumbnail,
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.providerName ? { providerName: dto.providerName } : {}),
      },
    });

    // The launch/callback path (overrideReverseMap) and catalog thumbnails
    // both read from the cache built at the last 10-minute refresh — force
    // an immediate rebuild so a staff edit takes effect right away instead
    // of waiting up to 10 minutes.
    void this.rebuildCatalog();

    return {
      gameUid: saved.gameUid,
      overrideGameUid: saved.overrideGameUid,
      overrideThumbnail: saved.overrideThumbnail,
    };
  }

  /**
   * The active/deactivate kill switch — independent of adminSetGameOverride
   * so toggling status never touches (or risks clobbering) an existing
   * image/uid override, and vice versa.
   */
  async adminSetGameStatus(
    gameUid: string,
    isActive: boolean,
    meta: { name?: string; providerName?: string },
  ) {
    const existing = await this.prisma.gameOverride.findUnique({ where: { gameUid } });

    if (isActive) {
      if (!existing) return { gameUid, isActive: true };
      if (!existing.overrideGameUid && !existing.overrideThumbnail) {
        // Reactivating with nothing else overridden on the row — remove it
        // instead of leaving a bare one behind (isActive already defaults
        // to true with no row at all).
        await this.prisma.gameOverride.deleteMany({ where: { gameUid } });
        this.deactivatedCache = null;
        void this.rebuildCatalog();
        return { gameUid, isActive: true };
      }
    }

    const saved = await this.prisma.gameOverride.upsert({
      where: { gameUid },
      create: { gameUid, name: meta.name, providerName: meta.providerName, isActive },
      update: {
        isActive,
        ...(meta.name ? { name: meta.name } : {}),
        ...(meta.providerName ? { providerName: meta.providerName } : {}),
      },
    });

    // Drop the short-TTL deactivated-uid cache so ensurePublicCatalog() picks
    // this up on its very next read instead of up to DEACTIVATED_TTL_MS
    // later. rebuildCatalog() is still triggered too, same as
    // adminSetGameOverride, for the game's other catalog fields.
    this.deactivatedCache = null;
    void this.rebuildCatalog();

    return { gameUid, isActive: saved.isActive };
  }
}
