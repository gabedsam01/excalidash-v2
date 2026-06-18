/**
 * Band (zone) layout — stacks labelled horizontal zones, each rendered as a
 * titled frame with a reserved title band, cards laid out in a row, connectors
 * routed through clear gutters/side-lanes, and a legend. This is what makes
 * create_from_repo_analysis produce a real, framed, legible architecture
 * diagram (not a rectangle hairball).
 *
 * Every dimension is a multiple of the grid and frames are sized to strictly
 * contain their cards, so the result is on-grid and free of ITEM_OUTSIDE_FRAME
 * / FRAME_TITLE_OVERLAP / OFF_GRID false-failures.
 */
import type { ExcalidrawElement, ExcalidrawScene } from "../types";
import { SceneBuilder, measureText } from "../excalidraw/elements";
import { tagElement } from "../libraries/metadata";
import type { VisualPreset } from "../templates/presets";

export interface BandCard {
  id: string;
  label: string;
  kind?: string;
  color?: string;
}

export interface Band {
  id: string;
  title: string;
  cards: BandCard[];
  color?: string;
}

export interface BandEdge {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
}

export interface BandLegendItem {
  label: string;
  color?: string;
}

export interface BandLayoutOptions {
  preset: VisualPreset;
  title?: string;
  legend?: BandLegendItem[];
  notes?: string[];
}

const seedFromBands = (bands: Band[]): number => {
  let seed = 11;
  for (const band of bands) {
    for (const ch of band.id + band.title) {
      seed = (seed * 31 + ch.charCodeAt(0)) % 2_147_483_647;
    }
  }
  return seed || 1;
};

