/**
 * Element provenance/role metadata, stored under `customData.excalidash` so it
 * round-trips through `.excalidraw` files and survives clone/normalize. Used to
 * tell whether a scene actually uses library items, to mark legends/icon slots,
 * and to record why a library item was used or rejected.
 */
import type { ExcalidrawElement } from "../types";

export type ElementRole =
  | "legend"
  | "legend-item"
  | "icon"
  | "actor"
  | "database-symbol"
  | "cloud-provider"
  | "badge"
  | "zone-title";

export interface ExcalidashMeta {
  library?: string;
  item?: string;
  role?: ElementRole;
  placement?: string;
}

const read = (el: ExcalidrawElement): ExcalidashMeta | undefined => {
  const data = (el as { customData?: { excalidash?: ExcalidashMeta } })
    .customData;
  return data && typeof data === "object" ? data.excalidash : undefined;
};

export const tagElement = (
  el: ExcalidrawElement,
  meta: ExcalidashMeta,
): ExcalidrawElement => {
  const existing =
    (el as { customData?: Record<string, unknown> }).customData ?? {};
  (el as { customData?: Record<string, unknown> }).customData = {
    ...existing,
    excalidash: { ...read(el), ...meta },
  };
  return el;
};

export const metaOf = (el: ExcalidrawElement): ExcalidashMeta | undefined =>
  read(el);

export const isLibraryElement = (el: ExcalidrawElement): boolean =>
  Boolean(read(el)?.library) || el.type === "image";

export const roleOf = (el: ExcalidrawElement): ElementRole | undefined =>
  read(el)?.role;

export const isLegendElement = (el: ExcalidrawElement): boolean => {
  const role = roleOf(el);
  if (role === "legend" || role === "legend-item") return true;
  if (el.type === "text" && /\blegend\b/i.test(String(el.text ?? ""))) {
    return true;
  }
  if (el.type === "frame" && /\blegend\b/i.test(String(el.name ?? ""))) {
    return true;
  }
  return false;
};
