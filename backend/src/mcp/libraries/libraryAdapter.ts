/**
 * Library adapter for MCP tools. Wraps the existing curated-library services
 * (search/inspect/cache) and adds canvas placement: reading a cached
 * `.excalidrawlib`, selecting items, regenerating ids, offsetting and
 * (optionally) normalizing them onto a target scene.
 */
import { promises as fs } from "fs";
import crypto from "crypto";
import type { ExcalidrawElement, ExcalidrawScene } from "../types";
import { notFound, invalid } from "../errors";
import { resolveCachePath, safeJsonParse } from "../../libraries/validators";
import { unionBBox, snapToGrid } from "../geometry/geometry";
import {
  cardBoxById,
  fitElementsInto,
  normalizeElements,
  slotForPlacement,
  tagItemElements,
  type Placement,
} from "./placement";
import type { CatalogService } from "../../libraries/catalogService";
import type { DownloadService } from "../../libraries/downloadService";
import type { LibrarySearchMode } from "../../libraries/types";
import {
  BUNDLED_LIBRARY_ID,
  BUNDLED_LIBRARY_NAME,
  buildBundledLibraryDocument,
  bundledCatalogDescriptor,
  bundledItemNames,
  isBundledId,
} from "../../libraries/bundled";

export interface LibraryItemDocument {
  name: string;
  elements: ExcalidrawElement[];
}

export interface LibraryAdapterDeps {
  catalogService: CatalogService;
  downloadService: DownloadService;
  cacheDir: string;
  defaultMode: LibrarySearchMode;
  publicSearchEnabled: boolean;
}

