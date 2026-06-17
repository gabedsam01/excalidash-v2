import { describe, expect, it } from "vitest";
import {
  loadRequestLimits,
  summarizeRequestLimits,
} from "../limits";

describe("request limits configuration", () => {
  it("uses self-hosted defaults", () => {
    const limits = loadRequestLimits({});

    expect(summarizeRequestLimits(limits)).toEqual({
      MAX_UPLOAD_MB: 250,
      MAX_JSON_BODY_MB: 100,
      MAX_URLENCODED_BODY_MB: 100,
      MAX_SOCKET_PAYLOAD_MB: 100,
      MAX_IMPORT_DRAWING_MB: 100,
      MAX_IMPORT_MANIFEST_MB: 10,
      MAX_IMPORT_TOTAL_EXTRACTED_MB: 500,
      MAX_DATA_URL_MB: 100,
      MAX_IMPORT_ARCHIVE_ENTRIES: 10_000,
      MAX_IMPORT_COLLECTIONS: 2_000,
      MAX_IMPORT_DRAWINGS: 10_000,
    });
    expect(limits.upload.bytes).toBe(250 * 1024 * 1024);
  });

  it("accepts positive decimal MB values and positive integer counts", () => {
    const limits = loadRequestLimits({
      MAX_UPLOAD_MB: "32.5",
      MAX_IMPORT_ARCHIVE_ENTRIES: "123",
    });

    expect(limits.upload).toEqual({
      mb: 32.5,
      bytes: 32.5 * 1024 * 1024,
    });
    expect(limits.importArchiveEntries).toBe(123);
  });

  it.each(["", "0", "-1", "not-a-number", "Infinity"])(
    "rejects invalid size value %j",
    (value) => {
      expect(() => loadRequestLimits({ MAX_UPLOAD_MB: value })).toThrow(
        "MAX_UPLOAD_MB",
      );
    },
  );

  it("rejects fractional count limits", () => {
    expect(() =>
      loadRequestLimits({ MAX_IMPORT_DRAWINGS: "10.5" }),
    ).toThrow("MAX_IMPORT_DRAWINGS");
  });
});
