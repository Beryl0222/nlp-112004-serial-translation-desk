// 读者目录：订阅地区只看到安全的目录和译稿。
// editorOnly 的编辑专用释义只允许出现在编辑侧结论里，绝不进入读者输出。
import { reviewPiece, summarize } from './review.mjs';
import {
  visibleTranslations, availableAnchorsFor, visibilityWindows, wasEverVisible,
} from './visibility.mjs';

export function readerCatalog(bundle, region, at = new Date().toISOString()) {
  const anchors = availableAnchorsFor(bundle, region, at);
  const visibleIds = visibleTranslations(bundle, region, at);
  const entries = [];
  for (const piece of bundle.translations) {
    if (piece.region !== region || !visibleIds.includes(piece.id)) continue;
    const findings = reviewPiece(bundle, piece, { availableAnchors: anchors });
    const blockers = findings.filter(item => item.severity === 'blocker');
    entries.push({
      id: piece.id,
      language: piece.language,
      rev: piece.rev,
      links: [...piece.links],
      body: piece.body, // 读者字段：仅译稿正文与链接锚点，不含任何 editorOnly 背景
      safe: blockers.length === 0,
      blockers: blockers.map(item => ({ code: item.code, message: item.message })),
    });
  }
  return {
    region,
    at,
    readerVisible: entries.map(entry => entry.id),
    catalog: entries,
    allSafe: entries.every(entry => entry.safe),
  };
}

// 编辑侧视图：同一份可见内容之外，另附暴露标记与可见窗口（撤回后仍保留历史）。
export function editorialDeskView(bundle, region, at = new Date().toISOString()) {
  const catalog = readerCatalog(bundle, region, at);
  const editorFacts = bundle.lexicon.map(entry => ({
    actor: entry.actor,
    editorOnly: entry.editorOnly,
    visibleAfter: entry.visibleAfter,
  }));
  // 曝光清单包含「当前可见」与「曾经可见后被撤下」的全部稿件，
  // 因为撤回不能消除读者已看过的文字；从未发出的稿件不在其中。
  const exposure = bundle.translations
    .filter(piece => piece.region === region && wasEverVisible(bundle, region, piece.id))
    .map(piece => ({ pieceId: piece.id, windows: visibilityWindows(bundle, region, piece.id) }));
  return {
    region,
    at,
    catalog,
    editorFacts, // 仅编辑可见，明确与读者目录分层
    exposure,
    guard: 'editorFacts 与曝光标记为编辑侧字段，禁止并入读者目录输出',
  };
}

// 防泄漏自检：读者目录序列化后不得包含任何 editorOnly 字样或其独有片段。
export function assertNoEditorLeak(bundle, region, at = new Date().toISOString()) {
  const payload = JSON.stringify(readerCatalog(bundle, region, at));
  const leaks = [];
  for (const entry of bundle.lexicon) {
    const distinctive = entry.editorOnly.slice(0, 6);
    if (payload.includes(distinctive)) leaks.push(entry.actor);
  }
  return { ok: leaks.length === 0, leaks };
}

export function catalogSummary(bundle, region, at = new Date().toISOString()) {
  const catalog = readerCatalog(bundle, region, at);
  const totals = { blocker: 0, warning: 0, info: 0 };
  for (const entry of catalog.catalog) {
    const anchors = availableAnchorsFor(bundle, region, at);
    const piece = bundle.translations.find(item => item.id === entry.id);
    const counts = summarize(reviewPiece(bundle, piece, { availableAnchors: anchors }));
    for (const key of Object.keys(totals)) totals[key] += counts[key];
  }
  return { region, at, ...totals, allSafe: catalog.allSafe };
}
