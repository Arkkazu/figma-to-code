// verify-layout.mjs — spec-driven CDP layout verification.
// Usage: node MyBrain/verify/verify-layout.mjs MyBrain/verify/spec-top.json [baseUrl]

import { readFileSync } from "node:fs";
import { navigateAndWait, startCdpBrowser } from "./cdp-browser.mjs";
import { pathToFileURL } from "node:url";

let activeSpec = null;
let activeUrl = null;
let tolerance = 1.5;
let failCount = 0;
let passCount = 0;

function check(label, actual, expected) {
  let ok;
  let expectedText;
  if (Array.isArray(expected)) {
    ok = typeof actual === "number" && actual >= expected[0] && actual <= expected[1];
    expectedText = `${expected[0]}..${expected[1]}`;
  } else if (typeof expected === "number") {
    ok = typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
    expectedText = `${expected} (±${tolerance})`;
  } else {
    ok = actual === expected;
    expectedText = String(expected);
  }
  if (ok) passCount += 1;
  else failCount += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  expected=${expectedText}  actual=${actual}`);
}

function checkExact(label, actual, expected) {
  const ok = actual === expected;
  if (ok) passCount += 1;
  else failCount += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  expected=${expected}  actual=${actual}`);
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ");
}

function configure(spec, url) {
  if (!spec || typeof spec !== "object") throw new Error("SPEC FAIL: layout spec must be an object.");
  const scrollbars = spec.viewportPolicy?.scrollbars;
  if (scrollbars !== "hidden" && scrollbars !== "visible") {
    throw new Error('SPEC FAIL: spec.viewportPolicy.scrollbars must be "hidden" or "visible".');
  }
  if (!Array.isArray(spec.viewports) || spec.viewports.length === 0) {
    throw new Error("SPEC FAIL: spec.viewports must be a non-empty array.");
  }
  activeSpec = spec;
  activeUrl = url || spec.url;
  if (typeof activeUrl !== "string" || activeUrl.trim() === "") throw new Error("SPEC FAIL: layout verification URL is required.");
  tolerance = spec.tolerance ?? 1.5;
  failCount = 0;
  passCount = 0;
  return scrollbars;
}

