/**
 * Curated-library seeding is intentionally disabled.
 *
 * ExcaliDash V2 now relies on user-owned personal templates/libraries instead
 * of seeding the official Excalidraw catalog into PostgreSQL.
 */
import type { CatalogService } from "./catalogService";
import type { PackService } from "./packService";
import type { LibrarySeedResult } from "./types";

export interface SeedDeps {
  catalogService: CatalogService;
  packService: PackService;
  refresh?: boolean;
  logger?: Pick<Console, "warn" | "info" | "error">;
}

export const seedLibraries = async (_deps: SeedDeps): Promise<LibrarySeedResult> => ({
  catalog: {
    skipped: true,
    reason: "Curated catalog seeding is disabled; use user-owned templates/libraries.",
  },
  packs: {
    packsEnsured: 0,
    membershipResolved: 0,
    missing: [],
    skippedReason: "Curated library packs are disabled.",
  },
});
