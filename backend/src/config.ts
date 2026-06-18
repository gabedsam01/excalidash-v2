/**
 * Configuration validation and environment variable management
 */
import dotenv from "dotenv";
import crypto from "crypto";
import {
  loadRequestLimits,
  RequestLimits,
  summarizeRequestLimits,
} from "./utils/limits";
import type { LibraryConfig } from "./libraries/types";
import type { McpConfig } from "./mcp/types";

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  databaseUrl?: string;
  frontendUrl?: string;
  authMode: AuthMode;
  jwtSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  rateLimitMaxRequests: number;
  csrfMaxRequests: number;
  csrfSecret: string | null;
  apiKeySecret: string;
  oidc: OidcConfig;
  enablePasswordReset: boolean;
  enableRefreshTokenRotation: boolean;
  enableAuditLogging: boolean;
  enforceHttpsRedirect: boolean;
  bootstrapSetupCodeTtlMs: number;
  bootstrapSetupCodeMaxAttempts: number;
  limits: RequestLimits;
  libraries: LibraryConfig;
  mcp: McpConfig;
}

export type AuthMode = "local" | "hybrid" | "oidc_enforced";

interface OidcConfig {
  enabled: boolean;
  enforced: boolean;
  providerName: string;
  issuerUrl: string | null;
  discoveryUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  idTokenSignedResponseAlg: string | null;
  tokenEndpointAuthMethod:
    | "none"
    | "client_secret_basic"
    | "client_secret_post"
    | null;
  scopes: string;
  emailClaim: string;
  emailVerifiedClaim: string;
  groupsClaim: string;
  adminGroups: string[];
  requireEmailVerified: boolean;
  jitProvisioning: boolean;
  firstUserAdmin: boolean;
}

const ALLOWED_OIDC_ID_TOKEN_ALGS = new Set([
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
  "HS256",
  "HS384",
  "HS512",
]);

const getOptionalEnv = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

const getOptionalTrimmedEnv = (key: string): string | null => {
  const raw = process.env[key];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getOptionalOidcSigningAlg = (key: string): string | null => {
  const raw = process.env[key];
  if (!raw) return null;
  const normalized = raw.trim();

  if (normalized.length === 0 || normalized.toLowerCase() === "none") {
    throw new Error(`${key} must not be empty or 'none'`);
  }
  if (!ALLOWED_OIDC_ID_TOKEN_ALGS.has(normalized)) {
    throw new Error(
      `${key} must be one of: ${Array.from(ALLOWED_OIDC_ID_TOKEN_ALGS).join(", ")}`
    );
  }

  return normalized;
};

const getOptionalOidcTokenEndpointAuthMethod = (
  key: string,
): "none" | "client_secret_basic" | "client_secret_post" | null => {
  const raw = process.env[key];
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return null;
  if (
    normalized === "none" ||
    normalized === "client_secret_basic" ||
    normalized === "client_secret_post"
  ) {
    return normalized;
  }
  throw new Error(
    `${key} must be one of: none, client_secret_basic, client_secret_post`,
  );
};

const parseCsvEnvList = (key: string): string[] => {
  const raw = process.env[key];
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const resolveJwtSecret = (nodeEnv: string): string => {
  const provided = process.env.JWT_SECRET;
  if (provided && provided.trim().length > 0) {
    return provided;
  }

  if (nodeEnv === "production") {
    throw new Error("Missing required environment variable: JWT_SECRET");
  }

  const generated = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[security] JWT_SECRET is not set (non-production). Using an ephemeral secret; tokens will be invalidated on restart.",
  );
  return generated;
};

const resolveApiKeySecret = (nodeEnv: string): string => {
  const provided = process.env.API_KEY_SECRET;
  if (provided && provided.trim().length > 0) {
    return provided;
  }

  if (nodeEnv === "production") {
    throw new Error("Missing required environment variable: API_KEY_SECRET");
  }

  const generated = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[security] API_KEY_SECRET is not set (non-production). Using an ephemeral secret; API keys will stop validating after restart.",
  );
  return generated;
};

const parseFrontendUrl = (raw: string | undefined): string | undefined => {
  if (!raw || raw.trim().length === 0) return undefined;
  const normalized = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .join(",");
  return normalized.length > 0 ? normalized : undefined;
};

/**
 * ExcaliDash is PostgreSQL-only. SQLite (and any `file:` URL) is no longer
 * supported. This validates DATABASE_URL early and fails fast with a clear,
 * actionable message instead of silently falling back to a local file.
 */
