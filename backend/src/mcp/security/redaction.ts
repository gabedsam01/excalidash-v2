/**
 * Secret redaction for the MCP. The external agent may paste repo analysis,
 * env files or scenes that contain real secrets (JWTs, service-role keys,
 * provider keys, database URLs, bearer tokens, webhook/proxy secrets). NONE of
 * those may end up in a drawing, an export, a tool response, a log or a
 * snapshot. Every secret-shaped value is replaced with [REDACTED_<TYPE>],
 * keeping only the type so the diagram stays meaningful.
 */
import type { ExcalidrawElement, ExcalidrawScene } from "../types";

interface Rule {
  re: RegExp;
  replace: string | ((m: string, ...g: string[]) => string);
}

// Ordered, conservative rules. Targeted prefixes/shapes only — we never redact
// ordinary words like "Database", "PostgreSQL", "API", "Supabase".
const RULES: Rule[] = [
  // JSON Web Tokens (also covers Supabase anon/service-role JWTs).
  {
    re: /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/g,
    replace: "[REDACTED_JWT]",
  },
  // Bearer <token>
  {
    re: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replace: "Bearer [REDACTED_TOKEN]",
  },
  // Connection strings with embedded credentials.
  {
    re: /\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp):\/\/)[^\s:@/]+:[^\s:@/]+@/gi,
    replace: (_m, scheme: string) => `${scheme}[REDACTED_DB_CREDENTIALS]@`,
  },
  // Stripe / provider keys.
  { re: /\bsk_(?:live|test)_[A-Za-z0-9]{8,}/g, replace: "[REDACTED_PROVIDER_KEY]" },
  { re: /\bpk_(?:live|test)_[A-Za-z0-9]{8,}/g, replace: "[REDACTED_PUBLISHABLE_KEY]" },
  { re: /\bwhsec_[A-Za-z0-9]{8,}/g, replace: "[REDACTED_WEBHOOK_SECRET]" },
  { re: /\brk_(?:live|test)_[A-Za-z0-9]{8,}/g, replace: "[REDACTED_PROVIDER_KEY]" },
  // OpenAI-style.
  { re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, replace: "[REDACTED_PROVIDER_KEY]" },
  // GitHub tokens.
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replace: "[REDACTED_TOKEN]" },
  // Slack tokens.
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, replace: "[REDACTED_TOKEN]" },
  // AWS access key id / secret.
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: "[REDACTED_AWS_KEY]" },
  // Google API key.
  { re: /\bAIza[0-9A-Za-z_-]{30,}/g, replace: "[REDACTED_PROVIDER_KEY]" },
  // ExcaliDash API keys.
  { re: /\bexd_[A-Za-z0-9]{8,}/g, replace: "[REDACTED_API_KEY]" },
  // service_role explicit mentions with a value.
  {
    re: /\bservice[_-]?role[_-]?key\s*[=:]\s*["']?[A-Za-z0-9._-]{8,}["']?/gi,
    replace: "service_role_key=[REDACTED_SERVICE_ROLE]",
  },
  // NOTE: generic NAME=secret assignments are handled (with a typed placeholder)
  // by the dedicated first pass in redactString — not here, to avoid a second
  // pass overwriting the specific [REDACTED_<TYPE>] with a generic one.
];

const TYPE_FROM_KEY: Array<[RegExp, string]> = [
  [/PROXY[_-]?SECRET/i, "[REDACTED_PROXY_SECRET]"],
  [/SERVICE[_-]?ROLE/i, "[REDACTED_SERVICE_ROLE]"],
  [/JWT/i, "[REDACTED_JWT_SECRET]"],
  [/WEBHOOK/i, "[REDACTED_WEBHOOK_SECRET]"],
  [/(API[_-]?KEY|ACCESS[_-]?KEY)/i, "[REDACTED_API_KEY]"],
  [/PASSWORD|PASSWD/i, "[REDACTED_PASSWORD]"],
  [/TOKEN/i, "[REDACTED_TOKEN]"],
];

/** Redact a single string value. Safe to call on any text. */
export const redactString = (input: string): string => {
  if (typeof input !== "string" || input.length === 0) return input;
  let out = input;
  // Refine generic assignments to a more specific [REDACTED_*] type.
  out = out.replace(
    /\b([A-Z][A-Z0-9_]{2,}(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET|SERVICE[_-]?ROLE|PROXY[_-]?SECRET))\s*[=:]\s*["']?[^\s"']{6,}["']?/g,
    (_m, key: string) => {
      const type =
        TYPE_FROM_KEY.find(([re]) => re.test(key))?.[1] ?? "[REDACTED_SECRET]";
      return `${key}=${type}`;
    },
  );
  for (const rule of RULES) {
    out = out.replace(
      rule.re,
      rule.replace as string & ((m: string, ...g: string[]) => string),
    );
  }
  return out;
};

/** Does a string contain a recognizable secret? (used by tests / guards). */
export const containsSecret = (input: string): boolean =>
  typeof input === "string" && redactString(input) !== input;

const SECRET_KEY_FIELDS = new Set([
  "text",
  "originalText",
  "name",
  "label",
  "link",
  "title",
  "description",
]);

/**
 * Deep-redact any JSON value (tool responses, analysis echoes). Only strings
 * are transformed; structure is preserved. Guards against pathological depth.
 */
export const redactValue = <T>(value: T, depth = 0): T => {
  if (depth > 64) return value;
  if (typeof value === "string") return redactString(value) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
};

/** Redact text-bearing fields of one element (in place, on a clone caller). */
const redactElement = (el: ExcalidrawElement): ExcalidrawElement => {
  const next: ExcalidrawElement = { ...el };
  for (const field of SECRET_KEY_FIELDS) {
    const v = (next as Record<string, unknown>)[field];
    if (typeof v === "string") {
      (next as Record<string, unknown>)[field] = redactString(v);
    }
  }
  return next;
};

/** Redact every text-bearing field of a scene without mutating the input. */
export const redactScene = (scene: ExcalidrawScene): ExcalidrawScene => ({
  ...scene,
  elements: scene.elements.map(redactElement),
});

/**
 * Redact a persisted-drawing payload ({ elements, appState, files, preview }).
 * `preview` (a raster/data URL) is left untouched — base64 can contain
 * secret-shaped substrings by coincidence and must not be corrupted.
 */
export const redactDrawingData = <
  T extends { elements: unknown[]; appState?: unknown },
>(
  data: T,
): T => ({
  ...data,
  elements: (data.elements as ExcalidrawElement[]).map(redactElement),
  appState: data.appState ? redactValue(data.appState) : data.appState,
});
