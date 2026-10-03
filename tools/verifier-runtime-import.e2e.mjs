// 配布先には正本の兄弟ディレクトリが無い。隔離コピーで import 解決を検査する。
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const source = fileURLToPath(new URL("../templates/verify/", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "verifier-runtime-import-"));
const files = ["viewport-contract.mjs", "viewport-node-map.mjs", "css-scope-digest.mjs", "figma-page-coverage.mjs"];
const probe = (file) => spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(join(root, file)).href)})`], { encoding: "utf8", cwd: root });
try {
  for (const file of files) copyFileSync(join(source, file), join(root, file));
  for (const file of files) {
    const result = probe(file);
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
  // 存在だけの検査では拾えない、配布先の依存欠落も非0で拒否されること。
  for (const file of ["viewport-contract.mjs", "figma-page-coverage.mjs"]) {
    const original = join(root, file);
    renameSync(original, `${original}.absent`);
    try {
      const result = probe("viewport-node-map.mjs");
      assert.notEqual(result.status, 0, `${file} の欠落を拒否する`);
      assert.match(result.stderr, /ERR_MODULE_NOT_FOUND/);
    } finally {
      renameSync(`${original}.absent`, original);
    }
  }
  console.log("PASS 配布先の import 解決と依存欠落の拒否");
} finally {
  rmSync(root, { recursive: true, force: true });
}
