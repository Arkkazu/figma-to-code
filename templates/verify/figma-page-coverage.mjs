
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

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

// 承認を「ファイルのバイト列」ではなく「レビューが実際に判定した意味内容」に紐づける。
//
// 2026-08-26 実測：1 scope で coverage が7世代作られ、そのたびに承認が失効して
// 人手の再レビューが発生した。失効の中には、分類を1文字も変えていない変更が含まれる
// （coverageExpansion の宣言追加、注記の文言修正など）。バイト一致で判定していると、
// レビューが見てもいない差分で承認が飛ぶ。
//
// digest に含めるのは、独立レビューが判定している内容すべてとする。
// 分類（role・componentIds・figmaNodeIds・measurement・追跡先）だけでなく、
// **説明文も含める**。レビュー役が判定しているのは「deferred の理由が実態と合っているか」
// 「PC/SP非等価の根拠が事実か」であり、説明が書き換われば判定はやり直しになる。
// 説明を除外すると、対象外の理由を後から書き換えても承認が生き残る穴になる
// （2026-08-26 の自己レビューで検出。当初この4項目を除外していた）。
//
// 除外するのは次の2つだけである。
//   1. 整形・キー順（正規化して比較するため自然に無視される）
//   2. coverageExpansion … ゲート自身が「宣言しろ」と要求する項目。
//      これを含めると、宣言した瞬間に承認が失効して永久に満たせない循環になる。
// digest の算出対象を変えたら上げる。版が違う digest 同士は比較できない。
// v1: 説明文（reason / viewportPairingNote / singleViewportReason / inventory.source）を除外していた版。
//     対象外の理由を後から書き換えても承認が生き残る穴があり、v2 で廃止した。
// v2: 説明文を含む。除外するのは整形・キー順と coverageExpansion のみ。
const COVERAGE_DIGEST_VERSION = "v2";