const resolveDatabaseUrl = (rawUrl?: string): string => {
  const trimmed = rawUrl?.trim();

  if (!trimmed) {
    throw new Error(
      "Missing required environment variable: DATABASE_URL. ExcaliDash " +
        "requires a PostgreSQL connection string, e.g. " +
        "postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public",
    );
  }

  if (/^file:/i.test(trimmed) || /^sqlite:/i.test(trimmed)) {
    throw new Error(
      "SQLite is no longer supported. DATABASE_URL must be a PostgreSQL " +
        "connection string (postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public). " +
        "Received a SQLite/file URL — update DATABASE_URL to point at PostgreSQL.",
    );
  }

  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    throw new Error(
      "Invalid DATABASE_URL: ExcaliDash requires a PostgreSQL connection " +
        "string starting with postgresql:// (or postgres://).",
    );
  }

  return trimmed;
};

process.env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL);

const getOptionalBoolean = (key: string, defaultValue: boolean): boolean => {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
};

const getRequiredEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid value for environment variable ${key}: must be a positive number`,
    );
  }
  return parsed;
};

const parseAuthMode = (rawValue: string | undefined): AuthMode => {
  const normalized = (rawValue || "local").trim().toLowerCase();
  if (
    normalized === "local" ||
    normalized === "hybrid" ||
    normalized === "oidc_enforced"
  ) {
    return normalized;
  }
  throw new Error(
    "Invalid AUTH_MODE. Expected one of: local, hybrid, oidc_enforced",
  );
};

const resolveOidcConfig = (authMode: AuthMode): OidcConfig => {
  const issuerUrl = getOptionalTrimmedEnv("OIDC_ISSUER_URL");
  const discoveryUrl = getOptionalTrimmedEnv("OIDC_DISCOVERY_URL");
  const clientId = getOptionalTrimmedEnv("OIDC_CLIENT_ID");
  const clientSecret = getOptionalTrimmedEnv("OIDC_CLIENT_SECRET");
  const redirectUri = getOptionalTrimmedEnv("OIDC_REDIRECT_URI");
  const groupsClaim = getOptionalEnv("OIDC_GROUPS_CLAIM", "groups").trim();
  const adminGroups = parseCsvEnvList("OIDC_ADMIN_GROUPS");
  const requiredWhenEnabled = {
    OIDC_ISSUER_URL: issuerUrl,
    OIDC_CLIENT_ID: clientId,
    OIDC_REDIRECT_URI: redirectUri,
  };

  if (groupsClaim.length === 0) {
    throw new Error(
      "Invalid OIDC_GROUPS_CLAIM: must be a non-empty claim key/path",
    );
  }

  const enabled = authMode !== "local";
  const missingRequired = Object.entries(requiredWhenEnabled)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (enabled && missingRequired.length > 0) {
    throw new Error(
      `AUTH_MODE=${authMode} requires OIDC configuration. Missing: ${missingRequired.join(", ")}`,
    );
  }

  if (!enabled) {
    const hasOidcVars =
      Object.values(requiredWhenEnabled).some((value) => Boolean(value)) ||
      adminGroups.length > 0;
    if (hasOidcVars) {
      console.warn(
        "[config] AUTH_MODE=local; ignoring OIDC_* provider settings.",
      );
    }
  }

  const idTokenSignedResponseAlg = enabled
    ? getOptionalOidcSigningAlg("OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG")
    : null;
  const tokenEndpointAuthMethod = enabled
    ? getOptionalOidcTokenEndpointAuthMethod("OIDC_TOKEN_ENDPOINT_AUTH_METHOD")
    : null;
  if (enabled && idTokenSignedResponseAlg && /^HS/i.test(idTokenSignedResponseAlg) && !clientSecret) {
    throw new Error(
      "OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG using HS* requires OIDC_CLIENT_SECRET for a confidential client"
    );
  }

  return {
    enabled,
    enforced: authMode === "oidc_enforced",
    providerName: getOptionalEnv("OIDC_PROVIDER_NAME", "OIDC"),
    issuerUrl,
    discoveryUrl,
    clientId,
    clientSecret,
    redirectUri,
    idTokenSignedResponseAlg,
    tokenEndpointAuthMethod,
    scopes: getOptionalEnv("OIDC_SCOPES", "openid profile email"),
    emailClaim: getOptionalEnv("OIDC_EMAIL_CLAIM", "email"),
    emailVerifiedClaim: getOptionalEnv(
      "OIDC_EMAIL_VERIFIED_CLAIM",
      "email_verified",
    ),
    groupsClaim,
    adminGroups,
    requireEmailVerified: getOptionalBoolean(
      "OIDC_REQUIRE_EMAIL_VERIFIED",
      true,
    ),
    jitProvisioning: getOptionalBoolean("OIDC_JIT_PROVISIONING", true),
    firstUserAdmin: getOptionalBoolean("OIDC_FIRST_USER_ADMIN", true),
  };
};

const DEFAULT_LIBRARIES_CATALOG_URL =
  "https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries.json";
const DEFAULT_LIBRARIES_BASE_URL =
  "https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries";

/**
 * Curated Excalidraw library packs configuration. Only the official Excalidraw
 * catalog host is reachable (enforced at fetch time, see libraries/validators).
 */
const resolveLibraryConfig = (): LibraryConfig => {
  const downloadMaxMb = getRequiredEnvNumber("LIBRARY_DOWNLOAD_MAX_MB", 25);
  return {
    catalogUrl: getOptionalEnv(
      "EXCALIDRAW_LIBRARIES_CATALOG_URL",
      DEFAULT_LIBRARIES_CATALOG_URL,
    ),
    baseUrl: getOptionalEnv(
      "EXCALIDRAW_LIBRARIES_BASE_URL",
      DEFAULT_LIBRARIES_BASE_URL,
    ),
    cacheDir: getOptionalEnv("LIBRARY_CACHE_DIR", "/app/data/libraries"),
    refreshIntervalHours: getRequiredEnvNumber(
      "LIBRARY_REFRESH_INTERVAL_HOURS",
      24,
    ),
    downloadTimeoutMs: getRequiredEnvNumber("LIBRARY_DOWNLOAD_TIMEOUT_MS", 15000),
    downloadMaxBytes: Math.trunc(downloadMaxMb * 1024 * 1024),
    publicSearchEnabled: getOptionalBoolean(
      "LIBRARY_PUBLIC_SEARCH_ENABLED",
      true,
    ),
    publicSearchMaxResults: getRequiredEnvNumber(
      "LIBRARY_PUBLIC_SEARCH_MAX_RESULTS",
      25,
    ),
    autoRefreshOnStart: getOptionalBoolean(
      "LIBRARY_AUTO_REFRESH_ON_START",
      true,
    ),
  };
};

/**
 * ExcaliDash MCP server configuration. The MCP exposes exactly 25 drawing tools
 * at MCP_ENDPOINT_PATH, authenticated by Bearer `exd_` API keys.
 */
const resolveMcpConfig = (): McpConfig => {
  const clampScore = (key: string, fallback: number): number => {
    const raw = process.env[key];
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid ${key}: must be a number between 0 and 100`);
    }
    return Math.max(0, Math.min(100, Math.trunc(parsed)));
  };

  const allowedLibraryModes = new Set([
    "curated",
    "all",
    "core",
    "specialized",
    "public",
  ]);
  const libraryMode = getOptionalEnv(
    "MCP_DEFAULT_LIBRARY_MODE",
    "curated",
  ).trim();
  if (!allowedLibraryModes.has(libraryMode)) {
    throw new Error(
      `Invalid MCP_DEFAULT_LIBRARY_MODE: must be one of ${Array.from(
        allowedLibraryModes,
      ).join(", ")}`,
    );
  }

  let endpointPath = getOptionalEnv("MCP_ENDPOINT_PATH", "/mcp").trim();
  if (!endpointPath.startsWith("/")) endpointPath = `/${endpointPath}`;
  endpointPath = endpointPath.replace(/\/+$/, "") || "/mcp";

  const allowedLibraryUsageModes = new Set(["off", "curated", "required"]);
  const libraryUsageMode = getOptionalEnv("MCP_LIBRARY_MODE", "curated")
    .trim()
    .toLowerCase();
  if (!allowedLibraryUsageModes.has(libraryUsageMode)) {
    throw new Error(
      `Invalid MCP_LIBRARY_MODE: must be one of off, curated, required`,
    );
  }

  return {
    enabled: getOptionalBoolean("MCP_ENABLED", true),
    endpointPath,
    minDrawingScore: clampScore("MCP_MIN_DRAWING_SCORE", 95),
    maxRepairAttempts: getRequiredEnvNumber("MCP_MAX_REPAIR_ATTEMPTS", 5),
    allowLowScoreDraft: getOptionalBoolean("MCP_ALLOW_LOW_SCORE_DRAFT", true),
    maxElements: getRequiredEnvNumber("MCP_MAX_ELEMENTS", 5000),
    maxExportMb: getRequiredEnvNumber("MCP_MAX_EXPORT_MB", 100),
    defaultLibraryMode: libraryMode as McpConfig["defaultLibraryMode"],
    libraryMode: libraryUsageMode as McpConfig["libraryMode"],
    publicSearchEnabled: getOptionalBoolean("MCP_PUBLIC_SEARCH_ENABLED", false),
    rateLimitWindowSeconds: getRequiredEnvNumber(
      "MCP_RATE_LIMIT_WINDOW_SECONDS",
      900,
    ),
    rateLimitMax: getRequiredEnvNumber("MCP_RATE_LIMIT_MAX", 300),
    validateOrigin: getOptionalBoolean("MCP_VALIDATE_ORIGIN", true),
  };
};

