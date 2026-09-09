// validateOwnerVisualExemption の単体検査。
// パッチ版を gate と同じディレクトリへ一時的に書いて import する（相対importを解決させるため）。
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const GATE = "C:/AI/figma-to-code/templates/verify/figma-gate.mjs";
const patchedPath = join(dirname(GATE), `__exemption-harness-${process.pid}.mjs`);

const src = readFileSync(GATE, "utf8");
// import 時にCLIが走らないよう、末尾のディスパッチを切り落とす。
const cliAt = src.indexOf('if (command !== "versions") assertNotPlaybookRoot();');
if (cliAt < 0) throw new Error("CLI入口を特定できない");
const body = src.slice(0, cliAt);
const patched = body.replace(
  /function fail\(message\) \{[\s\S]*?\n\}/,
  "function fail(message){ const e=new Error(message); e.__gate=true; throw e; }",
) + "\nexport { validateOwnerVisualExemption };\n";
if (patched === body + "\nexport { validateOwnerVisualExemption };\n") throw new Error("fail() を差し替えられていない");
writeFileSync(patchedPath, patched, "utf8");

const dir = mkdtempSync(join(tmpdir(), "owner-exemption-"));
mkdirSync(join(dir, "MyBrain/verify/evidence"), { recursive: true });
mkdirSync(join(dir, "assets/scss"), { recursive: true });
const cssRel = "assets/scss/partners.scss";
const cssBody = ".partners-listing { display: block }\n";
writeFileSync(join(dir, cssRel), cssBody, "utf8");
const cssHash = createHash("sha256").update(cssBody).digest("hex");

const basis = (over = {}) => ({
  approvedBy: "owner",
  approvedAt: "2026-09-09",
  instruction: "企業一覧も、最新のCSS指定を正として旧Figma画像との完全一致を配備条件から外して良い",
  selector: ".partners-listing",
  cssPath: cssRel,
  cssSha256: cssHash,
  ...over,
});

const previousCwd = process.cwd();
process.chdir(dir);
let mod;
try {
  mod = await import(pathToFileURL(patchedPath).href);
} finally {
  process.chdir(previousCwd);
}
if (typeof mod.validateOwnerVisualExemption !== "function") throw new Error("検査対象を読み込めていない");

let failures = 0;
const run = (label, { basisDoc, selector = ".partners-listing", expect }) => {
  const basisRel = "MyBrain/verify/evidence/decision.json";
  writeFileSync(join(dir, basisRel), JSON.stringify(basisDoc, null, 2), "utf8");
  process.chdir(dir);
  let got, detail;
  try {
    const r = mod.validateOwnerVisualExemption({ basisPath: basisRel }, "components[0].ownerVisualExemption", selector);
    got = "OK"; detail = `approvedAt=${r.approvedAt} selector=${r.selector}`;
  } catch (error) {
    if (!error.__gate) throw error;   // ゲート以外の例外は空振りなので握りつぶさない
    got = "FAIL"; detail = error.message.slice(0, 110);
  } finally {
    process.chdir(previousCwd);
  }
  const ok = got === expect;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  → ${got}: ${detail}`);
};

console.log("owner visual exemption\n");
run("正常な承認は通る", { basisDoc: basis(), expect: "OK" });
run("負: approvedBy が owner でない", { basisDoc: basis({ approvedBy: "claude" }), expect: "FAIL" });
run("負: 指示が20文字未満", { basisDoc: basis({ instruction: "OK" }), expect: "FAIL" });
run("負: 別の節の承認を流用", { basisDoc: basis({ selector: ".partners-services" }), expect: "FAIL" });
run("負: 承認後にCSSが変わった", { basisDoc: basis({ cssSha256: "0".repeat(64) }), expect: "FAIL" });
run("負: approvedAt が無い", { basisDoc: (() => { const b = basis(); delete b.approvedAt; return b; })(), expect: "FAIL" });

rmSync(dir, { recursive: true, force: true });
if (existsSync(patchedPath)) rmSync(patchedPath, { force: true });
console.log(`\n失敗 ${failures} 件`);
process.exit(failures === 0 ? 0 : 1);
