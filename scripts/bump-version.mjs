#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { alphadec } from "../src/lib/alphadec.js";

// Use the same UTC instant for the canonical timestamp and readable suffix.
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const file = new URL("../src/version.js", import.meta.url);
const pattern = /(export const MCPCLOCK_VERSION = ")([^"]+)(")/;
const now = new Date();
const version = `${alphadec.encode(now).canonical}_${String(now.getUTCDate()).padStart(2, "0")}${months[now.getUTCMonth()]}`;
const source = readFileSync(file, "utf8");
const match = source.match(pattern);
if (!match) throw new Error("MCPCLOCK_VERSION not found in src/version.js");
writeFileSync(file, source.replace(pattern, (_, before, previous, after) => `${before}${version}${after}`));
console.log(`${match[2]} -> ${version}`);
