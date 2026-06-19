/**
 * Bundled, offline icon glyphs for the Visual Quality Pipeline.
 *
 * These are small, clean, consistently-styled vector glyphs authored as native
 * Excalidraw primitives (no embedded raster, no third-party IP). They exist so
 * the MCP is NEVER without icons — even when the remote catalog is empty,
 * unreachable, or has no match. Real vendor brand art still comes from the
 * official remote catalog (`raw.githubusercontent.com/excalidraw/...`) via the
 * library adapter; this is the always-available fallback substrate.
 *
 * Each glyph is authored in a ~88×88 local coordinate box, style-locked to a
 * single ink stroke, strokeWidth 2, roughness 0 (clean UI-icon look), and a
 * per-concept accent fill — mirroring what makes upstream icon sets look
 * polished (one stroke / one roughness / consistent bbox band). Element ids are
 * placeholders; the injector clones them with fresh ids + a shared groupId.
 *
 * Provenance: every bundled element is tagged `library: "excalidash-bundled"`.
 */

/** Loose element shape (excalidrawlib/excalidraw element JSON). */
export type RawElement = Record<string, unknown>;

const INK = "#1e1e1e";
const WHITE = "#ffffff";
const BOX = 88;

let seedCounter = 11;
const nextSeed = (): number => {
  seedCounter = (seedCounter * 31 + 17) % 2_147_483_647;
  return seedCounter || 1;
};

interface ElProps {
  id?: string;
  bg?: string;
  stroke?: string;
  strokeWidth?: number;
  fillStyle?: string;
  roundness?: { type: number } | null;
  points?: Array<[number, number]>;
}

