// 编校工作台：修订批准与跨区词形差异核对。
// 允许不同发行地区在同一阅读位置使用不同词形，但同一读者版本内
// 已确定的身份和实际可读到的线索不能矛盾。
import { reviewPiece, severity } from './review.mjs';
import { availableAnchorsFor, wasEverVisible, visibilityWindows } from './visibility.mjs';

// 批准一篇修订稿在某区当前阅读位置使用。返回能否批准及理由。
export function approveRevision(bundle, region, pieceId, at = new Date().toISOString()) {
  const piece = bundle.translations.find(item => item.id === pieceId);
  if (!piece) throw new Error(`找不到译稿 ${pieceId}`);
  if (piece.region !== region) {
    return { approved: false, reasons: [`译稿属于 ${piece.region}，不能在 ${region} 发行`] };
  }
  const anchors = availableAnchorsFor(bundle, region, at);
  const findings = reviewPiece(bundle, piece, { availableAnchors: anchors });
  const blockers = findings.filter(item => item.severity === severity.blocker);
  const warnings = findings.filter(item => item.severity === severity.warning);
  const reasons = [...blockers, ...warnings].map(item => `[${item.code}] ${item.message}`);
  return {
    approved: blockers.length === 0,
    withWarnings: blockers.length === 0 && warnings.length > 0,
    reasons,
    notes: findings.filter(item => item.severity === severity.info).map(item => `[${item.code}] ${item.message}`),
  };
}

// 同一原作锚点在不同地区的词形对照：编辑可看到各区保留了哪些线索、用了什么称谓。
export function compareRegionalWordings(bundle, anchorId, at = new Date().toISOString()) {
  const regions = [...new Set(bundle.translations.map(piece => piece.region))];
  return regions.map(region => {
    const anchors = availableAnchorsFor(bundle, region, at);
    const pieces = bundle.translations.filter(piece =>
      piece.region === region && piece.links.includes(anchorId));
    return {
      region,
      anchor: anchorId,
      anchorReadable: anchors.has(anchorId),
      wordings: pieces.map(piece => {
        const findings = reviewPiece(bundle, piece, { availableAnchors: anchors });
        return {
          pieceId: piece.id,
          language: piece.language,
          rev: piece.rev,
          everVisible: wasEverVisible(bundle, region, piece.id),
          windows: visibilityWindows(bundle, region, piece.id),
          flags: findings.map(item => ({ code: item.code, severity: item.severity })),
          body: piece.body,
        };
      }),
    };
  });
}

// 编辑意见与稿件的对应关系回放（editorial.related）。
export function editorialTrail(bundle, region) {
  return bundle.editorial
    .filter(note => note.region === region)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map(note => ({
      noteId: note.id,
      at: note.at,
      related: [...note.related],
      text: note.text,
    }));
}
