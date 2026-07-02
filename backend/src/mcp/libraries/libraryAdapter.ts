/**
 * MCP library adapter backed by the authenticated user's personal Excalidraw
 * library (`/library`) instead of the removed curated/public catalog.
 */
import crypto from "crypto";
import type { ExcalidrawElement, ExcalidrawScene } from "../types";
import { invalid, notFound } from "../errors";
import { unionBBox, snapToGrid } from "../geometry/geometry";
import {
  cardBoxById,
  fitElementsInto,
  normalizeElements,
  slotForPlacement,
  tagItemElements,
  type Placement,
} from "./placement";

export interface LibraryItemDocument {
  name: string;
  elements: ExcalidrawElement[];
}

export interface LibraryAdapterDeps {
  prisma: {
    library: {
      findUnique(args: { where: { id: string } }): Promise<{ id: string; items: string } | null>;
    };
  };
  userId: string;
}

const PERSONAL_LIBRARY_ID = "personal";

const newIdFactory = () => {
  let counter = 0;
  return (): string => {
    counter += 1;
    return `lib_${counter.toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
  };
};

const parseItems = (raw: string | null | undefined): unknown[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const textPreview = (elements: ExcalidrawElement[]): string | null => {
  const text = elements.find((el) => typeof (el as { text?: unknown }).text === "string") as
    | { text?: string }
    | undefined;
  const value = text?.text?.trim();
  return value ? value.slice(0, 80) : null;
};

const itemToDocument = (item: unknown, index: number): LibraryItemDocument | null => {
  let elements: ExcalidrawElement[] = [];
  let explicitName: string | null = null;

  if (Array.isArray(item)) {
    elements = item as ExcalidrawElement[];
  } else if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    if (Array.isArray(record.elements)) {
      elements = record.elements as ExcalidrawElement[];
    } else if (Array.isArray(record.libraryItems)) {
      const nested = record.libraryItems[index] as Record<string, unknown> | undefined;
      if (nested && Array.isArray(nested.elements)) {
        elements = nested.elements as ExcalidrawElement[];
      }
    }
    if (typeof record.name === "string" && record.name.trim()) {
      explicitName = record.name.trim();
    }
  }

  if (!Array.isArray(elements) || elements.length === 0) return null;
  return {
    name: explicitName ?? textPreview(elements) ?? `Personal template ${index + 1}`,
    elements,
  };
};

export const createLibraryAdapter = (deps: LibraryAdapterDeps) => {
  const userLibraryId = `user_${deps.userId}`;

  const getDocument = async (id = PERSONAL_LIBRARY_ID): Promise<LibraryItemDocument[]> => {
    if (id !== PERSONAL_LIBRARY_ID && id !== userLibraryId) {
      throw notFound(`Personal library not found: ${id}`);
    }

    const library = await deps.prisma.library.findUnique({ where: { id: userLibraryId } });
    const items = parseItems(library?.items);
    return items
      .map((item, index) => itemToDocument(item, index))
      .filter((item): item is LibraryItemDocument => Boolean(item));
  };

  const search = async (params: { query?: string; limit?: number }) => {
    const documents = await getDocument(PERSONAL_LIBRARY_ID);
    const query = params.query?.trim().toLowerCase() ?? "";
    const filtered = query
      ? documents.filter((item) => item.name.toLowerCase().includes(query))
      : documents;
    const limited = filtered.slice(0, params.limit ?? 25);

    if (limited.length === 0) {
      return {
        mode: "personal",
        query,
        category: null,
        publicSearchEnabled: false,
        count: 0,
        results: [],
        warning: "No personal templates found. Save templates in your Excalidraw personal library first.",
      };
    }

    return {
      mode: "personal",
      query,
      category: null,
      publicSearchEnabled: false,
      count: 1,
      results: [
        {
          id: PERSONAL_LIBRARY_ID,
          name: "Personal Library",
          slug: PERSONAL_LIBRARY_ID,
          description: "Templates saved by the authenticated user in ExcaliDash/Excalidraw.",
          sourceMode: "personal",
          category: "personal",
          curated: false,
          source: userLibraryId,
          itemNames: limited.map((item) => item.name),
          cached: true,
        },
      ],
    };
  };

  const inspect = async (id: string) => {
    const documents = await getDocument(id);
    return {
      id: PERSONAL_LIBRARY_ID,
      source: userLibraryId,
      name: "Personal Library",
      cached: true,
      itemCount: documents.length,
      itemNames: documents.map((item) => item.name),
      provenance: "user-personal-library",
    };
  };

  const cache = async (id: string) => {
    const documents = await getDocument(id);
    return {
      id: PERSONAL_LIBRARY_ID,
      source: userLibraryId,
      cached: true,
      itemCount: documents.length,
      fromUserLibrary: true,
    };
  };

  const selectItems = (
    documents: LibraryItemDocument[],
    selection: { itemNames?: string[]; indexes?: number[]; limit?: number },
  ): LibraryItemDocument[] => {
    let chosen = documents;
    if (selection.itemNames && selection.itemNames.length > 0) {
      const wanted = new Set(selection.itemNames.map((s) => s.toLowerCase().trim()));
      chosen = documents.filter((doc) => wanted.has(doc.name.toLowerCase().trim()));
    } else if (selection.indexes && selection.indexes.length > 0) {
      chosen = selection.indexes.map((i) => documents[i]).filter((doc): doc is LibraryItemDocument => Boolean(doc));
    }
    return chosen.slice(0, selection.limit ?? 25);
  };

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
        el.boundElements = el.boundElements.map((b) => ({ ...b, id: idMap.get(b.id) ?? b.id })).filter((b) => b.id);
      }
      if (el.startBinding?.elementId && idMap.has(el.startBinding.elementId)) {
        el.startBinding = { ...el.startBinding, elementId: idMap.get(el.startBinding.elementId)! };
      }
      if (el.endBinding?.elementId && idMap.has(el.endBinding.elementId)) {
        el.endBinding = { ...el.endBinding, elementId: idMap.get(el.endBinding.elementId)! };
      }
      return el;
    });
  };

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
    const documents = await getDocument(params.libraryId || PERSONAL_LIBRARY_ID);
    const chosen = selectItems(documents, {
      itemNames: params.itemNames,
      indexes: params.indexes,
      limit: params.limit,
    });
    if (chosen.length === 0) {
      throw invalid("No matching personal library items were found to add.");
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

    const cardBox = params.targetCardId != null ? cardBoxById(params.scene.elements, params.targetCardId) : null;
    const isSlot =
      cardBox != null &&
      (placement === "inside-card-left" || placement === "inside-card-top" || placement === "badge");

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
        library: PERSONAL_LIBRARY_ID,
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
      librariesUsed: [PERSONAL_LIBRARY_ID],
    };
  };

  return { search, inspect, cache, getDocument, addItems };
};

export type LibraryAdapter = ReturnType<typeof createLibraryAdapter>;