export function canonicalCoverageDigest(coverage) {
  const canonicalSection = (section) => ({
    sectionId: section.sectionId ?? null,
    role: section.role ?? null,
    contextKind: section.contextKind ?? null,
    componentIds: Array.isArray(section.componentIds) ? [...section.componentIds] : null,
    figmaNodeIds: {
      pc: section.figmaNodeIds?.pc ?? null,
      sp: section.figmaNodeIds?.sp ?? null,
    },
    measurementFigmaNodeIds: {
      pc: Array.isArray(section.measurementFigmaNodeIds?.pc) ? [...section.measurementFigmaNodeIds.pc] : null,
      sp: Array.isArray(section.measurementFigmaNodeIds?.sp) ? [...section.measurementFigmaNodeIds.sp] : null,
    },
    followUpScope: section.followUpScope ?? null,
    completedByScope: section.completedByScope ?? null,
    // 説明文は digest に含める。レビュー役が判定しているのは
    // 「deferred の理由が実態と合っているか」「非等価の根拠が事実か」であり、
    // 説明が書き換われば、その判定はやり直す必要がある。
    // 除外すると、対象外の理由を書き換えても承認が生き残る穴になる。
    reason: section.reason ?? null,
    viewportPairingNote: section.viewportPairingNote ?? null,
    singleViewportReason: section.singleViewportReason ?? null,
    figmaNodeUnknownReason: section.figmaNodeUnknownReason ?? null,
    closeReportPath: section.closeReportPath ?? null,
  });
  const canonical = {
    version: coverage.version ?? null,
    scopeId: coverage.scopeId ?? null,
    pageKind: coverage.pageKind ?? "page-design",
    pages: coverage.pages
      ? {
        pc: { nodeId: coverage.pages.pc?.nodeId ?? null, metadataSha256: coverage.pages.pc?.metadataSha256 ?? null },
        sp: { nodeId: coverage.pages.sp?.nodeId ?? null, metadataSha256: coverage.pages.sp?.metadataSha256 ?? null },
      }
      : null,
    inventorySource: coverage.inventory?.source ?? null,
    inventory: (coverage.inventory?.sections ?? []).map((entry) => ({
      sectionId: entry.sectionId ?? null,
      figmaNodeIds: { pc: entry.figmaNodeIds?.pc ?? null, sp: entry.figmaNodeIds?.sp ?? null },
      note: entry.note ?? null,
    })),
    sections: (coverage.sections ?? []).map(canonicalSection),
    plannedScopes: (coverage.plannedScopes ?? []).map((entry) => ({
      scopeId: entry.scopeId ?? null,
      status: entry.status ?? null,
    })),
    sharedWithScopes: Array.isArray(coverage.sharedWithScopes) ? [...coverage.sharedWithScopes].sort() : [],
  };
  // digest にアルゴリズム版を刻む。算出対象を変えると同じ coverage でも値が変わるため、
  // 版を持たないと「分類が変わった」と誤検出する（2026-08-26 に v1→v2 で実際に発生）。
  // 版が異なる過去の digest は比較対象にしない。
  return COVERAGE_DIGEST_VERSION + "-" + createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

// 独立レビュー承認が現在のcoverageに対して有効かを、条件ごとに分解して返す。
// 「まとめて1行で落とす」と、実装役には何を直せば通るのかが分からない。
function reviewApprovalBlockers(review, coverageSha256, implementationIdentity, coverageDigest) {
  const blockers = [];
  if (!review || typeof review !== "object") {
    blockers.push("review ファイルがJSONオブジェクトではない。");
    return blockers;
  }
  if (review.version !== 2) blockers.push(`review.version が 2 ではない（現在: ${JSON.stringify(review.version)}）。`);
  if (review.status !== "approved") blockers.push(`review.status が "approved" ではない（現在: ${JSON.stringify(review.status)}）。`);
  if (review.reviewerRole !== "independent-reviewer") {
    blockers.push(`review.reviewerRole が "independent-reviewer" ではない（現在: ${JSON.stringify(review.reviewerRole)}）。`);
  }
  for (const field of ["reviewerActor", "reviewerContextId", "reviewedAt"]) {
    if (typeof review[field] !== "string" || review[field].trim() === "") {
      blockers.push(`review.${field} が空、または文字列ではない。`);
    }
  }
  // digest を宣言している承認は digest で判定する。分類を変えていない編集
  // （注記の修正、coverageExpansion の宣言追加、キー順の変更）では失効しない。
  // digest 未宣言の承認は旧来どおりバイト一致で判定する（移行互換）。
  if (typeof review.pageCoverageDigest === "string" && review.pageCoverageDigest.trim() !== "") {
    if (review.pageCoverageDigest !== coverageDigest) {
      blockers.push(
        "review.pageCoverageDigest が現在の page coverage の分類内容と一致しない。" +
          `\n      承認済み digest: ${review.pageCoverageDigest}` +
          `\n      現在値   digest: ${coverageDigest}` +
          "\n      → role・componentIds・figmaNodeIds・measurement・追跡先のいずれかが変わっている。" +
          "\n        これは分類の変更であり、再承認が必要な正常な状態である。"
      );
    }
  } else if (review.pageCoverageSha256 !== coverageSha256) {
    blockers.push(
      "review.pageCoverageSha256 が現在の page coverage と一致しない。" +
        `\n      承認済み: ${review.pageCoverageSha256 ?? "(未宣言)"}` +
        `\n      現在値  : ${coverageSha256}` +
        "\n      → coverage を変更したため、前回の承認は失効している。これは実装役の落ち度ではなく、再承認が必要な正常な状態である。" +
        "\n      → この承認は pageCoverageDigest を宣言していないためバイト一致で判定している。" +
        "\n        次の承認から pageCoverageDigest を宣言すると、分類を変えない編集では失効しなくなる。"
    );
  }
  if (
    review.reviewerActor === implementationIdentity.actor
    && review.reviewerContextId === implementationIdentity.contextId
  ) {
    blockers.push(
      "review の reviewer が実装役と完全に同一（actor・contextId の両方が一致）。" +
        "\n      → actor か contextId の少なくとも一方が実装役と異なる必要がある。"
    );
  }
  return blockers;
}

// 失敗をそのまま「依頼書」にする。実装役は独立レビュー承認を自分では作れないため、
// ここで止まると手詰まりに見える。誰に何を頼めば前へ進むのかを、出力の時点で確定させる。
function reviewRequestMessage({ blockers, manifestId, coveragePath, coverageSha256, coverageDigest, reviewPath, review, implementationIdentity, repoRoot }) {
  const rel = (absolutePath) => relative(repoRoot, absolutePath).replace(/\\/g, "/");
  const previous = Array.isArray(review?.previousReviews) ? review.previousReviews : [];
  const lines = [];
  lines.push("page coverage の独立レビュー承認が、現在のcoverageに対して有効ではありません。");
  lines.push("");
  lines.push("【不足している条件】");
  for (const blocker of blockers) lines.push(`  - ${blocker}`);
  lines.push("");
  lines.push("【実装役が次にやること】");
  lines.push("  承認は実装役が自分で作れません（独立性の要件）。ここで待機に入らず、下の依頼書をそのまま");
  lines.push("  レビュー役（既定は同一エージェントの別contextセッション）へ渡してください。渡すまでが実装役の工程です。");
  lines.push("  レビュー役が承認を書いたら preflight を再実行すれば、そのまま編集へ進めます。");
  lines.push("");
  lines.push("--- ここから依頼書（そのままコピーして渡す） ---");
  lines.push(`scopeId: ${manifestId}`);
  lines.push(`page coverage: ${rel(coveragePath)}`);
  lines.push(`page coverage SHA-256（参考。ファイル全体のバイト列）: ${coverageSha256}`);
  lines.push(`page coverage digest（この値に対して承認する）: ${coverageDigest}`);
  lines.push(`承認を書き込むファイル: ${rel(reviewPath)}`);
  if (review?.pageCoverageSha256) lines.push(`直前に承認済みだったSHA-256: ${review.pageCoverageSha256}`);
  if (previous.length > 0) {
    lines.push(`過去のレビュー: ${previous.length + 1} 回目になる（前回まで: ${previous.map((entry) => `round ${entry.round}=${entry.status}`).join(" / ")}）`);
  }
  lines.push(`実装役の identity: actor=${implementationIdentity.actor} / contextId=${implementationIdentity.contextId}`);
  lines.push("レビュー役の identity 制約: actor か contextId の少なくとも一方を上と変えること。");
  lines.push("");
  lines.push("承認ファイルの必須フィールド:");
  lines.push('  version: 2 / status: "approved" / reviewerRole: "independent-reviewer"');
  lines.push("  reviewerActor / reviewerContextId / reviewedAt（ISO8601）");
  lines.push(`  pageCoverageSha256: ${coverageSha256}`);
  lines.push(`  pageCoverageDigest: ${coverageDigest}`);
  lines.push("    ↑ digest を宣言すると、分類を変えない編集（注記の修正・宣言の追加）では承認が失効しません。");
  lines.push("  findings: []（不合格が残る場合は status を changes-requested にして findings を埋める）");
  lines.push("");
  lines.push("レビュー役は、実装役の申告値を採用せず、凍結metadataとファイル実体から再計算して照合すること。");
  lines.push("--- ここまで依頼書 ---");
  return lines.join("\n");
}

// scope の途中で coverage を小刻みに広げると、そのたびに独立レビュー承認が失効し、
// 人間を経由した再承認が1往復ずつ増える。実測（2026-08-26）で1 scope に6往復発生し、
// オーナーからは「コードの修正を行わない」という問題として観測された。
// 規則（figma-spec-pipeline.md「coverage は scope 開始時に確定させる」）だけでは工程が守られないため、
// 「承認済みcoverageを後から変えた」ことを機械的に可視化し、オーナー指示によるものだと宣言させる。
//
// 禁止ではなく宣言の強制である。オーナーが対象を追加するのは正当な運用であり、
// 止めたいのは「実装しながら気づいた順に足していく」ほうだけである。
function assertCoverageExpansionIsDeclared(coverage, review, coveragePath, repoRoot, coverageDigest) {
  const previous = Array.isArray(review?.previousReviews) ? review.previousReviews : [];
  // 数えるのは「分類を変えた失効」だけにする。バイト単位で数えると、注記の修正や
  // coverageExpansion の宣言追加そのものが回数に入り、宣言した瞬間に条件が動いて
  // 永久に満たせなくなる（2026-08-26 に実際に発生させた）。
  // digest を持たない過去のroundは、分類が変わったかを判定できないため数えない。
  // 版が違う digest は比較しない。算出対象を変えただけで「分類が変わった」と数えてしまう。
  const versionPrefix = COVERAGE_DIGEST_VERSION + "-";
  const supersededApprovals = previous.filter((entry) => entry
    && entry.status === "approved"
    && typeof entry.pageCoverageDigest === "string"
    && entry.pageCoverageDigest.startsWith(versionPrefix)
    && entry.pageCoverageDigest !== coverageDigest);
  if (supersededApprovals.length === 0) return;

  const latest = supersededApprovals[supersededApprovals.length - 1];
  const latestSha256 = typeof latest.pageCoverageDigest === "string" ? latest.pageCoverageDigest : null;
  const relativeCoveragePath = relative(repoRoot, coveragePath).replace(/\\/g, "/");
  const declaration = coverage.coverageExpansion;

  const explain = (reason) => fail(
    "承認済みの page coverage を後から変更しています。" + reason + "\n" +
    `  この coverage は既に ${supersededApprovals.length} 回、承認を得たあとで分類が変更されています。\n` +
    (latestSha256 ? `  直近で失効した承認の digest: ${latestSha256}\n` : "") +
    "\n" +
    "  原則は、scope 開始時にページ全体の coverage を確定させ、承認は1回にすることです。\n" +
    "  実装しながら対象を継ぎ足すと、そのたびに承認が失効し再承認の往復が発生します\n" +
    "  （figma-to-code/rules/figma-spec-pipeline.md「coverage は scope 開始時に確定させる」）。\n" +
    "\n" +
    "  この追加がオーナーの明示指示によるものなら、続けて構いません。\n" +
    `  その場合は ${relativeCoveragePath} に次を宣言してください。\n` +
    "\n" +
    '  "coverageExpansion": {\n' +
    `    "supersededApprovalDigest": ${JSON.stringify(latestSha256 ?? "<直近で失効した承認のdigest>")},\n` +
    '    "ownerInstruction": "<オーナーが対象追加を指示した内容。20文字以上>",\n' +
    '    "addedSectionIds": ["<今回targetへ加えたsectionId>"]\n' +
    "  }\n" +
    "\n" +
    "  オーナー指示によるものでないなら、この追加は別scopeとして起票してください。"
  );

  if (!declaration || typeof declaration !== "object" || Array.isArray(declaration)) {
    explain(" coverageExpansion の宣言がありません。");
  }
  if (typeof declaration.ownerInstruction !== "string" || declaration.ownerInstruction.trim().length < 20) {
    explain(" coverageExpansion.ownerInstruction が空、または20文字未満です。");
  }
  if (!Array.isArray(declaration.addedSectionIds)) {
    explain(" coverageExpansion.addedSectionIds が配列ではありません（role変更のみなら空配列で構いません）。");
  }
  // 宣言が古いまま放置されると、2回目以降の拡張が素通りする。
  // 直近で失効した承認を指していることを必須にして、拡張のたびに書き直させる。
  if (latestSha256 && declaration.supersededApprovalDigest !== latestSha256) {
    explain(
      " coverageExpansion.supersededApprovalDigest が、直近で失効した承認を指していません" +
      `（宣言: ${declaration.supersededApprovalDigest ?? "(未宣言)"}）。前回の拡張のまま更新されていません。`
    );
  }
}

// 凍結metadataの raw は Figma MCP が返すXML風の木。タグ名にはハイフンを含むもの
// （rounded-rectangle 等）があるため `[\w-]+` で拾う。`\w+` だと取りこぼす。
const FROZEN_METADATA_TAG = /<([\w-]+)\s+([^>]*?)(\/?)>|<\/([\w-]+)>/g;
const FROZEN_METADATA_ATTR = /(\w+)="([^"]*)"/g;