const resolvedNodeEnv = getOptionalEnv("NODE_ENV", "development");
const resolvedAuthMode = parseAuthMode(process.env.AUTH_MODE);

export const config: Config = {
  port: getRequiredEnvNumber("PORT", 8000),
  nodeEnv: resolvedNodeEnv,
  databaseUrl: process.env.DATABASE_URL,
  frontendUrl: parseFrontendUrl(process.env.FRONTEND_URL),
  authMode: resolvedAuthMode,
  jwtSecret: resolveJwtSecret(resolvedNodeEnv),
  jwtAccessExpiresIn: getOptionalEnv("JWT_ACCESS_EXPIRES_IN", "15m"),
  jwtRefreshExpiresIn: getOptionalEnv("JWT_REFRESH_EXPIRES_IN", "7d"),
  rateLimitMaxRequests: getRequiredEnvNumber("RATE_LIMIT_MAX_REQUESTS", 1000),
  csrfMaxRequests: getRequiredEnvNumber("CSRF_MAX_REQUESTS", 60),
  csrfSecret: process.env.CSRF_SECRET || null,
  apiKeySecret: resolveApiKeySecret(resolvedNodeEnv),
  oidc: resolveOidcConfig(resolvedAuthMode),
  enablePasswordReset: getOptionalBoolean("ENABLE_PASSWORD_RESET", false),
  enableRefreshTokenRotation: getOptionalBoolean(
    "ENABLE_REFRESH_TOKEN_ROTATION",
    true,
  ),
  enableAuditLogging: getOptionalBoolean("ENABLE_AUDIT_LOGGING", false),
  enforceHttpsRedirect: getOptionalBoolean("ENFORCE_HTTPS_REDIRECT", true),
  bootstrapSetupCodeTtlMs: getRequiredEnvNumber(
    "BOOTSTRAP_SETUP_CODE_TTL_MS",
    15 * 60 * 1000,
  ),
  bootstrapSetupCodeMaxAttempts: getRequiredEnvNumber(
    "BOOTSTRAP_SETUP_CODE_MAX_ATTEMPTS",
    10,
  ),
  limits: loadRequestLimits(),
  libraries: resolveLibraryConfig(),
  mcp: resolveMcpConfig(),
};