const newIdFactory = () => {
  let counter = 0;
  return (): string => {
    counter += 1;
    return `lib_${counter.toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
  };
};

export const createLibraryAdapter = (deps: LibraryAdapterDeps) => {
  const { catalogService, downloadService, cacheDir } = deps;

  const search = async (params: {
    query?: string;
    mode?: LibrarySearchMode;
    category?: string;
    limit?: number;
  }) => {
    const result = await catalogService.search({
      query: params.query,
      mode: params.mode ?? (deps.defaultMode as LibrarySearchMode),
      category: params.category,
      limit: params.limit,
    });
    // Offline fallback: when the remote catalog is empty / has no match, surface
    // the always-available bundled icon pack so callers never hit a dead end.
    if (result.count === 0) {
      const dto = bundledCatalogDescriptor();
      return {
        ...result,
        count: 1,
        results: [
          { ...dto, cached: true, sourceMode: "core" },
        ] as unknown as typeof result.results,
        warning:
          result.warning ??
          "Remote catalog empty/no match — showing the bundled offline icon pack.",
      };
    }
    return result;
  };

  const inspect = async (id: string, autoCache = false) => {
    if (isBundledId(id)) {
      return {
        id: BUNDLED_LIBRARY_ID,
        source: BUNDLED_LIBRARY_ID,
        name: BUNDLED_LIBRARY_NAME,
        cached: true,
        itemCount: bundledItemNames().length,
        itemNames: bundledItemNames(),
        provenance: "bundled",
      };
    }
    const dto = await catalogService.getById(id);
    if (!dto) throw notFound(`Library not found: ${id}`);
    if (!dto.cached && !autoCache) {
      return {
        ...dto,
        cached: false,
        hint: "Library is not cached. Call cache_library (or pass autoCache=true) to inspect its items.",
      };
    }
    const items = await downloadService.getItems(id);
    return { ...dto, cached: true, itemCount: items.itemCount, itemNames: items.itemNames };
  };

  const cache = (id: string) => {
    if (isBundledId(id)) {
      return Promise.resolve({
        id: BUNDLED_LIBRARY_ID,
        source: BUNDLED_LIBRARY_ID,
        cached: true,
        itemCount: bundledItemNames().length,
        fromBundle: true,
      });
    }
    return downloadService.cacheLibrary(id);
  };

  /** Ensure cached, then read + parse the raw `.excalidrawlib` document. */
  const getDocument = async (id: string): Promise<LibraryItemDocument[]> => {
    if (isBundledId(id)) {
      return buildBundledLibraryDocument().libraryItems.map((item) => ({
        name: item.name,
        elements: item.elements as unknown as ExcalidrawElement[],
      }));
    }
    const dto = await catalogService.getById(id);
    if (!dto) throw notFound(`Library not found: ${id}`);
    const cachePath = resolveCachePath(cacheDir, dto.source);
    let text: string | null = null;
    try {
      text = await fs.readFile(cachePath, "utf8");
    } catch {
      await downloadService.cacheLibrary(id);
      text = await fs.readFile(cachePath, "utf8");
    }
    const parsed = safeJsonParse<Record<string, unknown>>(text);
    if (!parsed.ok || !parsed.value) {
      throw invalid(`Cached library is not valid JSON: ${dto.source}`);
    }
    const data = parsed.value;
    if (Array.isArray(data.libraryItems)) {
      return (data.libraryItems as Array<Record<string, unknown>>).map(
        (item, index) => ({
          name:
            typeof item.name === "string" && item.name
              ? item.name
              : `Item ${index + 1}`,
          elements: Array.isArray(item.elements)
            ? (item.elements as ExcalidrawElement[])
            : [],
        }),
      );
    }
    if (Array.isArray(data.library)) {
      return (data.library as ExcalidrawElement[][]).map((elements, index) => ({
        name: `Item ${index + 1}`,
        elements: Array.isArray(elements) ? elements : [],
      }));
    }
    return [];
  };

  const selectItems = (
    documents: LibraryItemDocument[],
    selection: { itemNames?: string[]; indexes?: number[]; limit?: number },
  ): LibraryItemDocument[] => {
    let chosen = documents;
    if (selection.itemNames && selection.itemNames.length > 0) {
      const wanted = new Set(
        selection.itemNames.map((s) => s.toLowerCase().trim()),
      );
      chosen = documents.filter((doc) => wanted.has(doc.name.toLowerCase().trim()));
    } else if (selection.indexes && selection.indexes.length > 0) {
      chosen = selection.indexes
        .map((i) => documents[i])
        .filter((doc): doc is LibraryItemDocument => Boolean(doc));
    }
    return chosen.slice(0, selection.limit ?? 25);
  };

  /** Clone an item's elements with fresh ids, a shared group, and an offset. */
  const placeItem = (
    item: LibraryItemDocument,
    offset: { x: number; y: number },
    groupId: string,
    nextId: () => string,
  ): ExcalidrawElement[] => {
    const idMap = new Map<string, string>();
    for (const el of item.elements) {
      if (el.id) idMap.set(el.id, nextId());
    }
    const box = unionBBox(item.elements as ExcalidrawElement[]) ?? {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    };
    const dx = offset.x - box.minX;
    const dy = offset.y - box.minY;
    return item.elements.map((original) => {
      const el: ExcalidrawElement = JSON.parse(JSON.stringify(original));
      el.id = idMap.get(original.id) ?? nextId();
      el.x = (typeof el.x === "number" ? el.x : 0) + dx;
      el.y = (typeof el.y === "number" ? el.y : 0) + dy;
      el.groupIds = [...(el.groupIds ?? []), groupId];
      if (el.containerId && idMap.has(el.containerId)) {
        el.containerId = idMap.get(el.containerId)!;
      }
      if (el.boundElements) {
        el.boundElements = el.boundElements
          .map((b) => ({ ...b, id: idMap.get(b.id) ?? b.id }))
          .filter((b) => b.id);
      }
      if (el.startBinding?.elementId && idMap.has(el.startBinding.elementId)) {
        el.startBinding = {
          ...el.startBinding,
          elementId: idMap.get(el.startBinding.elementId)!,
        };
      }
      if (el.endBinding?.elementId && idMap.has(el.endBinding.elementId)) {
        el.endBinding = {
          ...el.endBinding,
          elementId: idMap.get(el.endBinding.elementId)!,
        };
      }
      return el;
    });
  };

  /**
   * Add selected library items onto a scene. With normalization + a placement,
   * items are scaled/snapped and dropped into reserved icon slots (inside a
   * card, as a badge, as an actor/database/cloud symbol) instead of tiled
   * randomly. Every placed element is tagged with provenance metadata so the
   * scene reports real library usage.
   */
  const addItems = async (params: {
    scene: ExcalidrawScene;
    libraryId: string;
    itemNames?: string[];
    indexes?: number[];
    position?: { x: number; y: number };
    spacing?: number;
    limit?: number;
    normalize?: boolean;
    grid?: number;
    minFontSize?: number;
    placement?: Placement;
    targetCardId?: string;
    slotSize?: number;
    frameId?: string | null;
    strokeColor?: string;
  }): Promise<{
    scene: ExcalidrawScene;
    addedItems: number;
    addedElements: number;
    items: Array<{ name: string; placement: Placement }>;
    librariesUsed: string[];
  }> => {
    const documents = await getDocument(params.libraryId);
    const chosen = selectItems(documents, {
      itemNames: params.itemNames,
      indexes: params.indexes,
      limit: params.limit,
    });
    if (chosen.length === 0) {
      throw invalid("No matching library items were found to add.");
    }
    const nextId = newIdFactory();
    const grid = params.grid ?? 20;
    const spacing = params.spacing ?? 40;
    const base = params.position ?? { x: 0, y: 0 };
    const placement: Placement = params.placement ?? "grid";
    const slotSize = params.slotSize ?? 28;
    const perRow = 4;
    const cellW = 220;
    const cellH = 200;

    const cardBox =
      params.targetCardId != null
        ? cardBoxById(params.scene.elements, params.targetCardId)
        : null;
    const isSlot =
      cardBox != null &&
      (placement === "inside-card-left" ||
        placement === "inside-card-top" ||
        placement === "badge");

    const added: ExcalidrawElement[] = [];
    const items: Array<{ name: string; placement: Placement }> = [];

    chosen.forEach((item, index) => {
      const groupId = `grp_${nextId()}`;
      let els: ExcalidrawElement[];
      let used: Placement;
      if (isSlot && index === 0) {
        els = placeItem(item, { x: 0, y: 0 }, groupId, nextId);
        els = fitElementsInto(els, slotForPlacement(cardBox!, placement, slotSize));
        used = placement;
      } else {
        const col = index % perRow;
        const row = Math.floor(index / perRow);
        const offset = {
          x: snapToGrid(base.x + col * (cellW + spacing), grid),
          y: snapToGrid(base.y + row * (cellH + spacing), grid),
        };
        els = placeItem(item, offset, groupId, nextId);
        used = isSlot ? "grid" : placement;
      }
      if (params.frameId != null) {
        els = els.map((e) => ({ ...e, frameId: params.frameId ?? null }));
      }
      els = tagItemElements(els, {
        library: params.libraryId,
        item: item.name,
        placement: used,
      });
      if (params.normalize) {
        els = normalizeElements(els, {
          grid,
          minFontSize: params.minFontSize ?? 16,
          strokeColor: params.strokeColor,
        });
      }
      added.push(...els);
      items.push({ name: item.name, placement: used });
    });

    const scene: ExcalidrawScene = {
      ...params.scene,
      elements: [...params.scene.elements, ...added],
    };
    return {
      scene,
      addedItems: chosen.length,
      addedElements: added.length,
      items,
      librariesUsed: [params.libraryId],
    };
  };

  return { search, inspect, cache, getDocument, addItems };
};

export type LibraryAdapter = ReturnType<typeof createLibraryAdapter>;
