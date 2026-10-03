// css-scope-digest.mjs — owner visual exemption（figma-gate.mjs）を「対象部品の静止時の見た目を決める CSS」
// だけに結ぶためのハッシュ。背景と規定は figma-gate.mjs の validateOwnerVisualExemption の注記を参照。
import { createHash } from "node:crypto";

const CSS_STATE_PSEUDO = /:(?:hover|active|focus|focus-visible|focus-within)\b/;
const CSS_MOTION_PROPERTY = /^(?:transition(?:-[a-z-]+)?|animation(?:-[a-z-]+)?|will-change)$/i;
export function scopedCssDigest(cssText, classes) {
  const tokens = classes.map((name) => new RegExp(`\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:(?:__|--)[A-Za-z0-9_-]+)*(?![A-Za-z0-9_-])`));
  const text = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const context = [];
  const entries = [];
  let buffer = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "{") {
      const prelude = buffer.trim();
      buffer = "";
      if (prelude.startsWith("@")) { context.push(prelude.replace(/\s+/g, " ")); continue; }
      const end = text.indexOf("}", i);
      const body = text.slice(i + 1, end < 0 ? text.length : end);
      i = end < 0 ? text.length : end;
      if (context.some((at) => /^@(?:-[a-z]+-)?keyframes\b/i.test(at))) continue;
      const selectors = prelude.split(",").map((part) => part.trim().replace(/\s+/g, " "));
      const relevant = selectors.filter((sel) => tokens.some((re) => re.test(sel)) && !CSS_STATE_PSEUDO.test(sel));
      if (relevant.length === 0) continue;
      const declarations = body.split(";").map((d) => d.trim()).filter(Boolean)
        .filter((d) => !CSS_MOTION_PROPERTY.test(d.split(":")[0].trim()))
        .map((d) => d.replace(/\s+/g, " "));
      if (declarations.length === 0) continue;
      entries.push(`${context.join(" > ")} | ${relevant.join(", ")} { ${declarations.join("; ")} }`);
    } else if (char === ";") {
      buffer = ""; // @charset / @import などの文。次の見出しに混ぜない。
    } else if (char === "}") {
      context.pop();
      buffer = "";
    } else {
      buffer += char;
    }
  }
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}
