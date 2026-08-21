
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// 検証契約のバージョン。必須入力・検査を足したら上げる。close-report へ刻み、
// 「どの契約の下で合格したのか」を後から機械的に判定できるようにする。
// contractVersion を持たない close-report は、この番号を導入する前の契約で走ったものと判定する（0扱い）。
// 1: node map / provenance / viewportPolicy / 編集前ゲート / page-inventory / deferred / plannedScopes
//    / visualThresholds + visualThresholdBasis / completed ロール（2026-08-03時点）
// 2: node-inventory（rootNode配下の全ノードを node map で分類することを必須化）
//    / TEXTノードの文言検証 / spec要素の期待値必須 / HTML変更時のW3C証跡（2026-08-04時点）
// 3: Q-13 accessibility / Q-08 motion configs + axe sourceをpreflight凍結し、Q-09 PC/SP batchと同一CDP sessionで実行する。
// 4: P-3 v11. implementation identity is condition-specific preflight input,
//    persisted in gate/page-coverage runtime state, and never carried by the
//    shared gate manifest.
// 5: P-3 v12. Explicit responsiveHtml.deferredSourceFiles is frozen in the
//    active gate state; preflight may defer only those planned new sources and
//    every later phase requires the full responsive source set.
export const FIGMA_GATE_CONTRACT_VERSION = 5;

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(label + " must be a non-empty string");
  }
  return value;
}

function requireImplementationIdentity(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(label + " must be an object with actor and contextId");
  }
  const unexpected = Object.keys(value).filter((key) => key !== "actor" && key !== "contextId");
  if (unexpected.length > 0) {
    fail(label + " has unknown field(s): " + unexpected.join(", "));
  }
  return {
    actor: requireString(value.actor, label + ".actor"),
    contextId: requireString(value.contextId, label + ".contextId"),
  };
}

function rejectManifestImplementationIdentity(scope) {
  for (const field of ["implementationActor", "implementationContextId", "implementationIdentity", "implementation"]) {
    if (Object.hasOwn(scope, field)) {
      fail("scope." + field + " is not allowed in v12; implementation identity must come from gate preflight state");
    }
  }
}

// PC/SP対の検査。片方にしか存在しないUI（PC専用の追従ボタン等）を
// 「存在しない側」を明示して登録できるようにする。null は理由の宣言を必須にする。
function requireViewportNodes(nodes, label, owner) {
  if (!nodes || typeof nodes !== "object") {
    fail(label + " must declare figmaNodeIds.pc and figmaNodeIds.sp (null is allowed for one side)");
  }
  for (const viewport of ["pc", "sp"]) {
    if (!(viewport in nodes)) fail(label + " must declare figmaNodeIds." + viewport);
    const value = nodes[viewport];
    if (value === null) continue;
    requireString(value, label + " figmaNodeIds." + viewport);
  }
  if (nodes.pc === null && nodes.sp === null) {
    // 両方nullは「Figma対応が無い」か「まだ特定していない」のどちらか。
    // どちらなのかを書かせる。書かせないと、埋められない欄を空にして先へ進むのが常態化し、
    // 逆に埋めさせようとすると存在しないIDの捏造を招く。
    const reason = owner.figmaNodeUnknownReason;
    if (typeof reason !== "string" || reason.trim().length < 20) {
      fail(
        label +
          " has no Figma node on either viewport. Declare figmaNodeUnknownReason (>=20 chars) stating whether the section has no Figma counterpart at all, or the counterpart exists but has not been identified yet."
      );
    }
    return;
  }
  if (nodes.pc === null || nodes.sp === null) {
    requireString(owner.singleViewportReason, label + " singleViewportReason (required when one viewport has no node)");
  }
}

