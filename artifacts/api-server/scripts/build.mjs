#!/usr/bin/env node
/**
 * Production build script for the API server.
 * Uses esbuild to bundle TypeScript → ESM, with pino worker-thread support.
 */
import { build } from "esbuild";
import { pinoPlugin } from "esbuild-plugin-pino";
import { mkdirSync } from "fs";

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/index.mjs",
  target: "node20",
  sourcemap: true,
  plugins: [pinoPlugin({ transports: ["pino-pretty"] })],
  packages: "external",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
  },
});

console.log("✅  API server built → dist/index.mjs");
