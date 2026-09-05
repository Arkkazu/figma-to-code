// lint-units.mjs — SCSS単位規約チェック（units.md / scss.md の機械検査）
// 使い方: node MyBrain/verify/lint-units.mjs <scssファイル...>
// 終了コード: 0 = 違反なし / 1 = エラーあり
//
// 検査内容（units.md準拠）:
//  E1: line-height に rem/px/em → 単位なしで書く（Figma px → px÷font-size）
//  E2: letter-spacing に px/rem → em で書く（Figma % → %/100、px → px÷font-size）
//  E3: レイアウト系プロパティの px 直書き → rem で書く
//      許容: border系プロパティ / @media / 理由コメント（//）付きの行
//  E4: @media ブロック内での &__ / &-- セレクター再宣言
//      → scss.mdのNGパターン（同じクラス名の二重定義・PC/SP指定の分離）。
//        @media は各要素ブロックの「内側」に置き、要素の再宣言をしない
//  E5: ネストした &__ / &-- セレクターに展開後セレクターの直前コメントがない
//      → corrections.mdの「展開後セレクターコメント」規約。
//  E6: 同じ親ブロック内で展開後BEMセレクターを重複して定義している
//      → scss.mdの「同じクラス名を二重定義しない」規約。
//  E7: トップレベルの@media内で複数BEMブロックを横断していない
//      → scss.mdの「下部の一括@mediaに分散させない」規約。
//  E8: 親または要素の@media内に子孫セレクターをネストしていない
//      → 子孫セレクター自身のブロック内へ@mediaを置く。
//  E9: 共有コンポーネントが所有するプロパティをページ固有BEM要素で重複指定していない
//      → shared-component-ownership.jsonの所有プロパティは、Figma理由付きの例外以外で上書きしない。
//  W1: margin-bottom / margin-right → 余白は上・左で作る（scss.md）。理由コメント付きは許容
import { existsSync, readFileSync } from 'node:fs';

// --exceptions <path> で例外台帳を渡す。台帳は coding manifest そのもの
// （scope.styleRuleApplication.exceptions）でも、同じ形の単独ファイルでもよい。
const argv = process.argv.slice(2);
const exceptionsIndex = argv.indexOf('--exceptions');
const exceptionsPath = exceptionsIndex >= 0 ? argv[exceptionsIndex + 1] : null;
if (exceptionsIndex >= 0 && (!exceptionsPath || exceptionsPath.startsWith('--'))) {
  console.error('--exceptions には台帳のパスが必要です。');
  process.exit(2);
}
const files = argv.filter((value, index) => {
  // --exceptions が無いとき exceptionsIndex は -1 なので、+1 が 0 になって
  // 先頭のファイルを取りこぼす。フラグがあるときだけ除外する。
  if (exceptionsIndex >= 0 && (index === exceptionsIndex || index === exceptionsIndex + 1)) return false;
  return !value.startsWith('--');
});
if (files.length === 0) {
  console.error('usage: node lint-units.mjs [--exceptions <台帳.json>] <scssファイル...>');
  process.exit(2);
}

