const BYTES_PER_MB = 1024 * 1024;

export type SizeLimit = {
  mb: number;
  bytes: number;
};

export type RequestLimits = {
  upload: SizeLimit;
  jsonBody: SizeLimit;
  urlencodedBody: SizeLimit;
  socketPayload: SizeLimit;
  importDrawing: SizeLimit;
  importManifest: SizeLimit;
  importTotalExtracted: SizeLimit;
  dataUrl: SizeLimit;
  importArchiveEntries: number;
  importCollections: number;
  importDrawings: number;
};

type Environment = Record<string, string | undefined>;

const parsePositiveNumber = (
  env: Environment,
  key: string,
  defaultValue: number,
  integerOnly = false,
): number => {
  const rawValue = env[key];
  if (rawValue === undefined) return defaultValue;

  const normalized = rawValue.trim();
  const parsed = Number(normalized);
  const isValid =
    normalized.length > 0 &&
    Number.isFinite(parsed) &&
    parsed > 0 &&
    (!integerOnly || Number.isInteger(parsed));

  if (!isValid) {
    const expected = integerOnly ? "a positive integer" : "a positive number";
    throw new Error(
      `Invalid value for environment variable ${key}: must be ${expected}`,
    );
  }

  return parsed;
};

const readSizeLimit = (
  env: Environment,
  key: string,
  defaultMb: number,
): SizeLimit => {
  const mb = parsePositiveNumber(env, key, defaultMb);
  const bytes = Math.floor(mb * BYTES_PER_MB);

  if (!Number.isSafeInteger(bytes) || bytes < 1) {
    throw new Error(
      `Invalid value for environment variable ${key}: converted byte limit is outside the supported range`,
    );
  }

  return { mb, bytes };
};

export const loadRequestLimits = (
  env: Environment = process.env,
): RequestLimits => ({
  upload: readSizeLimit(env, "MAX_UPLOAD_MB", 250),
  jsonBody: readSizeLimit(env, "MAX_JSON_BODY_MB", 100),
  urlencodedBody: readSizeLimit(env, "MAX_URLENCODED_BODY_MB", 100),
  socketPayload: readSizeLimit(env, "MAX_SOCKET_PAYLOAD_MB", 100),
  importDrawing: readSizeLimit(env, "MAX_IMPORT_DRAWING_MB", 100),
  importManifest: readSizeLimit(env, "MAX_IMPORT_MANIFEST_MB", 10),
  importTotalExtracted: readSizeLimit(
    env,
    "MAX_IMPORT_TOTAL_EXTRACTED_MB",
    500,
  ),
  dataUrl: readSizeLimit(env, "MAX_DATA_URL_MB", 100),
  importArchiveEntries: parsePositiveNumber(
    env,
    "MAX_IMPORT_ARCHIVE_ENTRIES",
    10_000,
    true,
  ),
  importCollections: parsePositiveNumber(
    env,
    "MAX_IMPORT_COLLECTIONS",
    2_000,
    true,
  ),
  importDrawings: parsePositiveNumber(
    env,
    "MAX_IMPORT_DRAWINGS",
    10_000,
    true,
  ),
});

export const bytesToMb = (bytes: number): number =>
  Number((bytes / BYTES_PER_MB).toFixed(6));

export const summarizeRequestLimits = (limits: RequestLimits) => ({
  MAX_UPLOAD_MB: limits.upload.mb,
  MAX_JSON_BODY_MB: limits.jsonBody.mb,
  MAX_URLENCODED_BODY_MB: limits.urlencodedBody.mb,
  MAX_SOCKET_PAYLOAD_MB: limits.socketPayload.mb,
  MAX_IMPORT_DRAWING_MB: limits.importDrawing.mb,
  MAX_IMPORT_MANIFEST_MB: limits.importManifest.mb,
  MAX_IMPORT_TOTAL_EXTRACTED_MB: limits.importTotalExtracted.mb,
  MAX_DATA_URL_MB: limits.dataUrl.mb,
  MAX_IMPORT_ARCHIVE_ENTRIES: limits.importArchiveEntries,
  MAX_IMPORT_COLLECTIONS: limits.importCollections,
  MAX_IMPORT_DRAWINGS: limits.importDrawings,
});