function manifestContext(manifestPath, implementationIdentityInput) {
  const absoluteManifestPath = resolve(manifestPath);
  const manifest = readJson(absoluteManifestPath);
  const scope = manifest.scope || {};
  rejectManifestImplementationIdentity(scope);
  const implementationIdentity = requireImplementationIdentity(implementationIdentityInput, "implementation identity");
  requireString(scope.componentsPath, "scope.componentsPath");
  requireString(scope.pageCoveragePath, "scope.pageCoveragePath");
  requireString(scope.pageCoverageReviewPath, "scope.pageCoverageReviewPath");
  const manifestId = requireString(manifest.id, "manifest id");

  // scope paths are repository-relative everywhere else in the gate manifest.
  // Resolving from the manifest directory would turn `MyBrain/verify/...` into
  // `MyBrain/verify/MyBrain/verify/...` after the template is copied.
  const repoRoot = process.cwd();
  const componentsPath = resolve(repoRoot, scope.componentsPath);
  const coveragePath = resolve(repoRoot, scope.pageCoveragePath);
  const reviewPath = resolve(repoRoot, scope.pageCoverageReviewPath);
  if (!existsSync(componentsPath)) fail("component manifest is missing: " + componentsPath);
  if (!existsSync(coveragePath)) fail("page coverage is missing: " + coveragePath);
  if (!existsSync(reviewPath)) fail("page coverage review is missing: " + reviewPath);

  const rawComponents = readJson(componentsPath);
  const components = Array.isArray(rawComponents) ? rawComponents : rawComponents.components;
  if (!Array.isArray(components) || components.length === 0) {
    fail("component manifest must contain components");
  }
  const componentById = new Map();
  for (const component of components) {
    requireString(component.elementId, "component.elementId");
    requireString(component.sectionId, "component.sectionId for " + component.elementId);
    if (componentById.has(component.elementId)) {
      fail("duplicate component elementId: " + component.elementId);
    }
    componentById.set(component.elementId, component);
  }

  const coverage = readJson(coveragePath);
  const review = readJson(reviewPath);
  if (coverage.version !== 1 || !Array.isArray(coverage.sections) || coverage.sections.length === 0) {
    fail("page coverage must use version 1 with non-empty sections");
  }
  // 検証対象が「Figmaにページ設計があるページ」とは限らない。
  // 社内向けの部品カタログのように、対応するFigmaページroot自体が存在しないページがある。
  // そこへ page-design 前提を強いると、存在しない nodeId を書かせることになる（捏造の強制）。
  // kind を宣言させて、どちらの前提で検証しているかを証跡に残す。
  const pageKind = coverage.pageKind === undefined ? "page-design" : requireString(coverage.pageKind, "page coverage pageKind");
  if (!["page-design", "component-reference"].includes(pageKind)) {
    fail('page coverage pageKind must be "page-design" or "component-reference"');
  }
  if (pageKind === "component-reference") {
    const reason = requireString(coverage.pageKindReason, "page coverage pageKindReason");
    if (reason.trim().length < 20) {
      fail("page coverage pageKindReason must explain (>=20 chars) why this page has no Figma page design.");
    }
    if (coverage.pages !== undefined) {
      fail('page coverage pageKind "component-reference" must not declare pages (there is no Figma page root to point at).');
    }
  } else {
    if (!coverage.pages) fail("page coverage must declare pages");
    for (const viewport of ["pc", "sp"]) {
      const page = coverage.pages[viewport];
      if (!page || typeof page !== "object") fail("page coverage lacks " + viewport);
      for (const field of ["url", "nodeId", "metadataPath", "metadataSha256"]) {
        requireString(page[field], "page coverage " + viewport + "." + field);
      }
      const metadataPath = resolve(dirname(coveragePath), page.metadataPath);
      if (!existsSync(metadataPath)) fail("Figma page metadata is missing: " + metadataPath);
      if (sha256File(metadataPath) !== page.metadataSha256) {
        fail("Figma page metadata hash mismatch: " + metadataPath);
      }
    }
  }

  const coverageSha256 = sha256File(coveragePath);
  if (
    review.version !== 2 ||
    review.status !== "approved" ||
    review.reviewerRole !== "independent-reviewer" ||
    typeof review.reviewerActor !== "string" ||
    review.reviewerActor.trim() === "" ||
    typeof review.reviewerContextId !== "string" ||
    review.reviewerContextId.trim() === "" ||
    typeof review.reviewedAt !== "string" ||
    review.reviewedAt.trim() === "" ||
    review.pageCoverageSha256 !== coverageSha256
  ) {
    fail("page coverage needs an approved independent review for the current coverage hash");
  }
  if (review.reviewerActor === implementationIdentity.actor && review.reviewerContextId === implementationIdentity.contextId) {
    fail("page coverage review must be performed by a different actor or a different context from implementation");
  }

  const targetIds = new Set();
  const sectionById = new Map();
  for (const section of coverage.sections) {
    if (!section || typeof section !== "object") fail("page coverage section must be an object");
    requireString(section.sectionId, "page coverage sectionId");
    if (sectionById.has(section.sectionId)) fail("duplicate sectionId: " + section.sectionId);
    if (!["target", "context", "deferred", "completed"].includes(section.role)) {
      fail("section role must be target, context, deferred, or completed: " + section.sectionId);
    }
    if (!Array.isArray(section.componentIds)) {
      fail("section componentIds must be an array: " + section.sectionId);
    }
    // deferred: 本scopeでは着手しないが、対象外を暗黙にしないための明示宣言。
    // checkpoint対象にしない代わりに、PC/SPノード・理由・後続scopeを必須にする。
    if (section.role === "deferred") {
      if (section.componentIds.length !== 0) {
        fail("deferred cannot have checkpoint components: " + section.sectionId);
      }
      requireViewportNodes(section.figmaNodeIds, "deferred " + section.sectionId, section);
      requireString(section.reason, "deferred reason for " + section.sectionId);
      requireString(section.followUpScope, "deferred followUpScope for " + section.sectionId);
      sectionById.set(section.sectionId, section);
      continue;
    }
    // completed: 先行scopeで検証済み。deferredと違い「後続で着手する」宣言ではないため
    // followUpScope を持たない。ただし「完了した」と書くだけで通ると自己申告になるので、
    // 先行scopeの close-report が実在することまで確認する。
    if (section.role === "completed") {
      if (section.componentIds.length !== 0) {
        fail("completed cannot have checkpoint components in this scope: " + section.sectionId);
      }
      requireViewportNodes(section.figmaNodeIds, "completed " + section.sectionId, section);
      requireString(section.completedByScope, "completed completedByScope for " + section.sectionId);
      const closeReport = requireString(section.closeReportPath, "completed closeReportPath for " + section.sectionId);
      const closeReportFile = resolve(repoRoot, closeReport);
      if (!existsSync(closeReportFile)) {
        fail("completed closeReportPath does not exist (a section cannot be declared completed without the earlier close evidence): " + closeReport);
      }
      let report;
      try {
        report = JSON.parse(readFileSync(closeReportFile, "utf8"));
      } catch (error) {
        fail("completed closeReportPath is not valid JSON: " + closeReport);
      }
      const verifiedIds = (report && report.coverage && Array.isArray(report.coverage.targetSectionIds)) ? report.coverage.targetSectionIds : [];
      if (!verifiedIds.includes(section.sectionId)) {
        fail("completed section is not listed as a verified target in the referenced close report: " + section.sectionId);
      }
      const result = report && report.result;
      if (!result || result.specFail !== 0 || result.layoutFail !== 0 || result.visualFail !== 0) {
        fail("completed section references a close report that is not a clean PASS: " + closeReport);
      }
      // 旧契約でcloseした証跡を「検証済み」として持ち込ませない。
      // 当時の基準では合格でも、現在の必須検査を通っていない。
      const reportContract = Number.isInteger(report.contractVersion) ? report.contractVersion : 0;
      if (reportContract < FIGMA_GATE_CONTRACT_VERSION) {
        fail(
          "completed section references a close report produced under an older verification contract (contractVersion " +
            reportContract + " < " + FIGMA_GATE_CONTRACT_VERSION + "): " + closeReport +
            ". Re-run that scope under the current contract before declaring the section completed."
        );
      }
      sectionById.set(section.sectionId, section);
      continue;
    }
    if (section.role === "context") {
      if (section.contextKind !== "shared-header" && section.contextKind !== "shared-footer") {
        fail("context must be shared-header or shared-footer: " + section.sectionId);
      }
      if (section.componentIds.length !== 0) {
        fail("context cannot have checkpoint components: " + section.sectionId);
      }
    } else {
      if (section.componentIds.length === 0) {
        fail("target must have checkpoint components: " + section.sectionId);
      }
      for (const elementId of section.componentIds) {
        requireString(elementId, "section componentId");
        if (!componentById.has(elementId)) fail("unknown component in page coverage: " + elementId);
        if (targetIds.has(elementId)) fail("component belongs to multiple target sections: " + elementId);
        if (componentById.get(elementId).sectionId !== section.sectionId) {
          fail("component sectionId mismatch: " + elementId);
        }
        targetIds.add(elementId);
      }
    }
    sectionById.set(section.sectionId, section);
  }
  for (const elementId of componentById.keys()) {
    if (!targetIds.has(elementId)) {
      fail("component is not assigned to one target section: " + elementId);
    }
  }

  // page-inventory: ページroot配下の全セクションをPC/SP対で固定した不変証跡。
  // scope-coverage（sections）がその全件を target / context / deferred のいずれかへ
  // 一意に分類していることを検査する。これが無いと、対象外セクションの「書き漏らし」を
  // 検出できず、宣言したものだけが正しいという偏った証跡になる。
  const inventory = coverage.inventory;
  if (!inventory || typeof inventory !== "object") {
    fail("page coverage must declare inventory with the full section list of the page");
  }
  requireString(inventory.source, "page coverage inventory.source");
  const inventorySections = inventory.sections;
  if (!Array.isArray(inventorySections) || inventorySections.length === 0) {
    fail("page coverage inventory.sections must be a non-empty array");
  }
  const inventoryIds = new Set();
  for (const entry of inventorySections) {
    if (!entry || typeof entry !== "object") fail("inventory section must be an object");
    const sectionId = requireString(entry.sectionId, "inventory sectionId");
    if (inventoryIds.has(sectionId)) fail("duplicate inventory sectionId: " + sectionId);
    requireViewportNodes(entry.figmaNodeIds, "inventory section " + sectionId, entry);
    inventoryIds.add(sectionId);
  }
  const unclassified = [...inventoryIds].filter((sectionId) => !sectionById.has(sectionId));
  if (unclassified.length > 0) {
    fail("inventory sections are not classified as target/context/deferred: " + unclassified.join(", "));
  }
  const unknownSections = [...sectionById.keys()].filter((sectionId) => !inventoryIds.has(sectionId));
  if (unknownSections.length > 0) {
    fail("sections are not present in the page inventory: " + unknownSections.join(", "));
  }

  // 並び順もページ構造の一部。順序が実際のページと違うと、レビュアーは
  // 「どこが抜けているか」を目視で追えなくなり、証跡としての意味が落ちる。
  // sections は inventory と同じ並びであることを必須にする。
  const inventoryOrder = inventorySections.map((entry) => entry.sectionId);
  const sectionOrder = coverage.sections.map((section) => section.sectionId);
  const firstOrderMismatch = inventoryOrder.findIndex((sectionId, index) => sectionOrder[index] !== sectionId);
  if (firstOrderMismatch !== -1) {
    fail(
      "sections must follow the same order as inventory (the page's actual section order). " +
        `First mismatch at index ${firstOrderMismatch}: inventory=${inventoryOrder[firstOrderMismatch]} sections=${sectionOrder[firstOrderMismatch]}`
    );
  }

  // 先行scopeのcoverageを丸ごと複製すると、deferredのreasonなど「そのscope固有の記述」が
  // 前のscopeのまま残る。人が読めば分かるが検証器は素通りする（実測：25件中25件が
  // 前scopeの記述のまま独立レビューに回った）。coverage自身にどのscopeのものかを宣言させ、
  // manifest の id と一致しなければ落とすことで、複製したまま出すことを不可能にする。
  const declaredScopeId = requireString(coverage.scopeId, "page coverage scopeId (the manifest id this coverage belongs to)");
  // 同じページ・同じtargetを扱う後続scopeが、変更せずに同一coverageを使うのは正当な再利用。
  // ただし黙って共有させると複製と区別がつかないので、共有先を明示宣言させる。
  let sharedWithScopes = [];
  if (coverage.sharedWithScopes !== undefined) {
    if (!Array.isArray(coverage.sharedWithScopes)) fail("page coverage sharedWithScopes must be an array");
    sharedWithScopes = coverage.sharedWithScopes.map((value, index) =>
      requireString(value, `page coverage sharedWithScopes[${index}]`)
    );
    if (sharedWithScopes.includes(declaredScopeId)) {
      fail("page coverage sharedWithScopes must not repeat scopeId: " + declaredScopeId);
    }
  }
  if (declaredScopeId !== manifestId && !sharedWithScopes.includes(manifestId)) {
    fail(
      `page coverage scopeId does not match the manifest id: coverage=${declaredScopeId} manifest=${manifestId}. ` +
        "A coverage copied from an earlier scope keeps that scope's scope-specific text (deferred reasons, notes). " +
        "Review every scope-specific field, then either set this id or declare the reuse in sharedWithScopes."
    );
  }

  // followUpScope の実在検査。文字列があるだけでは追跡可能な証跡にならないため、
  // 計画台帳（plannedScopes）のエントリを指していることを必須にする。
  // manifestPath を持つエントリは、そのファイルが実在することまで確認する。
  const deferredSections = coverage.sections.filter((section) => section.role === "deferred");
  if (deferredSections.length > 0) {
    const plannedScopes = coverage.plannedScopes;
    if (!Array.isArray(plannedScopes) || plannedScopes.length === 0) {
      fail("page coverage must declare plannedScopes when any section is deferred");
    }
    const plannedIds = new Set();
    for (const entry of plannedScopes) {
      if (!entry || typeof entry !== "object") fail("plannedScopes entry must be an object");
      const scopeId = requireString(entry.scopeId, "plannedScopes scopeId");
      if (plannedIds.has(scopeId)) fail("duplicate plannedScopes scopeId: " + scopeId);
      requireString(entry.title, "plannedScopes title for " + scopeId);
      const status = requireString(entry.status, "plannedScopes status for " + scopeId);
      if (!["planned", "in-progress", "done"].includes(status)) {
        fail("plannedScopes status must be planned, in-progress, or done: " + scopeId);
      }
      if (entry.manifestPath !== undefined) {
        const manifestFile = resolve(repoRoot, requireString(entry.manifestPath, "plannedScopes manifestPath for " + scopeId));
        if (!existsSync(manifestFile)) fail("plannedScopes manifestPath does not exist: " + entry.manifestPath);
      }
      plannedIds.add(scopeId);
    }
    const danglingRefs = deferredSections
      .map((section) => section.followUpScope)
      .filter((scopeId) => !plannedIds.has(scopeId));
    if (danglingRefs.length > 0) {
      fail("deferred followUpScope does not exist in plannedScopes: " + [...new Set(danglingRefs)].join(", "));
    }
    const referenced = new Set(deferredSections.map((section) => section.followUpScope));
    const unusedPlans = [...plannedIds].filter((scopeId) => !referenced.has(scopeId));
    if (unusedPlans.length > 0) {
      fail("plannedScopes entries are not referenced by any deferred section: " + unusedPlans.join(", "));
    }
  }

  return {
    absoluteManifestPath,
    manifest,
    componentsPath,
    coveragePath,
    reviewPath,
    coverage,
    review,
    componentById,
    sectionById,
    coverageSha256,
    implementationIdentity,
  };
}