let elCounter = 0;
const el = (
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  props: ElProps = {},
): RawElement => {
  elCounter += 1;
  const base: RawElement = {
    id: props.id ?? `bnd-${type}-${elCounter}`,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: props.stroke ?? INK,
    backgroundColor: props.bg ?? "transparent",
    fillStyle: props.fillStyle ?? "solid",
    strokeWidth: props.strokeWidth ?? 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: props.roundness ?? null,
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
  if (props.points) {
    base.points = props.points;
    base.lastCommittedPoint = null;
  }
  return base;
};

const ROUNDED = { type: 3 };

// ---- Glyph builders (each returns a fresh element array in a ~88×88 box) ----

/** Classic database cylinder. */
const cylinder = (accent: string): RawElement[] => [
  el("rectangle", 6, 16, 76, 50, { bg: accent }),
  el("ellipse", 6, 6, 76, 20, { bg: accent }),
  el("ellipse", 6, 56, 76, 20, { bg: "transparent" }),
];

/** Pointy-top hexagon (api / service / gateway). */
const hexagon = (accent: string): RawElement[] => [
  el("line", 0, 2, BOX, 84, {
    bg: accent,
    points: [
      [44, 0],
      [86, 22],
      [86, 62],
      [44, 84],
      [2, 62],
      [2, 22],
      [44, 0],
    ],
  }),
];

/** Browser window (frontend / web / client). */
const browser = (accent: string): RawElement[] => [
  el("rectangle", 4, 10, 80, 68, { bg: WHITE, roundness: ROUNDED }),
  el("rectangle", 4, 10, 80, 16, { bg: accent }),
  el("ellipse", 10, 14, 7, 7, { bg: WHITE, strokeWidth: 1 }),
  el("ellipse", 21, 14, 7, 7, { bg: WHITE, strokeWidth: 1 }),
  el("ellipse", 32, 14, 7, 7, { bg: WHITE, strokeWidth: 1 }),
];

/** Stacked containers (docker / compose). */
const containers = (accent: string): RawElement[] => [
  el("rectangle", 6, 46, 76, 32, { bg: accent }),
  el("rectangle", 14, 24, 18, 18, { bg: accent }),
  el("rectangle", 35, 24, 18, 18, { bg: accent }),
  el("rectangle", 56, 24, 18, 18, { bg: accent }),
];

/** Three vertical bars (queue / stream / topic). */
const bars = (accent: string): RawElement[] => [
  el("rectangle", 10, 14, 18, 60, { bg: accent, roundness: ROUNDED }),
  el("rectangle", 35, 14, 18, 60, { bg: accent, roundness: ROUNDED }),
  el("rectangle", 60, 14, 18, 60, { bg: accent, roundness: ROUNDED }),
];

/** Cog/gear (worker / job / cron). */
const gear = (accent: string): RawElement[] => [
  el("rectangle", 40, 2, 8, 14, { bg: accent }),
  el("rectangle", 40, 72, 8, 14, { bg: accent }),
  el("rectangle", 2, 40, 14, 8, { bg: accent }),
  el("rectangle", 72, 40, 14, 8, { bg: accent }),
  el("ellipse", 12, 12, 64, 64, { bg: accent }),
  el("ellipse", 32, 32, 24, 24, { bg: WHITE }),
];

/** Server / rack (server / nginx / host). */
const server = (accent: string): RawElement[] => [
  el("rectangle", 12, 6, 64, 76, { bg: accent, roundness: ROUNDED }),
  el("rectangle", 20, 18, 48, 5, { bg: WHITE, strokeWidth: 1 }),
  el("rectangle", 20, 34, 48, 5, { bg: WHITE, strokeWidth: 1 }),
  el("rectangle", 20, 50, 48, 5, { bg: WHITE, strokeWidth: 1 }),
  el("ellipse", 58, 64, 9, 9, { bg: WHITE, strokeWidth: 1 }),
];

/** Person avatar (user / admin / actor). */
const person = (accent: string): RawElement[] => [
  el("ellipse", 30, 6, 28, 28, { bg: accent }),
  el("rectangle", 14, 42, 60, 42, { bg: accent, roundness: ROUNDED }),
];

/** Padlock (auth / security). */
const padlock = (accent: string): RawElement[] => [
  el("line", 24, 10, 40, 30, {
    strokeWidth: 4,
    bg: "transparent",
    points: [
      [0, 28],
      [0, 10],
      [10, 0],
      [30, 0],
      [40, 10],
      [40, 28],
    ],
  }),
  el("rectangle", 14, 38, 60, 44, { bg: accent, roundness: ROUNDED }),
  el("ellipse", 39, 52, 12, 12, { bg: WHITE, strokeWidth: 1 }),
];

/** Rounded service badge (github / generic recognized service). */
const badge = (accent: string): RawElement[] => [
  el("rectangle", 6, 6, 76, 76, { bg: accent, roundness: ROUNDED }),
  el("ellipse", 26, 24, 36, 30, { bg: WHITE, strokeWidth: 1 }),
  el("rectangle", 40, 50, 8, 24, { bg: WHITE, strokeWidth: 1 }),
];

export interface BundledIcon {
  /** Stable id used as the library item name. */
  id: string;
  /** Display name (becomes the injected item's name). */
  name: string;
  /** Concepts / aliases this glyph satisfies (normalized, lower-case). */
  concepts: string[];
  /** True for vendor/brand concepts (preferred over generic on a tie). */
  brand: boolean;
  /** Accent fill colour. */
  accent: string;
  /** Build a fresh element array (≈88×88 local box). */
  build: () => RawElement[];
}

const icon = (
  id: string,
  name: string,
  brand: boolean,
  accent: string,
  build: (accent: string) => RawElement[],
  concepts: string[],
): BundledIcon => ({ id, name, concepts, brand, accent, build: () => build(accent) });

/**
 * The bundled icon set. Order matters only as a stable tiebreaker; resolution
 * prefers higher match score then brand specificity (see conceptIndex).
 */
export const BUNDLED_ICONS: BundledIcon[] = [
  // --- data stores (cylinder) ---
  icon("postgres", "PostgreSQL", true, "#336791", cylinder, [
    "postgres",
    "postgresql",
    "postgres-db",
    "pg",
  ]),
  icon("redis", "Redis", true, "#d82c20", cylinder, ["redis", "redis-cache"]),
  icon("supabase", "Supabase", true, "#3ecf8e", cylinder, ["supabase"]),
  icon("pgbouncer", "PgBouncer", true, "#2f6792", cylinder, [
    "pgbouncer",
    "pg-bouncer",
    "connection-pool",
    "pool",
  ]),
  icon("database", "Database", false, "#4dabf7", cylinder, [
    "database",
    "db",
    "datastore",
    "data-store",
    "sql",
    "storage",
  ]),
  icon("cache", "Cache", false, "#ff922b", cylinder, ["cache", "caching"]),
  // --- compute / services (hexagon) ---
  icon("api", "API", false, "#e8590c", hexagon, [
    "api",
    "rest",
    "graphql",
    "endpoint",
  ]),
  icon("backend", "Backend", false, "#e8590c", hexagon, [
    "backend",
    "back-end",
    "server-app",
  ]),
  icon("nestjs", "NestJS", true, "#e0234e", hexagon, ["nestjs", "nest"]),
  icon("node", "Node.js", true, "#3c873a", hexagon, ["node", "nodejs", "node-js"]),
  icon("mcp", "MCP", true, "#6741d9", hexagon, ["mcp", "model-context-protocol"]),
  icon("gateway", "Gateway", false, "#f08c00", hexagon, [
    "gateway",
    "api-gateway",
    "ingress",
    "proxy",
  ]),
  // --- frontends (browser) ---
  icon("frontend", "Frontend", false, "#4dabf7", browser, [
    "frontend",
    "front-end",
    "ui",
  ]),
  icon("web", "Web", false, "#4dabf7", browser, ["web", "website", "webapp"]),
  icon("react", "React", true, "#61dafb", browser, ["react", "reactjs"]),
  icon("nextjs", "Next.js", true, "#868e96", browser, [
    "nextjs",
    "next",
    "next-js",
  ]),
  icon("client", "Client", false, "#748ffc", browser, ["client", "browser"]),
  // --- infra ---
  icon("docker", "Docker", true, "#2496ed", containers, [
    "docker",
    "container",
    "compose",
    "docker-compose",
  ]),
  icon("queue", "Queue", false, "#845ef7", bars, [
    "queue",
    "kafka",
    "rabbitmq",
    "stream",
    "topic",
    "broker",
  ]),
  icon("worker", "Worker", false, "#5c7cfa", gear, [
    "worker",
    "job",
    "cron",
    "consumer",
  ]),
  icon("server", "Server", false, "#495057", server, ["server", "host", "vm"]),
  icon("nginx", "Nginx", true, "#009639", server, ["nginx"]),
  // --- people / security ---
  icon("user", "User", false, "#1098ad", person, ["user", "users", "actor", "customer"]),
  icon("admin", "Admin", false, "#e8590c", person, ["admin", "administrator", "team"]),
  icon("auth", "Auth", false, "#f59f00", padlock, [
    "auth",
    "authentication",
    "security",
    "login",
    "identity",
  ]),
  icon("github", "GitHub", true, "#24292e", badge, ["github", "git", "repo", "repository"]),
];

/** Map of concept -> icon (first wins; brand handled by resolver scoring). */
export const ICON_BY_CONCEPT: Map<string, BundledIcon> = (() => {
  const map = new Map<string, BundledIcon>();
  for (const ic of BUNDLED_ICONS) {
    for (const concept of ic.concepts) {
      if (!map.has(concept)) map.set(concept, ic);
    }
  }
  return map;
})();

export const getBundledIcon = (id: string): BundledIcon | undefined =>
  BUNDLED_ICONS.find((ic) => ic.id === id);
