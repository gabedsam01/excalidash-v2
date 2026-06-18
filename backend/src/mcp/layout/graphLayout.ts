/**
 * Layered graph layout (Sugiyama-lite). Turns nodes + edges into a clean,
 * on-grid Excalidraw scene with labeled cards and bound arrows. Used by
 * create_diagram_from_prompt, create_from_repo_analysis, convert_diagram_type
 * and apply_architecture_skill.
 */
import type { ExcalidrawElement, ExcalidrawScene } from "../types";
import { FONT_FAMILY, SceneBuilder, measureText } from "../excalidraw/elements";
import { snapToGrid } from "../geometry/geometry";
import type { VisualPreset } from "../templates/presets";

export interface GraphNode {
  id: string;
  label: string;
  group?: string;
  kind?: string;
  color?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
}

export interface LayoutOptions {
  preset: VisualPreset;
  title?: string;
  direction?: "TB" | "LR";
}

const seedFromNodes = (nodes: GraphNode[]): number => {
  let seed = 7;
  for (const node of nodes) {
    for (const ch of node.id + node.label) {
      seed = (seed * 31 + ch.charCodeAt(0)) % 2_147_483_647;
    }
  }
  return seed || 1;
};

/** Assign each node a layer index using longest-path from roots. */
const assignLayers = (
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, number> => {
  const ids = new Set(nodes.map((n) => n.id));
  const valid = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const incoming = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of ids) {
    incoming.set(id, 0);
    adj.set(id, []);
  }
  for (const edge of valid) {
    adj.get(edge.from)!.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const layer = new Map<string, number>();
  // Roots = no incoming edges (fall back to first node if all in a cycle).
  let queue = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  if (queue.length === 0 && nodes.length > 0) queue = [nodes[0].id];
  for (const id of queue) layer.set(id, 0);

  const remaining = new Map(incoming);
  const visited = new Set<string>();
  let guard = nodes.length * nodes.length + 10;
  while (queue.length > 0 && guard-- > 0) {
    const id = queue.shift()!;
    visited.add(id);
    const here = layer.get(id) ?? 0;
    for (const next of adj.get(id) ?? []) {
      layer.set(next, Math.max(layer.get(next) ?? 0, here + 1));
      const left = (remaining.get(next) ?? 1) - 1;
      remaining.set(next, left);
      if (left <= 0 && !visited.has(next)) queue.push(next);
    }
  }
  // Any unvisited (cycles / disconnected) get placed after their predecessors.
  for (const node of nodes) {
    if (!layer.has(node.id)) layer.set(node.id, 0);
  }
  return layer;
};

export const layoutGraph = (
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions,
): ExcalidrawScene => {
  const { preset } = options;
  const direction = options.direction ?? "TB";
  const builder = new SceneBuilder(seedFromNodes(nodes));
  builder.appState = {
    viewBackgroundColor: preset.background,
    gridSize: preset.grid,
  };

  const cardHeight = 64;
  const layerOf = assignLayers(nodes, edges);
  const maxLayer = Math.max(0, ...nodes.map((n) => layerOf.get(n.id) ?? 0));
  const layers: GraphNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const node of nodes) layers[layerOf.get(node.id) ?? 0].push(node);

  const cardWidth = (label: string): number => {
    const metrics = measureText(label, preset.labelFontSize, preset.fontFamily);
    return snapToGrid(Math.max(150, metrics.width + 48), preset.grid);
  };

  const titleOffset = options.title ? preset.titleFontSize + 40 : 0;
  const elementByNode = new Map<string, ExcalidrawElement>();

  layers.forEach((layerNodes, layerIndex) => {
    const widths = layerNodes.map((n) => cardWidth(n.label));
    const gap = preset.spacingX;
    const totalCross =
      widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, layerNodes.length - 1);
    let cursor = -totalCross / 2;

    layerNodes.forEach((node, indexInLayer) => {
      const w = widths[indexInLayer];
      const along = layerIndex * (cardHeight + preset.spacingY);
      let x: number;
      let y: number;
      if (direction === "TB") {
        x = snapToGrid(cursor, preset.grid);
        y = snapToGrid(along + titleOffset, preset.grid);
      } else {
        x = snapToGrid(along, preset.grid);
        y = snapToGrid(cursor + titleOffset, preset.grid);
      }
      const colorIndex = (node.group
        ? hashString(node.group)
        : layerIndex) % preset.palette.length;
      const { container } = builder.labeledShape({
        x,
        y,
        width: w,
        height: cardHeight,
        label: node.label,
        backgroundColor: node.color ?? preset.palette[colorIndex] ?? "transparent",
        strokeColor: preset.stroke,
        strokeWidth: preset.strokeWidth,
        roughness: preset.roughness,
        rounded: preset.rounded,
        fontSize: preset.labelFontSize,
        fontFamily: preset.fontFamily,
        labelColor: preset.textColor,
      });
      elementByNode.set(node.id, container);
      cursor += w + gap;
    });
  });

  // Title.
  if (options.title) {
    const metrics = measureText(
      options.title,
      preset.titleFontSize,
      preset.fontFamily,
    );
    const bounds = builder.elements
      .filter((el) => el.type !== "text")
      .reduce(
        (acc, el) => ({
          minX: Math.min(acc.minX, el.x),
          maxX: Math.max(acc.maxX, el.x + el.width),
        }),
        { minX: Infinity, maxX: -Infinity },
      );
    const centerX =
      Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX)
        ? (bounds.minX + bounds.maxX) / 2
        : 0;
    builder.text({
      x: snapToGrid(centerX - metrics.width / 2, preset.grid),
      y: 0,
      text: options.title,
      fontSize: preset.titleFontSize,
      fontFamily: preset.fontFamily,
      strokeColor: preset.textColor,
      textAlign: "center",
    });
  }

  // ----- Edges: route cleanly; keep labels OFF the arrow path. -----
  const ids = new Set(nodes.map((n) => n.id));
  const cards = builder.elements.filter(
    (el) => el.type !== "text" && el.type !== "arrow" && el.type !== "frame",
  );
  const bounds = cards.reduce(
    (acc, el) => ({
      minX: Math.min(acc.minX, el.x),
      minY: Math.min(acc.minY, el.y),
      maxX: Math.max(acc.maxX, el.x + el.width),
      maxY: Math.max(acc.maxY, el.y + el.height),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const laneGap = Math.max(32, Math.round(preset.spacingX / 2));
  let laneIndex = 0;

  // Place a free edge-label perpendicular to (and clear of) the arrow segment.
  const placeEdgeLabel = (
    a: [number, number],
    b: [number, number],
    label: string,
  ): void => {
    const metrics = measureText(label, preset.minFontSize, preset.fontFamily);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const offset =
      10 + (Math.abs(px) * metrics.width + Math.abs(py) * metrics.height) / 2;
    const cx = (a[0] + b[0]) / 2 + px * offset;
    const cy = (a[1] + b[1]) / 2 + py * offset;
    builder.text({
      x: snapToGrid(cx - metrics.width / 2, preset.grid),
      y: snapToGrid(cy - metrics.height / 2, preset.grid),
      text: label,
      fontSize: preset.minFontSize,
      fontFamily: preset.fontFamily,
      strokeColor: preset.textColor,
      textAlign: "center",
    });
  };

  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    const source = elementByNode.get(edge.from);
    const target = elementByNode.get(edge.to);
    if (!source || !target) continue;
    const sLayer = layerOf.get(edge.from) ?? 0;
    const tLayer = layerOf.get(edge.to) ?? 0;
    const style = edge.style ?? preset.arrowStyle;

    // Adjacent forward edges go straight through the (clear) inter-layer gutter.
    if (tLayer === sLayer + 1) {
      const start: [number, number] =
        direction === "TB"
          ? [source.x + source.width / 2, source.y + source.height]
          : [source.x + source.width, source.y + source.height / 2];
      const end: [number, number] =
        direction === "TB"
          ? [target.x + target.width / 2, target.y]
          : [target.x, target.y + target.height / 2];
      builder.connector({
        start,
        end,
        startElement: source,
        endElement: target,
        strokeColor: preset.stroke,
        strokeWidth: preset.strokeWidth,
        strokeStyle: style,
        roughness: preset.roughness,
      });
      if (edge.label) placeEdgeLabel(start, end, edge.label);
      continue;
    }

    // Skip-level / same-layer / back edges: route via a clear side-lane through
    // the inter-layer gutters so the connector never crosses a card or label.
    laneIndex += 1;
    let pts: Array<[number, number]>;
    let labelA: [number, number];
    let labelB: [number, number];
    if (direction === "TB") {
      const lane = bounds.maxX + laneGap * laneIndex;
      const sx = source.x + source.width / 2;
      const tx = target.x + target.width / 2;
      const gy1 = source.y + source.height + preset.spacingY / 2;
      const gy2 = target.y - preset.spacingY / 2;
      pts = [
        [sx, source.y + source.height],
        [sx, gy1],
        [lane, gy1],
        [lane, gy2],
        [tx, gy2],
        [tx, target.y],
      ];
      labelA = [lane, gy1];
      labelB = [lane, gy2];
    } else {
      const lane = bounds.maxY + laneGap * laneIndex;
      const sy = source.y + source.height / 2;
      const ty = target.y + target.height / 2;
      const gx1 = source.x + source.width + preset.spacingX / 2;
      const gx2 = target.x - preset.spacingX / 2;
      pts = [
        [source.x + source.width, sy],
        [gx1, sy],
        [gx1, lane],
        [gx2, lane],
        [gx2, ty],
        [target.x, ty],
      ];
      labelA = [gx1, lane];
      labelB = [gx2, lane];
    }
    builder.routedConnector({
      points: pts,
      startElement: source,
      endElement: target,
      strokeColor: preset.stroke,
      strokeWidth: preset.strokeWidth,
      strokeStyle: style,
      roughness: preset.roughness,
    });
    if (edge.label) placeEdgeLabel(labelA, labelB, edge.label);
  }

  return builder.build();
};

function hashString(value: string): number {
  let h = 0;
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export { FONT_FAMILY };