function runtimePath(manifestPath) {
  return resolve(dirname(resolve(manifestPath)), ".figma-gate", "page-coverage-runtime.json");
}

function writeRuntime(path, runtime) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(runtime, null, 2) + "\n", "utf8");
}

function loadRuntime(manifestPath, implementationIdentityInput) {
  const path = runtimePath(manifestPath);
  if (!existsSync(path)) fail("page coverage runtime is missing; run preflight after independent approval");
  const runtime = readJson(path);
  const context = manifestContext(manifestPath, implementationIdentityInput);
  if (runtime.version !== 3) {
    fail("page coverage runtime must use version 3 with implementationIdentity; re-run preflight");
  }
  const runtimeIdentity = requireImplementationIdentity(runtime.implementationIdentity, "page coverage runtime implementationIdentity");
  if (
    runtimeIdentity.actor !== context.implementationIdentity.actor ||
    runtimeIdentity.contextId !== context.implementationIdentity.contextId
  ) {
    fail("page coverage runtime implementationIdentity differs from active gate state");
  }
  if (
    runtime.manifestSha256 !== sha256File(context.absoluteManifestPath) ||
    runtime.componentsSha256 !== sha256File(context.componentsPath) ||
    runtime.coverageSha256 !== context.coverageSha256 ||
    runtime.reviewSha256 !== sha256File(context.reviewPath)
  ) {
    fail("page coverage frozen inputs changed; run preflight again");
  }
  return { path, runtime, context };
}

