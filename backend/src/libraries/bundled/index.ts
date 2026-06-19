/**
 * Bundled library fallback. Exposes the offline icon set both as injectable
 * glyphs (via conceptIndex) and as a synthetic `.excalidrawlib`-shaped document
 * + catalog descriptor, so `search_libraries` / `cache_library` can serve it
 * when the remote catalog is empty or unreachable.
 *
 * Synthetic ids use the `bundled:` prefix so the adapter/catalog can recognise
 * them and serve from memory instead of the network/disk cache.
 */
import { BUNDLED_ICONS, type RawElement } from "./glyphs";

/** Prefix that marks a library/catalog id as served from the in-memory bundle. */
export const BUNDLED_PREFIX = "bundled:";

/** The single bundled icon library id. */
export const BUNDLED_LIBRARY_ID = `${BUNDLED_PREFIX}excalidash-icons`;

export const BUNDLED_LIBRARY_NAME = "ExcaliDash Bundled Icons";

/** A v2 `.excalidrawlib` libraryItem. */
export interface BundledLibraryItem {
  id: string;
  status: "published";
  name: string;
  elements: RawElement[];
  created: number;
}

/** The v2 `.excalidrawlib` document for the bundled set. */
export interface BundledLibraryDocument {
  type: "excalidrawlib";
  version: 2;
  source: string;
  libraryItems: BundledLibraryItem[];
}

/** Build the synthetic `.excalidrawlib` document (fresh elements each call). */
export const buildBundledLibraryDocument = (): BundledLibraryDocument => ({
  type: "excalidrawlib",
  version: 2,
  source: BUNDLED_LIBRARY_ID,
  libraryItems: BUNDLED_ICONS.map((icon) => ({
    id: `${BUNDLED_PREFIX}${icon.id}`,
    status: "published",
    name: icon.name,
    elements: icon.build(),
    created: 1,
  })),
});

/** Flat list of item names the bundled library provides (for text matching). */
export const bundledItemNames = (): string[] =>
  BUNDLED_ICONS.map((icon) => icon.name);

/** True when a library/catalog id is served from the in-memory bundle. */
export const isBundledId = (id: string | null | undefined): boolean =>
  typeof id === "string" && id.startsWith(BUNDLED_PREFIX);

/**
 * Synthetic catalog descriptor mirroring the remote catalog entry shape closely
 * enough for `search_libraries` to surface it as a curated, offline pack.
 */
export const bundledCatalogDescriptor = () => ({
  id: BUNDLED_LIBRARY_ID,
  source: BUNDLED_LIBRARY_ID,
  name: BUNDLED_LIBRARY_NAME,
  description:
    "Offline fallback icon set: databases, caches, queues, APIs, frontends, " +
    "containers, servers, users and auth — clean native vector glyphs.",
  authorNames: ["ExcaliDash"],
  itemNames: bundledItemNames(),
  category: "core",
  isCurated: true,
  provenance: "bundled" as const,
  itemCount: BUNDLED_ICONS.length,
});

export { BUNDLED_ICONS };
