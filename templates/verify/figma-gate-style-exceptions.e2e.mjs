#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("./figma-gate.e2e.mjs", import.meta.url)),
  "--style-exceptions-only",
], { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
