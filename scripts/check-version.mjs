#!/usr/bin/env node
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/version.js", import.meta.url), "utf8");
const localVersion = source.match(/export const MCPCLOCK_VERSION = "([^"]+)"/)?.[1];
if (!localVersion) throw new Error("MCPCLOCK_VERSION not found in src/version.js");
const endpoint = `${(process.argv[2] ?? "https://mcpclock.firasd.workers.dev").replace(/\/$/, "")}/tools/clock_help`;
const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000), cache: "no-store" });
if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}`);
const { version: deployedVersion } = await response.json();
if (typeof deployedVersion !== "string" || !deployedVersion) throw new Error(`${endpoint} did not return a version`);
console.log(`configured: ${localVersion}`);
console.log(`deployed:   ${deployedVersion}`);
if (localVersion !== deployedVersion) {
  console.error("version mismatch");
  process.exitCode = 1;
} else {
  console.log("versions match");
}
