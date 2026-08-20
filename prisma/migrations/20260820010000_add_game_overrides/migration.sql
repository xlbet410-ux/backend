-- Staff-editable per-game fixes layered on top of Oracle's live catalog —
-- a replacement thumbnail for a broken image, and/or a different launch
-- uid for a game that needs a country-specific Oracle variant. The catalog
-- itself stays entirely in-memory/fetched-from-Oracle; this table only
-- holds the small number of manual overrides staff actually set.
CREATE TABLE "game_overrides" (
    "id" BIGSERIAL NOT NULL,
    "game_uid" VARCHAR(200) NOT NULL,
    "name" VARCHAR(200),
    "provider_name" VARCHAR(100),
    "override_game_uid" VARCHAR(200),
    "override_thumbnail" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "game_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "game_overrides_game_uid_key" ON "game_overrides"("game_uid");
CREATE INDEX "game_overrides_override_game_uid_idx" ON "game_overrides"("override_game_uid");