export function initializePageCoverage(manifestPath, implementationIdentityInput) {
  const context = manifestContext(manifestPath, implementationIdentityInput);
  const runtime = {
    version: 3,
    manifestSha256: sha256File(context.absoluteManifestPath),
    componentsSha256: sha256File(context.componentsPath),
    coverageSha256: context.coverageSha256,
    reviewSha256: sha256File(context.reviewPath),
    implementationIdentity: { ...context.implementationIdentity },
    sections: context.coverage.sections.map((section) => ({
      sectionId: section.sectionId,
      role: section.role,
      contextKind: section.contextKind || null,
      componentIds: section.componentIds,
      state: section.role === "target" ? "next" : section.role,
    })),
  };
  writeRuntime(runtimePath(manifestPath), runtime);
}

export function sectionStart(manifestPath, implementationIdentity, sectionId) {
  const loaded = loadRuntime(manifestPath, implementationIdentity);
  const current = loaded.runtime.sections.find((section) => section.role === "target" && section.state === "current");
  if (current) fail("a target section is already current: " + current.sectionId);
  const next = loaded.runtime.sections.find((section) => section.role === "target" && section.state === "next");
  if (!next) fail("no next target section remains");
  if (next.sectionId !== sectionId) {
    fail("section-start must follow page coverage order; next is " + next.sectionId);
  }
  next.state = "current";
  writeRuntime(loaded.path, loaded.runtime);
  console.log("SECTION START PASS: " + sectionId);
}

