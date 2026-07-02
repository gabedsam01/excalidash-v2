/**
 * Curated Excalidraw packs were removed from ExcaliDash V2.
 *
 * The app now keeps only the user's own Excalidraw personal library/templates
 * (stored in the `Library` model through `/library`). This service remains as a
 * compatibility shim so older routes/tests/imports keep compiling while every
 * curated-pack operation becomes a deterministic no-op.
 */
import type { LibraryItemDto, LibraryPrisma, PackLibrary, PackSeedDiagnostics } from "./types";

export interface PackSummary {
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  itemCount: number;
}

export interface SpecializedCategorySummary extends PackSummary {
  category: string | null;
}

export interface PacksOverview {
  core: PackSummary | null;
  specialized:
    | (PackSummary & {
        categoryCount: number;
        categories: SpecializedCategorySummary[];
      })
    | null;
}

export interface PackDetail extends PackSummary {
  kind: string;
  category: string | null;
  libraries: LibraryItemDto[];
}

export interface PackService {
  seedPacks(): Promise<number>;
  reseedMembership(): Promise<PackSeedDiagnostics>;
  listPacks(): Promise<PacksOverview>;
  getPack(slug: string): Promise<PackDetail | null>;
  getPackLibraries(slug: string): Promise<PackLibrary[]>;
  getSpecializedLibraries(categorySlug: string | null): Promise<PackLibrary[]>;
  getLibraryMembership(libraryId: string): Promise<{ inCore: boolean; categories: string[] }>;
}

const EMPTY_DIAGNOSTICS: PackSeedDiagnostics = {
  packsEnsured: 0,
  membershipResolved: 0,
  missing: [],
  skippedReason: "Curated library packs are disabled; only user-owned templates are supported.",
};

export const createPackService = (_deps: {
  prisma: LibraryPrisma;
  logger?: Pick<Console, "warn" | "info">;
}): PackService => {
  const seedPacks = async (): Promise<number> => 0;

  const reseedMembership = async (): Promise<PackSeedDiagnostics> => ({
    ...EMPTY_DIAGNOSTICS,
  });

  const listPacks = async (): Promise<PacksOverview> => ({
    core: null,
    specialized: null,
  });

  const getPack = async (_slug: string): Promise<PackDetail | null> => null;

  const getPackLibraries = async (_slug: string): Promise<PackLibrary[]> => [];

  const getSpecializedLibraries = async (_categorySlug: string | null): Promise<PackLibrary[]> => [];

  const getLibraryMembership = async (_libraryId: string): Promise<{ inCore: boolean; categories: string[] }> => ({
    inCore: false,
    categories: [],
  });

  return {
    seedPacks,
    reseedMembership,
    listPacks,
    getPack,
    getPackLibraries,
    getSpecializedLibraries,
    getLibraryMembership,
  };
};