function parseFrozenMetadata(raw, label) {
  if (typeof raw !== "string" || raw.trim() === "") {
    fail(label + " has no raw metadata tree to parse");
  }
  const nodes = new Map();
  const stack = [];
  let rootId = null;
  FROZEN_METADATA_TAG.lastIndex = 0;
  let match;
  while ((match = FROZEN_METADATA_TAG.exec(raw)) !== null) {
    if (match[4]) {
      stack.pop();
      continue;
    }
    const attributes = {};
    FROZEN_METADATA_ATTR.lastIndex = 0;
    let attribute;
    while ((attribute = FROZEN_METADATA_ATTR.exec(match[2])) !== null) {
      attributes[attribute[1]] = attribute[2];
    }
    const id = attributes.id;
    const parent = stack.length > 0 ? stack[stack.length - 1] : null;
    if (id) {
      nodes.set(id, {
        id,
        name: attributes.name ?? null,
        parent,
        hidden: attributes.hidden === "true" || attributes.visible === "false",
        children: [],
      });
      if (parent && nodes.has(parent)) nodes.get(parent).children.push(id);
      if (rootId === null) rootId = id;
    }
    if (!match[3]) stack.push(id ?? null);
  }
  return { nodes, rootId };
}

function ancestorsOf(nodes, id) {
  const out = [];
  let current = nodes.get(id);
  while (current && current.parent) {
    out.push(current.parent);
    current = nodes.get(current.parent);
  }
  return out;
}

