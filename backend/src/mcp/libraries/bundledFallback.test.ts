import { describe, expect, it } from "vitest";
import { createLibraryAdapter } from "./libraryAdapter";
import { BUNDLED_LIBRARY_ID, buildBundledLibraryDocument } from "../../libraries/bundled";
import type { CatalogService } from "../../libraries/catalogService";
import type { DownloadService } from "../../libraries/downloadService";

// Stub services simulating an EMPTY / offline remote catalog. The bundled paths
// short-circuit before touching these, except search (which sees count: 0).
const emptyCatalog = {
  search: async () => ({
    query: "",
    category: null,
    publicSearchEnabled: false,
    mode: "all",
    count: 0,
    results: [],
  }),
  getById: async () => null,
} as unknown as CatalogService;

const stubDownload = {
  cacheLibrary: async () => {
    throw new Error("network unavailable");
  },
  getItems: async () => ({ itemCount: 0, itemNames: [] }),
} as unknown as DownloadService;

const adapter = () =>
  createLibraryAdapter({
    catalogService: emptyCatalog,
    downloadService: stubDownload,
    cacheDir: "/tmp/does-not-exist",
    defaultMode: "all",
    publicSearchEnabled: false,
  });

describe("bundled library offline fallback", () => {
  it("the bundled document has icon items with elements", () => {
    const doc = buildBundledLibraryDocument();
    expect(doc.libraryItems.length).toBeGreaterThanOrEqual(20);
    expect(doc.libraryItems.every((i) => i.elements.length > 0)).toBe(true);
    expect(doc.libraryItems.some((i) => i.name === "PostgreSQL")).toBe(true);
  });

  it("search surfaces the bundled pack when the remote catalog is empty", async () => {
    const res = await adapter().search({ query: "postgres" });
    expect(res.count).toBe(1);
    expect((res.results[0] as { id: string }).id).toBe(BUNDLED_LIBRARY_ID);
  });

  it("cache_library does not 404 for the bundled pack (no network)", async () => {
    const res = await adapter().cache(BUNDLED_LIBRARY_ID);
    expect((res as { cached?: boolean }).cached).toBe(true);
    expect((res as { fromBundle?: boolean }).fromBundle).toBe(true);
  });

  it("inspect returns bundled item names offline", async () => {
    const res = await adapter().inspect(BUNDLED_LIBRARY_ID);
    expect((res as { itemNames: string[] }).itemNames).toContain("PostgreSQL");
  });

  it("addItems injects real bundled elements into a scene offline", async () => {
    const scene = {
      type: "excalidraw" as const,
      version: 2,
      source: "test",
      elements: [],
      appState: {},
      files: {},
    };
    const result = await adapter().addItems({
      libraryId: BUNDLED_LIBRARY_ID,
      itemNames: ["PostgreSQL", "Redis"],
      scene,
      placement: "grid",
    });
    expect(result.scene.elements.length).toBeGreaterThan(0);
    const tagged = result.scene.elements.some(
      (el) =>
        (el as { customData?: { excalidash?: { library?: string } } }).customData
          ?.excalidash?.library === BUNDLED_LIBRARY_ID,
    );
    expect(tagged).toBe(true);
  });
});