async function runWithBrowser(browser) {
  console.log(`viewport policy: scrollbars=${activeSpec.viewportPolicy.scrollbars}`);
    for (const viewport of activeSpec.viewports) {
      console.log(`\n===== viewport ${viewport.width}px =====`);
      // display:none / visibility:hidden を期待値として持つ要素は、後段で実測して状態を照合する。
      // readiness は可視の測定rootを待つ契約のため、非表示期待要素まで可視化を待機すると
      // ページネーションのSP非表示itemのような正しい状態でタイムアウトしてしまう。
      const readinessSelectors = viewport.elements
        .filter((element) => element.display !== "none" && element.visibility !== "hidden")
        .map((element) => element.sel);
      await navigateAndWait(browser, {
        url: activeUrl,
        width: viewport.width,
        selectors: readinessSelectors,
      });

      const data = await browser.evaluate(`(() => {
        function normalizeText(value) {
          return String(value ?? "")
            .replace(/\\r\\n/g, "\\n")
            .replace(/\\u00a0/g, " ");
        }

        function renderedLineCount(element) {
          const range = document.createRange();
          const elementRect = element.getBoundingClientRect();
          range.selectNodeContents(element);
          const tops = new Set();
          for (const rect of range.getClientRects()) {
            if (rect.width > 0 && rect.height > 0
              && rect.bottom > elementRect.top && rect.top < elementRect.bottom) {
              tops.add(Math.round(rect.top * 10) / 10);
            }
          }
          range.detach();
          return tops.size || null;
        }

        const output = {
          page: {
            htmlFontSize: getComputedStyle(document.documentElement).fontSize,
            scrollWidth: document.body.scrollWidth,
          },
          els: {},
        };
        const selectors = ${JSON.stringify(viewport.elements.map((element) => element.sel))};
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (!element) {
            output.els[selector] = null;
            continue;
          }
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const section = element.closest("section");
          output.els[selector] = {
            left: +rect.left.toFixed(1),
            top: +rect.top.toFixed(1),
            width: +rect.width.toFixed(1),
            height: +rect.height.toFixed(1),
            topInSection: section ? +(rect.top - section.getBoundingClientRect().top).toFixed(1) : null,
            // ページ上の絶対座標は先行セクションの実データ高で変動する。
            // mask対象の画像・本文はカード内部の相対位置も照合し、データ差で隠した配置崩れを防ぐ。
            offsetLeft: element.offsetLeft,
            offsetTop: element.offsetTop,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            // 非表示指定もレイアウト仕様の一部。SP専用で隠すページ番号などを、
            // readinessではなく実測値として判定する。
            display: style.display,
            visibility: style.visibility,
            whiteSpace: style.whiteSpace,
            overflow: style.overflow,
            textOverflow: style.textOverflow,
            webkitLineClamp: style.webkitLineClamp,
            letterSpacing: style.letterSpacing,
            // 揃え・太さは見た目を決めるがgetBoundingClientRectに現れず、画像差分でしか露見しない。
            // 実際にSP本文の中央寄せ誤りをここで取り逃がしたため測定項目へ追加した（spec/09 §2-1）。
            textAlign: style.textAlign,
            fontWeight: style.fontWeight,
            // 書体が違えば同じ font-size / line-height でもグリフの形と行内の位置が変わる。
            // 矩形は一致したまま描画だけずれるため、実測層で押さえないと画像差分でしか出ない。
            fontFamily: style.fontFamily,
            backgroundColor: style.backgroundColor,
            color: style.color,
            // 枠線の色と太さは矩形に現れず、近似色同士だと画像差分にも出ない。
            // 実測でカード枠線の #0f2040 と Figma #002854 の取り違えを取り逃がしたため測定項目へ追加した。
            borderTopColor: style.borderTopColor,
            borderRightColor: style.borderRightColor,
            borderBottomColor: style.borderBottomColor,
            borderLeftColor: style.borderLeftColor,
            borderTopWidth: style.borderTopWidth,
            borderRightWidth: style.borderRightWidth,
            borderBottomWidth: style.borderBottomWidth,
            borderLeftWidth: style.borderLeftWidth,
            // visual maskで画像内容を除外しても、画像のcrop方法と焦点位置はレイアウト仕様として検証する。
            // SP事例一覧でPC正データをmaskするため、object-fit / object-positionを実測項目へ追加した。
            objectFit: style.objectFit,
            objectPosition: style.objectPosition,
            borderRadius: style.borderRadius,
            borderTopLeftRadius: style.borderTopLeftRadius,
            borderTopRightRadius: style.borderTopRightRadius,
            borderBottomRightRadius: style.borderBottomRightRadius,
            borderBottomLeftRadius: style.borderBottomLeftRadius,
            paddingTop: style.paddingTop,
            paddingRight: style.paddingRight,
            paddingBottom: style.paddingBottom,
            paddingLeft: style.paddingLeft,
            marginTop: style.marginTop,
            marginRight: style.marginRight,
            marginBottom: style.marginBottom,
            marginLeft: style.marginLeft,
            rowGap: style.rowGap,
            columnGap: style.columnGap,
            gap: style.gap,
            text: normalizeText(element.textContent),
            innerText: normalizeText(element.innerText),
            // リンク先と画像ソースは矩形やpixel diffだけでは同一性を保証できない。
            // 事例カードのhrefと画像を未検証のままpage coverageレビューへ出したため、DOM属性を測定する。
            href: element.getAttribute("href"),
            src: element.getAttribute("src"),
            lineCount: renderedLineCount(element),
            // 子要素の個数。リスト・表・グリッドは「何個あるか」自体が仕様で、
            // 1件でも欠ければ実装漏れだが、個々の要素を測るだけでは総数の欠落に気づけない。
            childElementCount: element.childElementCount,
            animationName: style.animationName,
          };
        }
        return output;
      })()`);

      if (viewport.page) {
        for (const [key, expected] of Object.entries(viewport.page)) {
          if (key === "maxScrollWidth") {
            check("page scrollWidth<=", data.page.scrollWidth <= expected ? data.page.scrollWidth : data.page.scrollWidth, [0, expected]);
          } else {
            check(`page ${key}`, data.page[key], expected);
          }
        }
      }

      for (const element of viewport.elements) {
        const measured = data.els[element.sel];
        if (!measured) {
          failCount += 1;
          console.log(`FAIL  ${element.sel}  要素が見つからない`);
          continue;
        }
        for (const [key, expected] of Object.entries(element)) {
          // provenance は取得元のメタ情報でDOMの測定項目ではない。sel / note と同じくスキップする。
          if (key === "sel" || key === "note" || key === "provenance" || key === "textPatternReason") continue;
          if (key === "text" || key === "innerText") {
            check(`${element.sel} ${key}`, normalizeText(measured[key]), normalizeText(expected));
            continue;
          }
          // 件数・日付・ページ番号のように実データで変わる文言は、値ではなく書式を検証する。
          // 文言検証を免除するのではなく、正規表現で「何であるべきか」を宣言させる。
          if (key === "textPattern") {
            const actual = normalizeText(measured.text);
            const matched = new RegExp(expected).test(actual);
            if (matched) {
              passCount += 1;
              console.log(`PASS  ${element.sel} textPattern  /${expected}/ に一致「${actual}」`);
            } else {
              failCount += 1;
              console.log(`FAIL  ${element.sel} textPattern  /${expected}/ に一致しない: 実際「${actual}」`);
            }
            continue;
          }
          if (key === "lineCount") {
            checkExact(`${element.sel} ${key}`, measured[key], expected);
            continue;
          }
          check(`${element.sel} ${key}`, measured[key], expected);
        }
      }
    }

  console.log(`\n===== 結果: PASS ${passCount} / FAIL ${failCount} =====`);
  return { passCount, failCount, status: failCount === 0 ? "PASS" : "FAIL", browserSessionId: browser.sessionId, browserPid: browser.browserPid };
}

// figma-gate のPC/SP batchから渡されたbrowserを所有しない。別Chromeを起動しない。
export async function runLayoutVerificationInBrowser({ browser, spec, url }) {
  if (!browser || typeof browser.send !== "function") throw new Error("VERIFY LAYOUT: browser must be a live CDP session.");
  configure(spec, url);
  return runWithBrowser(browser);
}

async function main() {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error("usage: node verify-layout.mjs <spec.json> [baseUrl]");
    process.exitCode = 2;
    return;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const scrollbars = configure(spec, process.argv[3] || spec.url);
  const browser = await startCdpBrowser({ scrollbars });
  try {
    const result = await runWithBrowser(browser);
    if (result.failCount > 0) {
      console.log('FAILがある間は「完了」「Figmaどおり」と報告しない（figma-spec-pipeline.md）');
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`VERIFY LAYOUT: ${error.message}`);
    process.exitCode = 1;
  });
}