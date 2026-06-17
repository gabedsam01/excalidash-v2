#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
};

const sizeMb = Number(readArg("--size-mb", "35"));
const outputPath = path.resolve(
  readArg("--output", `large-${sizeMb}mb.excalidraw`),
);

if (!Number.isFinite(sizeMb) || sizeMb <= 0) {
  throw new Error("--size-mb must be a positive number");
}

const targetBytes = Math.floor(sizeMb * 1024 * 1024);
const baseDrawing = {
  type: "excalidraw",
  version: 2,
  source: "excalidash-large-upload-fixture",
  elements: [],
  appState: {
    viewBackgroundColor: "#ffffff",
  },
  files: {
    "large-fixture-image": {
      id: "large-fixture-image",
      mimeType: "image/png",
      created: Date.now(),
      lastRetrieved: Date.now(),
      dataURL: "data:image/png;base64,",
    },
  },
};

const emptyPayloadBytes = Buffer.byteLength(JSON.stringify(baseDrawing));
const fillerBytes = targetBytes - emptyPayloadBytes;
if (fillerBytes < 4) {
  throw new Error(
    `Requested size is too small; use at least ${Math.ceil(emptyPayloadBytes / 1024 / 1024)} MB`,
  );
}

baseDrawing.files["large-fixture-image"].dataURL += "A".repeat(fillerBytes);
const payload = JSON.stringify(baseDrawing);

fs.writeFileSync(outputPath, payload);

console.log(
  `Created ${outputPath} (${(Buffer.byteLength(payload) / 1024 / 1024).toFixed(2)} MiB)`,
);
