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

export function assertResponsiveHtmlSingleDom(sourceFiles, exceptions = []) {
  const allowed = new Set(exceptions.map((entry) => `${entry.sourceFile}::${entry.baseClass}`));
  const violations = [];

  for (const sourceFile of sourceFiles) {
    if (!existsSync(sourceFile.absolutePath)) {
      throw new Error(`Responsive HTML source does not exist: ${sourceFile.relativePath}`);
    }

    const source = readFileSync(sourceFile.absolutePath, "utf8");
    for (const variant of extractVariants(source, sourceFile.relativePath)) {
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
      if (duplicatedText.length > 0 && !allowed.has(`${variant.relativePath}::${variant.baseClass}`)) {
        violations.push(`${variant.relativePath}: .${variant.baseClass}-pc / .${variant.baseClass}-sp (${duplicatedText.join(" | ")})`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`PC/SP duplicate HTML content is prohibited. Use one DOM source and CSS media queries instead. ${violations.join("; ")}`);
  }
}