function inheritsHidden(nodes, id) {
  let current = nodes.get(id);
  while (current) {
    if (current.hidden) return true;
    current = current.parent ? nodes.get(current.parent) : null;
  }
  return false;
}

function descendantsOf(nodes, id) {
  const out = new Set();
  const stack = [id];
  while (stack.length > 0) {
    const current = nodes.get(stack.pop());
    if (!current) continue;
    for (const child of current.children) {
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

// 凍結metadataを構文解析して、機械で判定できる coverage の不備をここで落とす。
//
// 2026-08-26 まで、この5件は独立レビューの手作業だった。実測では round 1〜3 の指摘
// F-1（page root 直下の被覆漏れ）・F-2（PC/SP対の非等価）・F-3（測定ノードの二重計上）が
// すべてこの範囲で、機械で出せる不合格を人手の往復で発見していた。往復がそのまま待ち時間になる。
// 判断を要しないものはレビュー役に残さない（rules/figma-spec-pipeline.md）。
//
// componentのfigmaNodeIdは意図的に対象外にしている。coverage契約はcomponentの
// figmaNodeIdとsectionノードの一致を要求しておらず、ページroot基準の座標specを持つ
// componentがrootをanchorにする運用が実在する（painted:false のため画像差分の基準にもならない）。
export function assertFrozenMetadataConsistency(coverage, coveragePath, sectionById, repoRoot) {
  if ((coverage.pageKind ?? "page-design") !== "page-design") return;

  const trees = {};
  for (const viewport of ["pc", "sp"]) {
    const page = coverage.pages[viewport];
    const metadataPath = resolve(dirname(coveragePath), page.metadataPath);
    const metadata = readJson(metadataPath);
    const label = "Figma page metadata (" + viewport + ")";
    // metadataPath は生ツリー（raw を持つ）を直接指す場合と、node evidence
    // （p3-figma-node-evidence/v1）を指して、その中から viewport ごとの生ツリーを
    // 参照する場合の両方が実在する。後者は1段たどる。
    if (typeof metadata.raw === "string") {
      trees[viewport] = parseFrozenMetadata(metadata.raw, label);
      continue;
    }
    const evidence = Array.isArray(metadata.evidence) ? metadata.evidence : null;
    if (!evidence) {
      fail(label + " must contain either a raw metadata tree or a p3-figma-node-evidence/v1 evidence list");
    }
    const entry = evidence.find((item) => item
      && item.viewport === viewport
      && (item.nodeId === page.nodeId || item.role === "page-root"));
    if (!entry || typeof entry.metadataPath !== "string") {
      fail(label + " has no page-root evidence entry for " + viewport);
    }
    const rawPath = resolve(repoRoot, entry.metadataPath);
    if (!existsSync(rawPath)) fail(label + " references a missing metadata file: " + entry.metadataPath);
    if (typeof entry.metadataSha256 === "string" && sha256File(rawPath) !== entry.metadataSha256) {
      fail(label + " metadata hash mismatch: " + entry.metadataPath);
    }
    trees[viewport] = parseFrozenMetadata(readJson(rawPath).raw, label);
  }

  const problems = [];
  const declare = (message) => problems.push("  - " + message);

  // (1) 実在: coverage が参照するノードが凍結metadataにあること
  // (4) hidden継承: 非表示を継承したノードを対象にしていないこと
  const registered = [];
  for (const section of coverage.sections) {
    for (const viewport of ["pc", "sp"]) {
      const nodeId = section.figmaNodeIds?.[viewport] ?? null;
      if (nodeId) registered.push({ label: "section " + section.sectionId, viewport, nodeId });
      for (const measurement of section.measurementFigmaNodeIds?.[viewport] ?? []) {
        registered.push({ label: "measurement " + section.sectionId, viewport, nodeId: measurement, measurement: true, sectionId: section.sectionId });
      }
    }
  }
  for (const entry of registered) {
    const tree = trees[entry.viewport];
    if (!tree.nodes.has(entry.nodeId)) {
      declare(`${entry.label} の ${entry.viewport} ノード ${entry.nodeId} が凍結metadataに存在しません。`);
      continue;
    }
    if (inheritsHidden(tree.nodes, entry.nodeId)) {
      declare(`${entry.label} の ${entry.viewport} ノード ${entry.nodeId} は hidden を継承しています。非表示要素を検証対象にできません。`);
    }
  }

  // (2) 包含: measurement は自 section ノードの子孫であること
  for (const section of coverage.sections) {
    for (const viewport of ["pc", "sp"]) {
      const own = section.figmaNodeIds?.[viewport] ?? null;
      if (!own) continue;
      const tree = trees[viewport];
      if (!tree.nodes.has(own)) continue;
      for (const measurement of section.measurementFigmaNodeIds?.[viewport] ?? []) {
        if (!tree.nodes.has(measurement)) continue;
        if (measurement === own) continue;
        if (!ancestorsOf(tree.nodes, measurement).includes(own)) {
          declare(`${section.sectionId} の ${viewport} measurement ${measurement} が、自section のノード ${own} の子孫ではありません。`);
        }
      }
    }
  }

  // (3) 二重計上: 同じ測定ノードを複数の section が宣言していないこと
  const measurementOwners = new Map();
  for (const section of coverage.sections) {
    for (const viewport of ["pc", "sp"]) {
      for (const measurement of section.measurementFigmaNodeIds?.[viewport] ?? []) {
        const key = viewport + ":" + measurement;
        if (!measurementOwners.has(key)) measurementOwners.set(key, []);
        measurementOwners.get(key).push(section.sectionId);
      }
    }
  }
  for (const [key, owners] of measurementOwners) {
    if (owners.length > 1) {
      declare(`測定ノード ${key} を複数の section が宣言しています（${owners.join(" / ")}）。二重計上になります。`);
    }
  }

  // (5) 被覆: page root 直下の子が inventory で被覆されていること
  // hidden の子は表示されないため対象外にする。
  const inventorySections = coverage.inventory?.sections ?? [];
  for (const viewport of ["pc", "sp"]) {
    const tree = trees[viewport];
    const rootId = coverage.pages[viewport].nodeId;
    if (!tree.nodes.has(rootId)) {
      declare(`page root ${rootId}（${viewport}）が凍結metadataに存在しません。`);
      continue;
    }
    const registeredIds = inventorySections
      .map((entry) => entry.figmaNodeIds?.[viewport] ?? null)
      .filter((value) => typeof value === "string" && tree.nodes.has(value));
    for (const child of tree.nodes.get(rootId).children) {
      if (tree.nodes.get(child).hidden) continue;
      const subtree = descendantsOf(tree.nodes, child);
      subtree.add(child);
      const coveredFromBelow = registeredIds.some((id) => subtree.has(id));
      const coveredFromAbove = registeredIds.some((id) => descendantsOf(tree.nodes, id).has(child));
      if (!coveredFromBelow && !coveredFromAbove) {
        declare(
          `page root 直下の ${viewport} ノード ${child}` +
          `（${tree.nodes.get(child).name ?? "名称なし"}）が inventory で被覆されていません。`
        );
      }
    }
  }

  if (problems.length > 0) {
    fail(
      "page coverage が凍結Figma metadataと整合しません。\n" +
      problems.join("\n") + "\n\n" +
      "  これらは凍結metadataの構文解析で機械的に判定できる項目です。独立レビューを依頼する前に解消してください\n" +
      "  （figma-to-code/rules/figma-spec-pipeline.md「機械で判定できる検査を、人手のレビューに残さない」）。"
    );
  }
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
  const manifestId = requireString(manifest.id, "manifest id");

  // scope paths are repository-relative everywhere else in the gate manifest.
  // Resolving from the manifest directory would turn `MyBrain/verify/...` into
  // `MyBrain/verify/MyBrain/verify/...` after the template is copied.
  const repoRoot = process.cwd();
  const componentsPath = resolve(repoRoot, scope.componentsPath);
  const coveragePath = resolve(repoRoot, scope.pageCoveragePath);
  if (!existsSync(componentsPath)) fail("component manifest is missing: " + componentsPath);
  if (!existsSync(coveragePath)) fail("page coverage is missing: " + coveragePath);

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
  const coverageDigest = canonicalCoverageDigest(coverage);

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
  assertFrozenMetadataConsistency(coverage, coveragePath, sectionById, repoRoot);

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
    coverage,
    componentById,
    sectionById,
    coverageSha256,
    implementationIdentity,
  };
}

// runtime も scope ごとに1ファイルにする。manifestのディレクトリだけで決めていた頃は
// MyBrain/verify/ 配下の全manifestが同じ page-coverage-runtime.json を共有し、
// Figma gate の受領証を per-manifest 化しても、並行した2つ目のscopeが1つ目の
// セクション状態（next / current / verified）を上書きしていた（2026-08-25）。
function runtimeDirectory(absoluteManifestPath) {
  return resolve(dirname(absoluteManifestPath), ".figma-gate");
}

// 旧1枠形式。移行期間は読むだけで、新規の書き込みはしない。
function legacyRuntimePath(absoluteManifestPath) {
  return resolve(runtimeDirectory(absoluteManifestPath), "page-coverage-runtime.json");
}

function runtimePath(manifestPath) {
  const absolute = resolve(manifestPath);
  const name = basename(absolute).replace(/\.json$/i, "").replace(/[^A-Za-z0-9._-]/g, "_");
  return resolve(runtimeDirectory(absolute), "runtime", `${name}.json`);
}

// 読み出しは新形式を優先し、無ければ旧1枠を見る。移行中に runtime を持っている
// scope（checkpoint 実行中のもの）を壊さないための経路。
function existingRuntimePath(manifestPath) {
  const absolute = resolve(manifestPath);
  const scoped = runtimePath(absolute);
  if (existsSync(scoped)) return scoped;
  const legacy = legacyRuntimePath(absolute);
  if (existsSync(legacy)) return legacy;
  return scoped;
}

function writeRuntime(path, runtime) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(runtime, null, 2) + "\n", "utf8");
}