if (config.nodeEnv === "production") {
  const normalizedSecret = config.jwtSecret.trim();
  const normalizedApiKeySecret = config.apiKeySecret.trim();
  const insecureJwtSecretPlaceholders = new Set([
    "your-secret-key-change-in-production",
    "change-this-secret-in-production-min-32-chars",
  ]);
  const insecureApiKeySecretPlaceholders = new Set([
    "change_me_strong_random_secret",
    "change-this-api-key-secret-in-production",
  ]);

  if (config.jwtSecret.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters long in production",
    );
  }
  if (insecureJwtSecretPlaceholders.has(normalizedSecret)) {
    throw new Error(
      "JWT_SECRET must be changed from placeholder/default value in production",
    );
  }
  if (config.apiKeySecret.length < 32) {
    throw new Error(
      "API_KEY_SECRET must be at least 32 characters long in production",
    );
  }
  if (insecureApiKeySecretPlaceholders.has(normalizedApiKeySecret)) {
    throw new Error(
      "API_KEY_SECRET must be changed from placeholder/default value in production",
    );
  }
  if (
    config.oidc.enabled &&
    config.oidc.redirectUri &&
    !/^https:\/\//i.test(config.oidc.redirectUri)
  ) {
    throw new Error("OIDC_REDIRECT_URI must be HTTPS in production");
  }
}

console.log("Configuration validated successfully");
console.log(
  "[config] Effective payload/import limits:",
  summarizeRequestLimits(config.limits),
);