export const layoutBands = (
  bands: Band[],
  edges: BandEdge[],
  options: BandLayoutOptions,
): ExcalidrawScene => {
  const { preset } = options;
  const grid = preset.grid > 0 ? preset.grid : 20;
  const align = (v: number): number => Math.round(v / grid) * grid;

  const TITLE_BAND = grid * 3; // 60 — clears the geometry title band (40).
  const CARD_HEIGHT = grid * 4; // 80
  const PAD_X = grid * 2; // 40
  const PAD_BOTTOM = grid * 2; // 40
  const cardGap = Math.max(grid * 2, align(preset.spacingX * 0.6));
  const bandGap = Math.max(grid * 4, align(preset.spacingY));

  const builder = new SceneBuilder(seedFromBands(bands));
  builder.appState = {
    viewBackgroundColor: preset.background,
    gridSize: grid,
  };

  const cardWidth = (label: string): number => {
    const metrics = measureText(label, preset.labelFontSize, preset.fontFamily);
    return Math.max(grid * 8, align(metrics.width + 56));
  };

  const nonEmpty = bands.filter((b) => b.cards.length > 0);
  const bandGeom = nonEmpty.map((band) => {
    const widths = band.cards.map((c) => cardWidth(c.label));
    const content =
      widths.reduce((s, w) => s + w, 0) + cardGap * Math.max(0, widths.length - 1);
    return { widths, frameWidth: content + PAD_X * 2 };
  });

  const titleOffset = options.title ? align(preset.titleFontSize + 48) : 0;
  const elementByCard = new Map<string, ExcalidrawElement>();
  const bandIndexByCard = new Map<string, number>();
  let cursorY = titleOffset;
  let maxFrameRight = -Infinity;

  nonEmpty.forEach((band, bandIndex) => {
    const { widths, frameWidth } = bandGeom[bandIndex];
    const frameX = align(-frameWidth / 2);
    const frameY = align(cursorY);
    const frameHeight = TITLE_BAND + CARD_HEIGHT + PAD_BOTTOM;
    const frame = builder.frame({
      x: frameX,
      y: frameY,
      width: frameWidth,
      height: frameHeight,
      name: band.title,
    });
    maxFrameRight = Math.max(maxFrameRight, frameX + frameWidth);

    const groupId = `band_${band.id}`;
    let cardX = frameX + PAD_X;
    const cardY = frameY + TITLE_BAND;
    band.cards.forEach((card, i) => {
      const w = widths[i];
      const colorIndex = bandIndex % preset.palette.length;
      const { container } = builder.labeledShape({
        x: cardX,
        y: cardY,
        width: w,
        height: CARD_HEIGHT,
        label: card.label,
        backgroundColor:
          card.color ?? band.color ?? preset.palette[colorIndex] ?? "#ffffff",
        strokeColor: preset.stroke,
        strokeWidth: preset.strokeWidth,
        roughness: preset.roughness,
        rounded: preset.rounded,
        groupIds: [groupId],
        frameId: frame.id,
        fontSize: preset.labelFontSize,
        fontFamily: preset.fontFamily,
        labelColor: preset.textColor,
      });
      const label = builder.elements.find(
        (el) => el.type === "text" && el.containerId === container.id,
      );
      if (label) label.frameId = frame.id;
      elementByCard.set(card.id, container);
      bandIndexByCard.set(card.id, bandIndex);
      cardX += w + cardGap;
    });

    cursorY = frameY + frameHeight + bandGap;
  });

  // Title.
  if (options.title) {
    const metrics = measureText(
      options.title,
      preset.titleFontSize,
      preset.fontFamily,
    );
    builder.text({
      x: align(-metrics.width / 2),
      y: align(8),
      text: options.title,
      fontSize: preset.titleFontSize,
      fontFamily: preset.fontFamily,
      strokeColor: preset.textColor,
      textAlign: "center",
    });
  }

  // ----- Connectors: adjacent bands straight; others via a clear side-lane. -----
  const laneBase = (Number.isFinite(maxFrameRight) ? maxFrameRight : 0) + grid * 3;
  const laneGap = Math.max(grid * 2, align(preset.spacingX / 2));
  let laneIndex = 0;
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
      12 + (Math.abs(px) * metrics.width + Math.abs(py) * metrics.height) / 2;
    const cx = (a[0] + b[0]) / 2 + px * offset;
    const cy = (a[1] + b[1]) / 2 + py * offset;
    builder.text({
      x: align(cx - metrics.width / 2),
      y: align(cy - metrics.height / 2),
      text: label,
      fontSize: preset.minFontSize,
      fontFamily: preset.fontFamily,
      strokeColor: preset.textColor,
      textAlign: "center",
    });
  };

  for (const edge of edges) {
    const source = elementByCard.get(edge.from);
    const target = elementByCard.get(edge.to);
    if (!source || !target) continue;
    const sBand = bandIndexByCard.get(edge.from) ?? 0;
    const tBand = bandIndexByCard.get(edge.to) ?? 0;
    const style = edge.style ?? preset.arrowStyle;

    if (tBand === sBand + 1) {
      const start: [number, number] = [
        source.x + source.width / 2,
        source.y + source.height,
      ];
      const end: [number, number] = [target.x + target.width / 2, target.y];
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

    laneIndex += 1;
    const lane = laneBase + laneGap * laneIndex;
    const sx = source.x + source.width / 2;
    const tx = target.x + target.width / 2;
    const gy1 = source.y + source.height + bandGap / 2;
    const gy2 = target.y - bandGap / 2;
    const pts: Array<[number, number]> = [
      [sx, source.y + source.height],
      [sx, gy1],
      [lane, gy1],
      [lane, gy2],
      [tx, gy2],
      [tx, target.y],
    ];
    builder.routedConnector({
      points: pts,
      startElement: source,
      endElement: target,
      strokeColor: preset.stroke,
      strokeWidth: preset.strokeWidth,
      strokeStyle: style,
      roughness: preset.roughness,
    });
    if (edge.label) placeEdgeLabel([lane, gy1], [lane, gy2], edge.label);
  }

  // ----- Legend (sized to its own content, on-grid). -----
  const legend = options.legend ?? [];
  const notes = options.notes ?? [];
  if (legend.length > 0 || notes.length > 0) {
    const lineH = grid * 2; // 40
    const rows: Array<{ text: string; color?: string; bullet?: boolean }> = [
      ...legend.map((l) => ({ text: l.label, color: l.color })),
    ];
    if (notes.length > 0) {
      rows.push({ text: "Notes / risks:" });
      for (const note of notes) rows.push({ text: note, bullet: true });
    }
    const swatchW = grid; // 20
    const textIndent = swatchW + grid; // 40
    const longest = Math.max(
      ...rows.map(
        (r) =>
          measureText(
            (r.bullet ? "• " : "") + r.text,
            preset.minFontSize,
            preset.fontFamily,
          ).width + (r.color ? textIndent : 0),
      ),
      measureText("Legend", preset.minFontSize, preset.fontFamily).width,
    );
    const legendWidth = align(longest + PAD_X * 2 + grid * 2);
    const legendHeight = TITLE_BAND + rows.length * lineH + PAD_BOTTOM;
    const legendX = align(-legendWidth / 2);
    const legendY = align(cursorY);
    const legendFrame = builder.frame({
      x: legendX,
      y: legendY,
      width: legendWidth,
      height: legendHeight,
      name: "Legend",
    });
    tagElement(legendFrame, { role: "legend" });
    let rowY = legendY + TITLE_BAND;
    for (const row of rows) {
      if (row.color) {
        const swatch = builder.shape({
          x: legendX + PAD_X,
          y: rowY,
          width: swatchW,
          height: swatchW,
          backgroundColor: row.color,
          strokeColor: preset.stroke,
          strokeWidth: 1,
          rounded: preset.rounded,
          frameId: legendFrame.id,
        });
        tagElement(swatch, { role: "legend-item" });
      }
      const text = builder.text({
        x: legendX + PAD_X + (row.color ? textIndent : 0),
        y: rowY,
        text: row.bullet ? `• ${row.text}` : row.text,
        fontSize: preset.minFontSize,
        fontFamily: preset.fontFamily,
        strokeColor: preset.textColor,
        textAlign: "left",
        frameId: legendFrame.id,
      });
      tagElement(text, { role: "legend-item" });
      rowY += lineH;
    }
  }

  return builder.build();
};
