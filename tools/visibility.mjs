// 地区发行台账：发行日志的晚记录可以改变同一稿件的可见状态，
// 但「已发资料在其发放时实际可见，撤回不等于从未可见」。

const states = {
  published: '已发',
  withdrawn: '撤下',
  editing: '编辑中',
};

function issuesOfRegion(bundle, region) {
  return bundle.issues
    .filter(issue => issue.region === region)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

// 截至某时刻，每篇译稿的可见状态时间线（按日志记录顺序逐事件累计）。
export function visibilityTimeline(bundle, region, at = new Date().toISOString()) {
  const cutoff = Date.parse(at);
  const events = [];
  for (const issue of issuesOfRegion(bundle, region)) {
    if (Date.parse(issue.at) > cutoff) continue;
    events.push({
      at: issue.at,
      issueId: issue.id,
      state: issue.state,
      translationIds: [...issue.translations],
      note: issue.note,
      requires: [...issue.requires],
    });
  }
  return events;
}

// 截至某时刻实际仍可读的译稿（撤下状态会覆盖早先的已发）。
export function visibleTranslations(bundle, region, at = new Date().toISOString()) {
  const current = new Map();
  for (const event of visibilityTimeline(bundle, region, at)) {
    for (const id of event.translationIds) current.set(id, event.state);
  }
  return [...current.entries()]
    .filter(([, state]) => state === states.published)
    .map(([id]) => id);
}

// 截至某时刻，读者在该区实际能读到的原作锚点（由已发译稿的 links 汇总）。
export function availableAnchorsFor(bundle, region, at = new Date().toISOString()) {
  const pieceById = new Map(bundle.translations.map(piece => [piece.id, piece]));
  const anchors = new Set();
  for (const id of visibleTranslations(bundle, region, at)) {
    const piece = pieceById.get(id);
    if (piece) for (const anchor of piece.links) anchors.add(anchor);
  }
  return anchors;
}

// 某篇译稿在该区历史上是否曾对读者可见（撤下也抹不掉这一段）。
export function wasEverVisible(bundle, region, pieceId) {
  return visibilityTimeline(bundle, region).some(event =>
    event.state === states.published && event.translationIds.includes(pieceId));
}

// 可见窗口：每次进入已发、以及被撤下覆盖的时间区间。
export function visibilityWindows(bundle, region, pieceId) {
  const windows = [];
  let openedAt = null;
  for (const event of visibilityTimeline(bundle, region)) {
    if (!event.translationIds.includes(pieceId)) continue;
    if (event.state === states.published && openedAt === null) openedAt = event.at;
    if (event.state === states.withdrawn && openedAt !== null) {
      windows.push({ from: openedAt, to: event.at, issueId: event.issueId });
      openedAt = null;
    }
  }
  if (openedAt !== null) windows.push({ from: openedAt, to: null });
  return windows;
}

// 评估一次发行的前置章节/必读附注是否都已可读：已发看实际可读性，编辑中看阻塞原因。
export function evaluatePrerequisites(bundle, region, issue, at = new Date().toISOString()) {
  const anchors = availableAnchorsFor(bundle, region, at);
  const missing = issue.requires.filter(anchor => !anchors.has(anchor));
  return {
    issueId: issue.id,
    region,
    state: issue.state,
    requires: [...issue.requires],
    missing,
    ok: missing.length === 0,
    // 已发却缺前置属于历史台账里的真实缺口，回放时照样报出，不做事后美化。
    detail: missing.length === 0
      ? '前置原作锚点均已可读'
      : `缺少必读锚点 ${missing.join('、')}，发行前前置章节或必读附注尚未可读`,
  };
}

export function evaluateAllPrerequisites(bundle, region, at = new Date().toISOString()) {
  return issuesOfRegion(bundle, region).map(issue => evaluatePrerequisites(bundle, region, issue, at));
}

// 撤下回退级联：新章节撤下供返修后——
//   编辑中且依赖其揭示的未发附注 → 降回待审；
//   已发且依赖同一揭示的内容     → 单独标明读者可能已经知情，不假装撤回能消除看过的文字。
// 依赖关系按被撤译稿自身承载的揭示锚点（links 中的 settle 点）判定，
// 而不是发行单上的 requires——撤下的是稿件，读者曾读到的线索以稿件为准。
export function withdrawalCascade(bundle, region, withdrawnIssueId, at = new Date().toISOString()) {
  const issue = bundle.issues.find(item => item.id === withdrawnIssueId && item.region === region);
  if (!issue) throw new Error(`找不到发行 ${withdrawnIssueId}`);
  const pieceById = new Map(bundle.translations.map(piece => [piece.id, piece]));
  const settleAnchors = new Set(
    bundle.lexicon
      .filter(entry => entry.visibleAfter !== null)
      .map(entry => entry.visibleAfter));
  const withdrawnPieces = issue.translations
    .map(id => pieceById.get(id))
    .filter(piece => piece && piece.region === region);
  const withdrawnReveal = new Set(
    withdrawnPieces.flatMap(piece => piece.links).filter(anchor => settleAnchors.has(anchor)));
  const everVisible = new Set(
    issue.translations.filter(id => wasEverVisible(bundle, region, id)));

  const pending = [];
  const exposed = [];
  for (const candidate of issuesOfRegion(bundle, region)) {
    if (candidate.id === withdrawnIssueId) continue;
    const depends = candidate.requires.some(anchor => withdrawnReveal.has(anchor));
    if (!depends) continue;
    if (candidate.state === states.editing) {
      pending.push({
        issueId: candidate.id,
        translationIds: [...candidate.translations],
        action: '降回待审',
        reason: `依赖的揭示锚点 ${[...withdrawnReveal].join('、')} 随 ${withdrawnIssueId} 撤下返修`,
      });
    } else if (candidate.translations.some(id => wasEverVisible(bundle, region, id))) {
      exposed.push({
        issueId: candidate.id,
        translationIds: candidate.translations.filter(id => wasEverVisible(bundle, region, id)),
        action: '标记读者可能已经知情',
        everVisibleWindows: Object.fromEntries(candidate.translations
          .filter(id => wasEverVisible(bundle, region, id))
          .map(id => [id, visibilityWindows(bundle, region, id)])),
        reason: '撤回不能消除读者已看到的文字，须按已知情范围单独校改',
      });
    }
  }

  // 基于被撤译稿的修订链（previous 指向）同样暂停。
  const chain = [];
  for (const piece of bundle.translations) {
    if (piece.region !== region || piece.previous === null) continue;
    if (everVisible.has(piece.previous)) {
      chain.push({
        pieceId: piece.id,
        previous: piece.previous,
        action: '修订链暂停',
        reason: `其修订底本 ${piece.previous} 已随 ${withdrawnIssueId} 撤下`,
      });
    }
  }
  return { region, withdrawnIssueId, withdrawnReveal: [...withdrawnReveal], pending, exposed, chain };
}
