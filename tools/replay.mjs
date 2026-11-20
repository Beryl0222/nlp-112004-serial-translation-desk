// 发行回放：重放某区截至某时刻实际可见的顺序、争议译法与仍须校改的范围。
// 回放只读日志记录，不重写历史；撤下事件保留在时间线上。
import { reviewPiece } from './review.mjs';
import { visibilityTimeline, availableAnchorsFor, evaluateAllPrerequisites } from './visibility.mjs';

export function replay(bundle, region, at = new Date().toISOString()) {
  const pieceById = new Map(bundle.translations.map(piece => [piece.id, piece]));
  const current = new Map();
  const steps = [];
  for (const event of visibilityTimeline(bundle, region, at)) {
    for (const id of event.translationIds) current.set(id, event.state);
    const anchorsAtEvent = new Set();
    for (const [id, state] of current) {
      if (state !== '已发') continue;
      for (const anchor of pieceById.get(id)?.links ?? []) anchorsAtEvent.add(anchor);
    }
    const disputes = event.translationIds.map(id => {
      const piece = pieceById.get(id);
      if (!piece) return null;
      const findings = reviewPiece(bundle, piece, { availableAnchors: anchorsAtEvent });
      return {
        pieceId: id,
        state: event.state,
        findings: findings.map(item => ({
          code: item.code,
          severity: item.severity,
          message: item.message,
        })),
      };
    }).filter(Boolean);
    steps.push({
      at: event.at,
      issueId: event.issueId,
      state: event.state,
      note: event.note,
      requires: event.requires,
      visibleAfterStep: [...current.entries()].filter(([, state]) => state === '已发').map(([id]) => id),
      disputes,
    });
  }

  const anchorsNow = availableAnchorsFor(bundle, region, at);
  const latestState = new Map();
  for (const event of visibilityTimeline(bundle, region, at)) {
    for (const id of event.translationIds) latestState.set(id, event.state);
  }
  const outstanding = bundle.translations
    // 已撤下的稿件不列入仍须校改（其级联由 withdrawalCascade 单独交代）；
    // 从未上刊的待批/待发稿件没有日志状态，仍须纳入校改范围。
    .filter(piece => piece.region === region && latestState.get(piece.id) !== '撤下')
    .map(piece => ({ pieceId: piece.id, findings: reviewPiece(bundle, piece, { availableAnchors: anchorsNow }) }))
    .filter(item => item.findings.some(finding => finding.severity === 'blocker' || finding.severity === 'warning'))
    .map(item => ({
      pieceId: item.pieceId,
      blockers: item.findings.filter(finding => finding.severity === 'blocker').map(finding => finding.code),
      warnings: item.findings.filter(finding => finding.severity === 'warning').map(finding => finding.code),
    }));

  return {
    region,
    at,
    steps,
    prerequisiteReports: evaluateAllPrerequisites(bundle, region, at),
    outstanding,
  };
}
