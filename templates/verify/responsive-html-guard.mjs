import { existsSync, readFileSync } from "node:fs";

function normalizeText(value) {
  return value
    .replace(/<\?php[\s\S]*?\?>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, "")
    .trim();
}

function classTokens(attributes) {
  const match = attributes.match(/\bclass\s*=\s*(["'])(.*?)\1/i);
  return match ? match[2].trim().split(/\s+/).filter(Boolean) : [];
}

function responsiveClass(token) {
  const match = token.match(/^(.*)-(pc|sp)$/i);
  return match && match[1] ? { baseClass: match[1], viewport: match[2].toLowerCase() } : null;
}

function extractVariants(source, relativePath) {
  const variants = new Map();
  const openTag = /<([a-z][\w:-]*)\b([^<>]*)>/gi;
  let match;

  while ((match = openTag.exec(source)) !== null) {
    const tagName = match[1];
    const responsiveTokens = classTokens(match[2]).map(responsiveClass).filter(Boolean);
    if (responsiveTokens.length === 0) continue;

    const closeStart = source.indexOf(`</${tagName}`, openTag.lastIndex);
    if (closeStart < 0) continue;
    const text = normalizeText(source.slice(openTag.lastIndex, closeStart));
    if (!text) continue;

    for (const token of responsiveTokens) {
      const key = `${relativePath}::${token.baseClass}`;
      const value = variants.get(key) || { relativePath, baseClass: token.baseClass, pc: [], sp: [] };
      value[token.viewport].push(text);
      variants.set(key, value);
    }
  }

  return [...variants.values()];
}

// 重複している variant を返す。assert と、例外の裏取りの両方が同じ判定を使う。
// 判定を2箇所に分けると、例外だけ別基準になって黙って通る。
export function duplicatedVariants(source, relativePath) {
  const found = [];
  for (const variant of extractVariants(source, relativePath)) {
    if (variant.pc.length === 0 || variant.sp.length === 0) continue;
    const pcText = new Set(variant.pc);
    const spText = new Set(variant.sp);
    const duplicatedText = [];
    for (const pc of pcText) {
      for (const sp of spText) {
        const isSame = pc === sp;
        const isContained = pc.length >= 12 && sp.length >= 12 && (pc.includes(sp) || sp.includes(pc));
        if (isSame || isContained) duplicatedText.push(`${pc} <> ${sp}`);
      }
    }
    if (duplicatedText.length > 0) {
      found.push({ relativePath, baseClass: variant.baseClass, key: `${relativePath}::${variant.baseClass}`, duplicatedText });
    }
  }
  return found;
}

// 例外の裏取り。
//
// 2026-09-03 まで、例外は `sourceFile` / `baseClass` / `reason` の3つを持ち、
// **`reason` はこのガードで一度も読まれなかった**。非空文字列が1つあれば、その class の
// 単一DOM検査が恒久的に外れた。「文字列があるか」で判定し、実際の危険（その重複が
// 本当に不可避か）を見ていない。
//
// 実データの例外3件は、いずれも「既存の…であり、今回の変更対象外」と書いていた。
// これは検査できる主張である。**このscopeより前から在った重複かどうか**を突き合わせる。
// 前から在れば例外として通し、このscopeで新しく作られた重複なら通さない。
// 例外は「既存の重複を持ち越す」ためのものであって、「新しい重複を許す」ためではない。
//
// priorSource は「このscopeが触る前の中身」。取れない場合（新規ファイル、履歴を
// 読めない環境）は corroboration を要求できないので、その事実を notes に残して通す。
// 通すのは、ここで止めると履歴を読めない環境で作業自体が止まるためで、
// 黙って通すのではなく「裏を取れていない例外がN件ある」と必ず出す。
export function corroborateExceptions(exceptions, readPriorSource) {
  const violations = [];
  const notes = [];
  for (const entry of exceptions) {
    const key = `${entry.sourceFile}::${entry.baseClass}`;
    const prior = readPriorSource(entry.sourceFile);
    if (prior === null || prior === undefined) {
      notes.push(`例外 ${key} は、変更前の中身を取得できないため裏を取れていない（reason: ${entry.reason}）。`);
      continue;
    }
    const priorKeys = new Set(duplicatedVariants(prior, entry.sourceFile).map((v) => v.key));
    if (!priorKeys.has(key)) {
      violations.push(
        `${key} の PC/SP 重複は、このscopeより前には存在しない。` +
          " 例外は既存の重複を持ち越すためのものであり、新しく作った重複を通すためではない。" +
          " 単一DOM＋メディアクエリへ直すこと。" +
          `（宣言された理由: ${entry.reason}）`,
      );
    }
  }
  return { violations, notes };
}

export function assertResponsiveHtmlSingleDom(sourceFiles, exceptions = []) {
  const allowed = new Set(exceptions.map((entry) => `${entry.sourceFile}::${entry.baseClass}`));
  const violations = [];

  for (const sourceFile of sourceFiles) {
    if (!existsSync(sourceFile.absolutePath)) {
      throw new Error(`Responsive HTML source does not exist: ${sourceFile.relativePath}`);
    }

    const source = readFileSync(sourceFile.absolutePath, "utf8");
    for (const variant of duplicatedVariants(source, sourceFile.relativePath)) {
      if (!allowed.has(variant.key)) {
        violations.push(`${variant.relativePath}: .${variant.baseClass}-pc / .${variant.baseClass}-sp (${variant.duplicatedText.join(" | ")})`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`PC/SP duplicate HTML content is prohibited. Use one DOM source and CSS media queries instead. ${violations.join("; ")}`);
  }
}