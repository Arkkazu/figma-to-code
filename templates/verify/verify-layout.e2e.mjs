#!/usr/bin/env node
// verify-layout.e2e.mjs — isolated test for measured text/style fields.

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const templateDirectory = dirname(fileURLToPath(import.meta.url));
const repo = mkdtempSync(join(tmpdir(), "verify-layout-e2e-"));
const verifyDirectory = join(repo, "MyBrain", "verify");

function write(relativePath, value) {
  const target = join(repo, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runVerify(specPath) {
  return spawnSync(process.execPath, [join(verifyDirectory, "verify-layout.mjs"), specPath], {
    cwd: repo,
    encoding: "utf8",
  });
}

try {
  mkdirSync(verifyDirectory, { recursive: true });
  copyFileSync(resolve(templateDirectory, "verify-layout.mjs"), join(verifyDirectory, "verify-layout.mjs"));
  write(
    "MyBrain/verify/cdp-browser.mjs",
    `export async function startCdpBrowser() {
  return {
    async evaluate() {
      return {
        page: { htmlFontSize: "16px", scrollWidth: 375 },
        els: {
          ".hidden": { display: "none" },
          ".title": {
            left: 20,
            top: 80,
            width: 335,
            height: 48,
            topInSection: 40,
            offsetLeft: 20,
            offsetTop: 40,
            fontSize: "16px",
            lineHeight: "24px",
            letterSpacing: "0.48px",
            backgroundColor: "rgba(0, 0, 0, 0)",
            color: "rgb(54, 54, 53)",
            borderTopColor: "rgb(15, 32, 64)",
            borderRightColor: "rgb(231, 230, 228)",
            borderBottomColor: "rgb(231, 230, 228)",
            borderLeftColor: "rgb(231, 230, 228)",
            borderTopWidth: "8px",
            borderRightWidth: "1px",
            borderBottomWidth: "1px",
            borderLeftWidth: "1px",
            objectFit: "cover",
            objectPosition: "50% 50%",
            borderRadius: "8px",
            borderTopLeftRadius: "8px",
            borderTopRightRadius: "8px",
            borderBottomRightRadius: "8px",
            borderBottomLeftRadius: "8px",
            paddingTop: "0px",
            paddingRight: "0px",
            paddingBottom: "0px",
            paddingLeft: "0px",
            marginTop: "0px",
            marginRight: "0px",
            marginBottom: "0px",
            marginLeft: "0px",
            rowGap: "normal",
            columnGap: "normal",
            gap: "normal",
            text: "Alpha\\nBeta",
            innerText: "Alpha\\nBeta",
            href: "https://example.test/case/",
            src: "https://example.test/assets/card.png",
            lineCount: 2,
            animationName: "none"
          }
        }
      };
    },
    async close() {}
  };
}
export async function navigateAndWait(_browser, args) { if (args.selectors.includes(".hidden")) throw new Error("hidden selector must not be a readiness root"); }`
  );
  const passSpec = {
    url: "http://127.0.0.1/test",
    viewportPolicy: { scrollbars: "hidden" },
    viewports: [
      {
        width: 375,
        page: { maxScrollWidth: 375 },
        elements: [
          {
            sel: ".title",
            lineHeight: "24px",
            text: "Alpha\nBeta",
            lineCount: 2,
            offsetLeft: 20,
            offsetTop: 40,
            href: "https://example.test/case/",
            src: "https://example.test/assets/card.png",
            borderTopColor: "rgb(15, 32, 64)",
            borderTopWidth: "8px",
            objectFit: "cover",
            objectPosition: "50% 50%",
            borderRadius: "8px",
            paddingTop: "0px",
          },
          { sel: ".hidden", display: "none" },
        ],
      },
    ],
  };
  write("MyBrain/verify/pass-spec.json", passSpec);
  const passResult = runVerify("MyBrain/verify/pass-spec.json");
  if (passResult.status !== 0) {
    throw new Error(`expected pass spec to pass:\n${passResult.stdout}\n${passResult.stderr}`);
  }

  const failSpec = structuredClone(passSpec);
  failSpec.viewports[0].elements[0].lineCount = 1;
  write("MyBrain/verify/fail-spec.json", failSpec);
  const failResult = runVerify("MyBrain/verify/fail-spec.json");
  const output = `${failResult.stdout}\n${failResult.stderr}`;
  if (failResult.status === 0 || !output.includes("FAIL  .title lineCount")) {
    throw new Error(`expected lineCount mismatch to fail:\n${output}`);
  }

  const borderColorFailSpec = structuredClone(passSpec);
  borderColorFailSpec.viewports[0].elements[0].borderTopColor = "rgb(0, 40, 84)";
  write("MyBrain/verify/border-color-fail-spec.json", borderColorFailSpec);
  const borderColorFailResult = runVerify("MyBrain/verify/border-color-fail-spec.json");
  const borderColorFailOutput = `${borderColorFailResult.stdout}\n${borderColorFailResult.stderr}`;
  if (borderColorFailResult.status === 0 || !borderColorFailOutput.includes("FAIL  .title borderTopColor")) {
    throw new Error(`expected borderTopColor mismatch to fail:\n${borderColorFailOutput}`);
  }
  console.log(borderColorFailOutput.split(/\r?\n/).find((line) => line.includes("FAIL  .title borderTopColor")));

  const borderWidthFailSpec = structuredClone(passSpec);
  borderWidthFailSpec.viewports[0].elements[0].borderTopWidth = "7px";
  write("MyBrain/verify/border-width-fail-spec.json", borderWidthFailSpec);
  const borderWidthFailResult = runVerify("MyBrain/verify/border-width-fail-spec.json");
  const borderWidthFailOutput = `${borderWidthFailResult.stdout}\n${borderWidthFailResult.stderr}`;
  if (borderWidthFailResult.status === 0 || !borderWidthFailOutput.includes("FAIL  .title borderTopWidth")) {
    throw new Error(`expected borderTopWidth mismatch to fail:\n${borderWidthFailOutput}`);
  }
  const objectFitFailSpec = structuredClone(passSpec);
  objectFitFailSpec.viewports[0].elements[0].objectFit = "contain";
  write("MyBrain/verify/object-fit-fail-spec.json", objectFitFailSpec);
  const objectFitFailResult = runVerify("MyBrain/verify/object-fit-fail-spec.json");
  const objectFitFailOutput = `${objectFitFailResult.stdout}\n${objectFitFailResult.stderr}`;
  if (objectFitFailResult.status === 0 || !objectFitFailOutput.includes("FAIL  .title objectFit")) {
    throw new Error(`expected objectFit mismatch to fail:\n${objectFitFailOutput}`);
  }
  console.log(objectFitFailOutput.split(/\r?\n/).find((line) => line.includes("FAIL  .title objectFit")));

  const objectPositionFailSpec = structuredClone(passSpec);
  objectPositionFailSpec.viewports[0].elements[0].objectPosition = "left top";
  write("MyBrain/verify/object-position-fail-spec.json", objectPositionFailSpec);
  const objectPositionFailResult = runVerify("MyBrain/verify/object-position-fail-spec.json");
  const objectPositionFailOutput = `${objectPositionFailResult.stdout}\n${objectPositionFailResult.stderr}`;
  if (objectPositionFailResult.status === 0 || !objectPositionFailOutput.includes("FAIL  .title objectPosition")) {
    throw new Error(`expected objectPosition mismatch to fail:\n${objectPositionFailOutput}`);
  }
  console.log(objectPositionFailOutput.split(/\r?\n/).find((line) => line.includes("FAIL  .title objectPosition")));

  const offsetLeftFailSpec = structuredClone(passSpec);
  offsetLeftFailSpec.viewports[0].elements[0].offsetLeft = 22;
  write("MyBrain/verify/offset-left-fail-spec.json", offsetLeftFailSpec);
  const offsetLeftFailResult = runVerify("MyBrain/verify/offset-left-fail-spec.json");
  const offsetLeftFailOutput = `${offsetLeftFailResult.stdout}\n${offsetLeftFailResult.stderr}`;
  if (offsetLeftFailResult.status === 0 || !offsetLeftFailOutput.includes("FAIL  .title offsetLeft")) {
    throw new Error(`expected offsetLeft mismatch to fail:\n${offsetLeftFailOutput}`);
  }
  console.log(offsetLeftFailOutput.split(/\r?\n/).find((line) => line.includes("FAIL  .title offsetLeft")));

  const offsetTopFailSpec = structuredClone(passSpec);
  offsetTopFailSpec.viewports[0].elements[0].offsetTop = 42;
  write("MyBrain/verify/offset-top-fail-spec.json", offsetTopFailSpec);
  const offsetTopFailResult = runVerify("MyBrain/verify/offset-top-fail-spec.json");
  const offsetTopFailOutput = `${offsetTopFailResult.stdout}\n${offsetTopFailResult.stderr}`;
  if (offsetTopFailResult.status === 0 || !offsetTopFailOutput.includes("FAIL  .title offsetTop")) {
    throw new Error(`expected offsetTop mismatch to fail:\n${offsetTopFailOutput}`);
  }
  console.log(offsetTopFailOutput.split(/\r?\n/).find((line) => line.includes("FAIL  .title offsetTop")));

  const hrefFailSpec = structuredClone(passSpec);
  hrefFailSpec.viewports[0].elements[0].href = "https://example.test/other/";
  write("MyBrain/verify/href-fail-spec.json", hrefFailSpec);
  const hrefFailResult = runVerify("MyBrain/verify/href-fail-spec.json");
  const hrefFailOutput = `${hrefFailResult.stdout}\n${hrefFailResult.stderr}`;
  if (hrefFailResult.status === 0 || !hrefFailOutput.includes("FAIL  .title href")) {
    throw new Error(`expected href mismatch to fail:\n${hrefFailOutput}`);
  }
  console.log(hrefFailOutput.split(/\r?\n/).find((line) => line.includes("FAIL  .title href")));

  const srcFailSpec = structuredClone(passSpec);
  srcFailSpec.viewports[0].elements[0].src = "https://example.test/assets/other.png";
  write("MyBrain/verify/src-fail-spec.json", srcFailSpec);
  const srcFailResult = runVerify("MyBrain/verify/src-fail-spec.json");
  const srcFailOutput = `${srcFailResult.stdout}\n${srcFailResult.stderr}`;
  if (srcFailResult.status === 0 || !srcFailOutput.includes("FAIL  .title src")) {
    throw new Error(`expected src mismatch to fail:\n${srcFailOutput}`);
  }
  console.log(srcFailOutput.split(/\r?\n/).find((line) => line.includes("FAIL  .title src")));

  // textPattern: 実データで変わる文言を書式で検証する経路。
  // 一致する書式は通り、一致しない書式は落ちること（宣言だけ通って比較が素通りするのを防ぐ）。
  const patternSpec = structuredClone(passSpec);
  delete patternSpec.viewports[0].elements[0].text;
  patternSpec.viewports[0].elements[0].textPattern = "^Alpha\\nBeta$";
  patternSpec.viewports[0].elements[0].textPatternReason = "件数のような動的値を想定した書式検証の経路確認";
  write("MyBrain/verify/pattern-spec.json", patternSpec);
  const patternResult = runVerify("MyBrain/verify/pattern-spec.json");
  if (patternResult.status !== 0) {
    throw new Error(`expected textPattern spec to pass:\n${patternResult.stdout}\n${patternResult.stderr}`);
  }

  const patternFailSpec = structuredClone(patternSpec);
  patternFailSpec.viewports[0].elements[0].textPattern = "^Gamma";
  write("MyBrain/verify/pattern-fail-spec.json", patternFailSpec);
  const patternFailResult = runVerify("MyBrain/verify/pattern-fail-spec.json");
  const patternOutput = `${patternFailResult.stdout}\n${patternFailResult.stderr}`;
  if (patternFailResult.status === 0 || !patternOutput.includes("FAIL  .title textPattern")) {
    throw new Error(`expected textPattern mismatch to fail:\n${patternOutput}`);
  }

  console.log("verify-layout E2E PASS");
} finally {
  rmSync(repo, { recursive: true, force: true });
}