// 例外は行内コメントではなく台帳で宣言する。
//
// 旧実装は「行に // があれば検査を飛ばす」だった（hasReason）。内容を問わないため
// `// x` でも免除され、**検証が自己申告で消える**。実測（2026-09-01、
// rpa-technologies-theme）: margin-bottom/right 20件のうち17件が行内コメントで
// 免除されており、W1 は警告のままなので exit にも影響していなかった。
// 今日塞いだ painted:false / uiChange:false と同じ族なので、同じ形で直す。
//
// 台帳の1件は file / selector / property / reason（20文字以上）を持つ。
// 承認は求めない。機械が真偽を判定できない設計判断のため、記録して棚卸しできる形にする。
function loadStyleRuleExceptions(pathname) {
  if (!pathname) return [];
  if (!existsSync(pathname)) {
    console.error(`--exceptions の台帳がありません: ${pathname}`);
    process.exit(2);
  }
  let document;
  try {
    document = JSON.parse(readFileSync(pathname, 'utf8'));
  } catch (error) {
    console.error(`--exceptions の台帳が不正なJSONです: ${pathname} (${error.message})`);
    process.exit(2);
  }
  const block = document?.scope?.styleRuleApplication ?? document?.styleRuleApplication ?? document;
  const list = Array.isArray(block?.exceptions) ? block.exceptions : [];
  return list.map((entry, index) => {
    const label = `styleRuleApplication.exceptions[${index}]`;
    for (const key of ['file', 'selector', 'property', 'reason']) {
      if (typeof entry?.[key] !== 'string' || entry[key].trim() === '') {
        console.error(`${label}.${key} が必要です（${pathname}）。`);
        process.exit(2);
      }
    }
    if (entry.reason.trim().length < 20) {
      console.error(`${label}.reason は20文字以上で理由を書いてください（${pathname}）。`);
      process.exit(2);
    }
    return {
      file: entry.file.replace(/\\/g, '/').trim(),
      selector: entry.selector.trim(),
      property: entry.property.trim(),
    };
  });
}

const styleRuleExceptions = loadStyleRuleExceptions(exceptionsPath);
function hasDeclaredException(file, selector, property) {
  const normalized = String(file).replace(/\\/g, '/');
  return styleRuleExceptions.some((entry) =>
    normalized.endsWith(entry.file) && entry.property === property && entry.selector === selector);
}

let errors = 0;
let warns = 0;

// E9（共有コンポーネント所有プロパティの二重指定）は案件ごとの台帳を必要とする。
// 台帳を持たない案件では E9 だけを無効にし、E1〜E8 と W1 は動かす。
// ここで exit すると、台帳を用意していない案件で lint 全体が使えなくなる。
const ownershipConfigPath = 'MyBrain/verify/shared-component-ownership.json';
const ownershipConfigExists = existsSync(ownershipConfigPath);
if (!ownershipConfigExists) {
  console.warn(`E9 skipped: ownership config not found (${ownershipConfigPath}). E1-E8 and W1 still run.`);
}