export function assertCheckpointIsCurrent(manifestPath, implementationIdentity, elementId) {
  const loaded = loadRuntime(manifestPath, implementationIdentity);
  const current = loaded.runtime.sections.find((section) => section.role === "target" && section.state === "current");
  if (!current) fail("checkpoint requires section-start");
  if (!current.componentIds.includes(elementId)) {
    fail("checkpoint component is outside the current section: " + elementId);
  }
}

export function prepareSectionClose(manifestPath, implementationIdentity, sectionId) {
  const loaded = loadRuntime(manifestPath, implementationIdentity);
  const current = loaded.runtime.sections.find((section) => section.role === "target" && section.state === "current");
  if (!current || current.sectionId !== sectionId) {
    fail("section-close requires the matching current target section: " + sectionId);
  }
  return {
    absoluteManifestPath: loaded.context.absoluteManifestPath,
    checkpointPlan: [...current.componentIds],
    components: [...loaded.context.componentById.values()],
  };
}

export function completeSection(manifestPath, implementationIdentity, sectionId) {
  const loaded = loadRuntime(manifestPath, implementationIdentity);
  const current = loaded.runtime.sections.find((section) => section.role === "target" && section.state === "current");
  if (!current || current.sectionId !== sectionId) {
    fail("section-close state changed before completion: " + sectionId);
  }
  current.state = "verified";
  writeRuntime(loaded.path, loaded.runtime);
  console.log("SECTION CLOSE PASS: " + sectionId);
}