function loadRuntime(manifestPath, implementationIdentityInput) {
  // 新形式を優先し、無ければ旧1枠を見る。移行前に preflight した scope は
  // 旧パスに runtime を持っており、以降の checkpoint もそのファイルを読み書きし続ける。
  const path = existingRuntimePath(manifestPath);
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
  // どの入力が動いたのかを名指しする。4つまとめて「変わった」とだけ言うと、
  // 実装役は毎回4ファイルを突き合わせ直すことになる。
  const frozenInputs = [
    ["manifest", runtime.manifestSha256, sha256File(context.absoluteManifestPath)],
    ["components", runtime.componentsSha256, sha256File(context.componentsPath)],
    ["page coverage", runtime.coverageSha256, context.coverageSha256],
  ];
  const movedInputs = frozenInputs.filter(([, frozen, current]) => frozen !== current);
  if (movedInputs.length > 0) {
    fail(
      "preflightで凍結した入力が変更されています。preflight を再実行してください。\n" +
        movedInputs
          .map(([label, frozen, current]) => `  - ${label}: 凍結 ${String(frozen).slice(0, 12)}… → 現在 ${String(current).slice(0, 12)}…`)
          .join("\n") +
        "\n  page coverage が動いている場合は、対象範囲とFigma nodeの対応を再確認してからpreflightを再実行する。"
    );
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
