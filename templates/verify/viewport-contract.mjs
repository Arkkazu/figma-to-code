// Shared viewport identity. A design width is not a PC/SP breakpoint class.
const fail = (message) => { throw new Error(`SPEC FAIL: ${message}`); };
const text = (value, label) => {
  if (typeof value !== "string" || !value.trim()) fail(`${label} must be a non-empty string.`);
  return value;
};
export function viewportName(viewport) {
  return viewport.id ?? (viewport.width <= 767 ? "sp" : "pc");
}

// Legacy two-design manifests retain their contract. New manifests explicitly
// inventory every supplied design and the reference-page SP when SP is absent.
export function resolveViewportContract(manifest, spec) {
  const designs = manifest.figma?.designs;
  if (designs === undefined) {
    if ((manifest.figma?.viewportNodes ?? []).some((node) => !["pc", "sp"].includes(node.viewport))) {
      fail("Additional viewport nodes require manifest.figma.designs; they cannot be silently ignored.");
    }
    if (spec?.viewports?.some((viewport) => viewport.id !== undefined && viewport.id !== (viewport.width <= 767 ? "sp" : "pc"))) {
      fail("Explicit spec viewport identities require manifest.figma.designs; legacy identities must match PC/SP width classes.");
    }
    return { explicit: false, names: ["pc", "sp"], designs: [], widths: {} };
  }
  if (!Array.isArray(designs) || designs.length < 2) fail("figma.designs must include PC and SP (provided or reference-page).");
  const names = []; const widths = {}; const usedWidths = new Set();
  for (const [index, design] of designs.entries()) {
    if (!design || typeof design !== "object" || Array.isArray(design)) fail(`figma.designs[${index}] must be an object.`);
    const id = text(design.viewport, `figma.designs[${index}].viewport`);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ["constructor", "prototype", "__proto__"].includes(id)) fail(`Invalid viewport identity: ${id}`);
    if (names.includes(id)) fail(`Duplicate design viewport: ${id}`);
    if (!Number.isInteger(design.width) || design.width <= 0 || usedWidths.has(design.width)) fail(`Invalid or duplicate design width: ${id}`);
    text(design.nodeId, `design ${id}.nodeId`);
    if (!["provided", "reference-page"].includes(design.source)) fail(`design ${id}.source must be provided or reference-page.`);
    if (design.source === "reference-page") {
      if (id !== "sp") fail("Only an absent SP design may use reference-page.");
      text(design.referencePage, "SP referencePage (another page in the same project)");
      if (design.referencePage === manifest.id) fail("SP referencePage must identify another page.");
      text(design.referenceReason, "SP referenceReason");
    }
    names.push(id); widths[id] = design.width; usedWidths.add(design.width);
  }
  if (!names.includes("pc") || !names.includes("sp")) fail("figma.designs must include pc and sp verification targets.");
  const supplied = designs.filter((entry) => entry.source === "provided");
  if (designs.some((entry) => entry.source === "reference-page") && (supplied.length !== 1 || supplied[0].viewport !== "pc")) {
    fail("reference-page is only valid when the provided design is PC only.");
  }
  const nodes = manifest.figma.viewportNodes;
  if (!Array.isArray(nodes) || nodes.length !== designs.length) fail("viewportNodes must match every design exactly once.");
  for (const design of designs) {
    const matched = nodes.filter((node) => node.viewport === design.viewport);
    if (matched.length !== 1 || matched[0].nodeId !== design.nodeId) fail(`viewportNodes does not match design ${design.viewport}.`);
  }
  if (spec !== undefined) {
    if (!Array.isArray(spec.viewports) || spec.viewports.length !== designs.length) fail("spec must cover every design viewport exactly once.");
    for (const design of designs) {
      const matched = spec.viewports.filter((viewport) => viewport.id === design.viewport);
      if (matched.length !== 1 || matched[0].width !== design.width) fail(`spec viewport id/width mismatch: ${design.viewport}`);
      if (matched[0].repeatViewport !== undefined && matched[0].repeatViewport !== design.viewport) fail(`repeatViewport differs from design: ${design.viewport}`);
    }
  }
  return { explicit: true, names, widths, designs };
}

export function assertViewportKeys(value, names, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  const keys = Object.keys(value);
  if (keys.length !== names.length || keys.some((key) => !names.includes(key))) fail(`${label} must contain exactly: ${names.join(", ")}`);
}
