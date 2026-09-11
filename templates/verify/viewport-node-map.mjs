import { parseFrozenMetadata } from "./figma-page-coverage.mjs";
import { assertViewportKeys, viewportName } from "./viewport-contract.mjs";

const fail = (message) => { throw new Error(`SPEC FAIL: ${message}`); };
export function validateViewportNodeMap(nodeMap, evidence, plan, fileKey, evidencePath, evidenceHash, readMetadata, spec) {
  if (nodeMap.version !== 3 || nodeMap.schema !== "viewport-scoped-roots/v1") fail("Explicit designs require node map version 3 schema viewport-scoped-roots/v1.");
  if (nodeMap.figma?.fileKey !== fileKey || evidence.fileKey !== fileKey) fail("Viewport node-map fileKey mismatch.");
  if (typeof nodeMap.figma.source !== "string" || !nodeMap.figma.source.trim()) fail("node map.figma.source is required.");
  if (nodeMap.sourceEvidence?.nodeEvidencePath !== evidencePath || nodeMap.sourceEvidence?.nodeEvidenceSha256 !== evidenceHash) fail("Viewport node-map source evidence path/hash mismatch.");
  if (evidence.schema !== "figma-node-evidence/v2" || !Array.isArray(evidence.evidence)) fail("Explicit designs require figma-node-evidence/v2.");
  assertViewportKeys(nodeMap.figma.viewportRoots, plan.names, "node map.figma.viewportRoots");
  const sources = evidence.evidence.map((entry) => {
    if (!plan.names.includes(entry.viewport) || typeof entry.role !== "string" || !entry.role) fail("Unknown viewport or missing role in node evidence.");
    const saved = readMetadata(entry.metadataPath);
    if (saved.hash !== entry.metadataSha256) fail("Viewport metadata hash mismatch.");
    const tree = parseFrozenMetadata(saved.document.raw, "Viewport metadata");
    if (tree.rootId !== entry.nodeId) fail("Viewport metadata root differs from evidence nodeId.");
    return { ...entry, tree };
  });
  const uniqueSource = (viewport, role, nodeId) => {
    const matches = sources.filter((entry) => entry.viewport === viewport && entry.role === role && entry.nodeId === nodeId);
    if (matches.length !== 1) fail(`Expected one node evidence entry: ${viewport}/${role}/${nodeId}`);
    return matches[0];
  };
  const pages = new Map();
  for (const design of plan.designs) {
    if (nodeMap.figma.viewportRoots[design.viewport] !== design.nodeId) fail(`Node-map root differs from design: ${design.viewport}`);
    pages.set(design.viewport, uniqueSource(design.viewport, "page-root", design.nodeId));
  }
  if (!Array.isArray(nodeMap.scopeRoots) || !nodeMap.scopeRoots.length) fail("node map.scopeRoots is required.");
  const scopeRootByViewportAndScope = new Map(); const scopeRootByViewportAndNode = new Map();
  const sourceNodes = new Map();
  for (const root of nodeMap.scopeRoots) {
    if (!plan.names.includes(root.viewport) || typeof root.scopeId !== "string" || !root.scopeId || root.scopeId === "page-root") fail("Unknown scoped-root viewport/scopeId.");
    const page = pages.get(root.viewport);
    if (root.pageRootNodeId !== page.nodeId || !page.tree.nodes.has(root.figmaNodeId)) fail("Scoped root does not belong to its design page.");
    const source = uniqueSource(root.viewport, root.scopeId, root.figmaNodeId);
    if (source.metadataPath !== root.metadataPath || source.metadataSha256 !== root.metadataSha256) fail("Scoped root metadata differs from source evidence.");
    const scopeKey = `${root.viewport}::${root.scopeId}`; const nodeKey = `${root.viewport}::${root.figmaNodeId}`;
    if (scopeRootByViewportAndScope.has(scopeKey) || scopeRootByViewportAndNode.has(nodeKey)) fail("Duplicate viewport scoped root.");
    scopeRootByViewportAndScope.set(scopeKey, root); scopeRootByViewportAndNode.set(nodeKey, root);
    for (const node of source.tree.nodes.values()) {
      const identity = `${root.viewport}::${node.id}`;
      if (sourceNodes.has(identity)) fail("Overlapping scoped-root metadata.");
      const pageNode = page.tree.nodes.get(node.id);
      if (!pageNode) fail("Scoped metadata node is absent from page metadata.");
      let current = pageNode; let inside = false; let hidden = false;
      while (current) { if (current.id === root.figmaNodeId) inside = true; hidden ||= current.hidden; current = page.tree.nodes.get(current.parent); }
      if (!inside) fail("Scoped metadata node is outside its declared root.");
      sourceNodes.set(identity, { ...node, scopeRootNodeId: root.figmaNodeId, hidden });
    }
    // A truncated scoped export must not make omitted descendants disappear.
    for (const node of page.tree.nodes.values()) {
      let current = node;
      while (current && current.id !== root.figmaNodeId) current = page.tree.nodes.get(current.parent);
      if (current && !source.tree.nodes.has(node.id)) fail("Scoped metadata omits a page-metadata descendant.");
    }
  }
  for (const viewport of plan.names) if (![...scopeRootByViewportAndScope.values()].some((root) => root.viewport === viewport)) fail(`Missing scoped roots: ${viewport}`);
  const inventory = nodeMap.inventory?.nodes;
  if (!Array.isArray(inventory) || inventory.length !== sourceNodes.size) fail("Node inventory does not cover all frozen metadata nodes.");
  const seen = new Set();
  for (const entry of inventory) {
    const key = `${entry.viewport}::${entry.figmaNodeId}`; const source = sourceNodes.get(key);
    if (!source || seen.has(key) || source.scopeRootNodeId !== entry.scopeRootNodeId) fail("Node inventory differs from frozen metadata.");
    seen.add(key);
  }
  for (const entry of nodeMap.nodes ?? []) {
    if (entry.status !== "mapped") continue;
    const source = sourceNodes.get(`${entry.viewport}::${entry.figmaNodeId}`);
    if (!source || source.hidden) fail("Mapped node is absent or inherits hidden in frozen metadata.");
    const viewport = spec.viewports.find((item) => viewportName(item) === entry.viewport);
    const elements = viewport?.elements ?? [];
    if (!elements.some((element) => element.sel === entry.selector)) fail(`Mapped node is not measured in its own viewport: ${entry.viewport}/${entry.selector}`);
    if (entry.figmaNodeType === "TEXT" && !elements.some((element) => element.sel === entry.selector && (typeof element.text === "string" || typeof element.textPattern === "string"))) fail("Text node has no text assertion in its own viewport.");
  }
  return { scopeRootByViewportAndScope, scopeRootByViewportAndNode };
}