export function assertPageCoverageComplete(manifestPath, implementationIdentity) {
  const loaded = loadRuntime(manifestPath, implementationIdentity);
  const remaining = loaded.runtime.sections.filter((section) => section.role === "target" && section.state !== "verified");
  if (remaining.length > 0) {
    fail("page close requires all target sections verified: " + remaining.map((section) => section.sectionId + "=" + section.state).join(", "));
  }
  // 合格件数を分母なしで報告させないため、close側へカバレッジの内訳を返す。
  const targetSections = loaded.runtime.sections.filter((section) => section.role === "target");
  const contextSections = loaded.runtime.sections.filter((section) => section.role === "context");
  const deferredSections = loaded.runtime.sections.filter((section) => section.role === "deferred");
  const completedSections = loaded.runtime.sections.filter((section) => section.role === "completed");
  return {
    targetSectionCount: targetSections.length,
    verifiedSectionCount: targetSections.filter((section) => section.state === "verified").length,
    targetSectionIds: targetSections.map((section) => section.sectionId),
    outOfScopeSectionIds: contextSections.map((section) => section.sectionId),
    deferredSectionIds: deferredSections.map((section) => section.sectionId),
    // 先行scopeで検証済みの区画。今回のscopeの合格件数には含めない。
    completedSectionIds: completedSections.map((section) => section.sectionId),
    pageSectionCount: loaded.runtime.sections.length,
  };
}