let sharedComponentOwnership = [];
try {
  // 台帳が無い案件では E9 の照合対象を空にして進む。壊れた台帳は従来どおり致命エラー。
  const config = ownershipConfigExists
    ? JSON.parse(readFileSync(ownershipConfigPath, 'utf8'))
    : { version: 1, components: [] };
  // version 2 は exclusivePathOwnership（ファイル単位の担当割り当て）を足した版。
  // E9 が見るのは components だけなので、1 と 2 のどちらでも同じ検査ができる。
  // exclusivePathOwnership は「誰がどのファイルを編集してよいか」の規約で、
  // 単位lintではなくゲート側で扱う性質のもの。ここでは無視する。
  if (config.version !== 1 && config.version !== 2) throw new Error('version must be 1 or 2.');
  if (!Array.isArray(config.components)) throw new Error('components array is required.');
  sharedComponentOwnership = config.components.map((component, index) => {
    if (
      typeof component.name !== 'string' ||
      typeof component.pageSelectorPattern !== 'string' ||
      !Array.isArray(component.ownedProperties) ||
      component.ownedProperties.some((property) => typeof property !== 'string')
    ) {
      throw new Error(`components[${index}] must define name, pageSelectorPattern, and ownedProperties.`);
    }
    return {
      name: component.name,
      pageSelectorPattern: new RegExp(component.pageSelectorPattern),
      ownedProperties: new Set(component.ownedProperties),
      propertyReasons: component.propertyReasons && typeof component.propertyReasons === 'object' ? component.propertyReasons : {},
    };
  });
} catch (error) {
  console.error(`E9 ownership config is invalid: ${error.message}`);
  process.exit(2);
}

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);

  // E5: 連結セレクターを含め、&__ / &-- の各セレクターグループに
  // 展開後の完全なセレクターを示す `// .…` コメントを直前に置く。
  lines.forEach((raw, i) => {
    const selector = raw.trim();
    if (!/^&(?:__|--)[^{]*\{/.test(selector)) return;

    let commentIndex = i - 1;
    while (commentIndex >= 0 && lines[commentIndex].trim() === '') commentIndex--;
    while (commentIndex >= 0 && /^&(?:__|--)[^{}]*,?$/.test(lines[commentIndex].trim())) {
      commentIndex--;
      while (commentIndex >= 0 && lines[commentIndex].trim() === '') commentIndex--;
    }

    if (commentIndex < 0 || !/^\/\/\s+\./.test(lines[commentIndex].trim())) {
      errors++;
      console.log(`E5 ${file}:${i + 1}  「${selector.replace(/\s*\{.*/, '')}」の直前に展開後セレクターコメント（例: // .block__element）を付ける（corrections.md）`);
    }
  });

  // E6: 同じ親セレクターに属する &__ / &-- を展開し、重複した定義を検出する。
  // @media はセレクター親子関係に含めず、要素ブロックの内側に置く規約を機械的に保証する。
  const selectorFrames = [];
  let selectorPending = '';
  const openSelectorFrame = (header, line) => {
    const trimmed = header.trim();
    const parent = [...selectorFrames].reverse().find((frame) => frame.kind === 'selector');
    const isAtRule = trimmed.startsWith('@');
    const mediaAncestor = [...selectorFrames].reverse().find((frame) => frame.kind === 'at-rule' && frame.isMedia);
    const selectorDepth = selectorFrames.filter((frame) => frame.kind === 'selector').length;
    const effective = isAtRule
      ? ''
      : trimmed.includes('&') && parent
        ? trimmed.replaceAll('&', parent.effective)
        : trimmed;

    // E8: 親・BEM要素の@media内で子孫セレクターを開かない。
    // その子孫セレクター自身の基本指定ブロックへ@mediaを移す。
    if (
      !isAtRule &&
      mediaAncestor &&
      mediaAncestor.selectorDepth > 0 &&
      selectorDepth >= mediaAncestor.selectorDepth &&
      !/^&(?:__|--)/.test(trimmed)
    ) {
      errors++;
      console.log(`E8 ${file}:${line}  親・要素の@media内で子孫セレクター「${trimmed.replace(/\s*\{.*/, '')}」を定義 → 子孫セレクター自身のブロック内へ@mediaを移す（scss.md）`);
    }

    if (parent && /&(?:__|--)/.test(trimmed)) {
      for (const selector of trimmed.split(',')) {
        const candidate = selector.trim();
        if (!/&(?:__|--)/.test(candidate)) continue;

        const resolved = candidate.replaceAll('&', parent.effective).replace(/\s+/g, ' ');
        const firstLine = parent.bemSelectors.get(resolved);
        if (firstLine) {
          errors++;
          console.log(`E6 ${file}:${line}  「${resolved}」を同じ親ブロック内で再定義（初出: ${firstLine}行）。既存の要素ブロックへ統合する（scss.md）`);
        } else {
          parent.bemSelectors.set(resolved, line);
        }
      }
    }

    selectorFrames.push({
      kind: isAtRule ? 'at-rule' : 'selector',
      effective,
      bemSelectors: new Map(),
      isMedia: isAtRule && trimmed.startsWith('@media'),
      selectorDepth,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const commentIndex = lines[i].indexOf('//');
    const code = lines[i].slice(0, commentIndex >= 0 ? commentIndex : lines[i].length).trim();
    if (!code) continue;

    // E9: ページ固有BEM要素に、共有コンポーネントが所有するプロパティを重複指定していないか。
    // 例外は同じ行に `// shared-component-override: <component> <Figma由来の理由>` を明記する。
    const declaration = code.match(/^([a-z-]+)\s*:/);
    if (declaration) {
      const activeSelector = [...selectorFrames].reverse().find((frame) => frame.kind === 'selector');
      if (activeSelector?.effective) {
        for (const component of sharedComponentOwnership) {
          if (!component.pageSelectorPattern.test(activeSelector.effective) || !component.ownedProperties.has(declaration[1])) continue;
          const overridePattern = new RegExp(`shared-component-override:\\s*${component.name}\\s+\\S`, 'i');
          if (overridePattern.test(lines[i])) continue;
          const reason = component.propertyReasons[declaration[1]] || '共有コンポーネントが所有するプロパティ';
          errors++;
          console.log(`E9 ${file}:${i + 1}  「${activeSelector.effective}」の${declaration[1]}は${component.name}が所有（${reason}）。ページ固有要素では差分だけ記述する。例外は同じ行に // shared-component-override: ${component.name} <Figma由来の理由> を付ける（scss.md）`);
        }
      }
    }

    let rest = code;
    while (rest) {
      const openAt = rest.indexOf('{');
      const closeAt = rest.indexOf('}');

      if (openAt >= 0 && (closeAt < 0 || openAt < closeAt)) {
        openSelectorFrame(`${selectorPending} ${rest.slice(0, openAt)}`, i + 1);
        selectorPending = '';
        rest = rest.slice(openAt + 1);
        continue;
      }

      if (closeAt >= 0) {
        selectorPending = '';
        selectorFrames.pop();
        rest = rest.slice(closeAt + 1);
        continue;
      }

      if (rest.endsWith(',') && /^[&.#[:\w-]/.test(rest)) {
        selectorPending = `${selectorPending} ${rest}`.trim();
      } else {
        selectorPending = '';
      }
      break;
    }
  }

  // E4 / E7用: @mediaブロックの深さを追跡する
  let depth = 0;
  const mediaStack = [];
  const topLevelMediaStack = [];
  // 例外台帳はセレクタ単位で書く。行番号は編集で動くため鍵にしない。
  // いちばん内側のセレクタ文字列（`&__label` など、ソースの表記そのまま）を鍵にする。
  // lint の出力にこの文字列を出すので、そのまま台帳へ写せる。
  const selectorStack = [];
  const innermostSelector = () => {
    for (let index = selectorStack.length - 1; index >= 0; index -= 1) {
      if (typeof selectorStack[index] === 'string' && selectorStack[index] !== '') return selectorStack[index];
    }
    return '(セレクタ外)';
  };
  lines.forEach((raw, i) => {
    const n = i + 1;
    // 行内コメントを分離（コメント部は検査対象外・理由コメント有無の判定に使う）
    const commentIdx = raw.indexOf('//');
    const code = commentIdx >= 0 ? raw.slice(0, commentIdx) : raw;
    const hasReason = commentIdx >= 0;
    const t = code.trim();

    // E7: トップレベルの@mediaは単一BEMブロックだけを扱う。
    // 各BEM要素の差分は、その要素自身の宣言ブロックへネストする。
    if (t.startsWith('@media') && depth === 0) {
      topLevelMediaStack.push({ line: n, depth, roots: new Set() });
    }
    if (topLevelMediaStack.length > 0) {
      const codeWithoutStrings = code.replace(/(["']).*?\1/g, '');
      for (const match of codeWithoutStrings.matchAll(/\.([a-zA-Z_-][\w-]*)/g)) {
        const root = match[1].replace(/(?:__|--).*/, '');
        topLevelMediaStack[topLevelMediaStack.length - 1].roots.add(root);
      }
    }

    // E4: @media内で &__ / &-- セレクターを開いていないか
    if (mediaStack.length > 0 && /^&(__|--)[^{]*\{/.test(t)) {
      errors++;
      console.log(`E4 ${file}:${n}  @media内で「${t.replace(/\s*\{.*/, '')}」を再宣言 → @mediaは各要素ブロック内に置く（scss.mdのNGパターン）`);
    }
    // 深さ更新（コメント除去後のコードで判定）
    const opens = (code.match(/\{/g) || []).length;
    const closes = (code.match(/\}/g) || []).length;
    if (t.startsWith('@media')) mediaStack.push(depth);
    // セレクタスタックの更新。開いた行は積み、閉じた分だけ取り崩す。
    // @media などのアットルールはセレクタではないので null を積み、深さの辻褄だけ合わせる。
    if (opens > closes) {
      selectorStack.push(t.startsWith('@') ? null : t.replace(/\s*\{\s*$/, '').trim());
    } else if (closes > opens) {
      for (let close = 0; close < closes - opens; close += 1) selectorStack.pop();
    }
    depth += opens - closes;

    while (topLevelMediaStack.length > 0 && depth <= topLevelMediaStack[topLevelMediaStack.length - 1].depth) {
      const media = topLevelMediaStack.pop();
      if (media.roots.size > 1) {
        errors++;
        console.log(`E7 ${file}:${media.line}  トップレベル@mediaで複数BEMブロック（${[...media.roots].join(', ')}）を横断 → 各親ブロック・要素ブロック内の@mediaへ統合する（scss.md）`);
      }
    }
    while (mediaStack.length > 0 && depth <= mediaStack[mediaStack.length - 1]) mediaStack.pop();

    if (!t) return;

    // E1: line-height の単位付き数値
    const lh = t.match(/line-height:\s*(-?[\d.]+)(rem|px|em)\b/);
    if (lh) {
      errors++;
      console.log(`E1 ${file}:${n}  line-height: ${lh[1]}${lh[2]} → 単位なしで書く（Figma pxはpx÷font-size。units.md）`);
    }

    // E2: letter-spacing の px / rem
    const ls = t.match(/letter-spacing:\s*(-?[\d.]+)(px|rem)\b/);
    if (ls) {
      errors++;
      console.log(`E2 ${file}:${n}  letter-spacing: ${ls[1]}${ls[2]} → emで書く（units.md）`);
    }

    // E3: px直書き（border系・@media・理由コメント付きは許容）
    if (!t.startsWith('@media') && !hasReason) {
      const decl = t.match(/(^|[;{]\s*)([a-z-]+)\s*:\s*([^;{}]*\b\d+(?:\.\d+)?px)/);
      if (decl && !decl[2].startsWith('border') && decl[2] !== 'outline') {
        errors++;
        console.log(`E3 ${file}:${n}  ${decl[2]} に px 直書き → remで書く。例外なら理由コメントを同じ行に付ける（units.md）`);
      }
    }

    // E10（旧W1）: margin-bottom / margin-right。
    //
    // 旧実装は警告で、しかも行内コメントがあれば検査自体を飛ばしていた（内容は問わない）。
    // 実測（2026-09-01、rpa-technologies-theme）: 20件中17件がコメントで免除され、
    // 警告は exit に影響しないため、規則は事実上機能していなかった。
    // 例外は台帳（coding manifest の scope.styleRuleApplication.exceptions）で宣言する。
    const mb = t.match(/margin-(bottom|right)\s*:/);
    if (mb) {
      const property = `margin-${mb[1]}`;
      const selector = innermostSelector();
      if (!hasDeclaredException(file, selector, property)) {
        errors++;
        console.log(
          `E10 ${file}:${n}  ${property} → 余白は上・左で作る（scss.md）。`
          + ` 例外にするなら台帳へ宣言する: { "file": "${file.replace(/\\/g, '/')}", "selector": "${selector}",`
          + ` "property": "${property}", "reason": "<20文字以上の理由>" }`
        );
      }
    }
  });
}

console.log(`\n===== lint結果: エラー ${errors} / 警告 ${warns} =====`);
if (errors > 0) {
  console.log('エラーがある間はビルド・完了報告に進まない（figma-spec-pipeline.md）');
  process.exit(1);
}
