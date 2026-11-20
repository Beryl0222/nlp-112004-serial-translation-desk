// 编校审查：谁在说话、角色当时知道什么、一个称呼可能指谁。
// 两道闸门——
//   故事位：译稿链接到的原作锚点是否已经走到该人物的揭示点；
//   读者位：订阅地区此刻是否实际能读到揭示锚点（随本稿自带也算）。
// 只过读者位不过故事位 = 提前剧透；只过故事位不过读者位 = 跨区照搬。
import { makeScanner, isGenericHandleSource, ambiguityPhrases } from './glossary.mjs';
import {
  anchorOrder, horizonOf, isSettledAtHorizon, indexOfAnchor,
  viewpointsOf, sourceTextOf, viableActors,
} from './story.mjs';

// 各语种里「把揭示当成已经证实」的措辞信号（译注/小结泄露身份时用）。
// 拉丁字母语种按词边界匹配，屈折形式在表中显式收录，避免 llevara→lleva 这类词干误报。
const revealReference = {
  en: ['identity', 'confirm', 'confirmed', 'reveal', 'revealed', 'clue', 'connect', 'connected'],
  es: ['nombre', 'confirmar', 'identidad', 'dice la carta'],
  zh: ['身份', '证实', '真名'],
};

function hasKeyword(body, language, keywords) {
  if (language === 'zh') return keywords.some(word => body.includes(word));
  const lower = body.toLowerCase();
  return keywords.some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(lower);
  });
}

export const severity = { blocker: 'blocker', warning: 'warning', info: 'info' };

function finding(code, level, pieceId, message, extra = {}) {
  return { code, severity: level, pieceId, message, ...extra };
}

export function createReviewContext(bundle, options = {}) {
  const order = anchorOrder(bundle.chapters);
  const chapterById = new Map(bundle.chapters.map(row => [row.id, row]));
  const availableAnchors = options.availableAnchors instanceof Set
    ? options.availableAnchors
    : new Set(options.availableAnchors ?? []);
  const scanners = new Map();
  const scannerFor = language => {
    if (!scanners.has(language)) scanners.set(language, makeScanner(bundle.lexicon, language));
    return scanners.get(language);
  };
  const settleAnchorOf = actor => bundle.lexicon.find(entry => entry.actor === actor)?.visibleAfter ?? null;

  function regionSettled(actor, selfLinks) {
    const anchor = settleAnchorOf(actor);
    if (anchor === null) return false;
    return availableAnchors.has(anchor) || selfLinks.includes(anchor);
  }

  return { bundle, order, chapterById, availableAnchors, scannerFor, settleAnchorOf, regionSettled };
}

// 单稿审查。options.availableAnchors 为该区读者此刻实际可读的原作锚点集合。
export function reviewPiece(bundle, piece, options = {}) {
  const ctx = createReviewContext(bundle, options);
  return reviewWithContext(ctx, piece);
}

function reviewWithContext(ctx, piece) {
  const { bundle, order, scannerFor, settleAnchorOf, regionSettled } = ctx;
  const findings = [];
  const scan = scannerFor(piece.language);
  const scanned = scan(piece.body);
  const horizon = horizonOf(order, piece.links);
  const source = sourceTextOf(bundle.chapters, piece.links);
  const genericSource = isGenericHandleSource(source);
  const sourceMarkers = ambiguityPhrases.filter(phrase => source.includes(phrase.marker));
  const localMarkerPhrases = sourceMarkers
    .flatMap(phrase => phrase[piece.language] ?? [])
    .map(text => text.toLowerCase());
  const preservesMarker = localMarkerPhrases.some(needle => piece.body.toLowerCase().includes(needle));

  // 真名提及：先过故事位，再过读者位。
  for (const mention of scanned.actors) {
    if (!isSettledAtHorizon(bundle.lexicon, order, mention.actor, horizon)) {
      findings.push(finding('PREMATURE_IDENTITY', severity.blocker, piece.id,
        `原作在本稿锚点处尚未揭示 ${mention.actor}，真名「${mention.surface}」提前排除了其他解释`,
        { actor: mention.actor, surface: mention.surface, gate: 'story' }));
      const alternatives = [...viableActors(bundle.lexicon, order, horizon)].filter(actor => actor !== mention.actor);
      if (alternatives.length > 0) {
        findings.push(finding('CLOSED_ALTERNATIVE', severity.blocker, piece.id,
          `本稿坐实 ${mention.actor} 时，原作仍允许的候选 ${alternatives.join('、')} 被排除`,
          { actor: mention.actor, alternatives }));
      }
    } else if (!regionSettled(mention.actor, piece.links)) {
      findings.push(finding('PREMATURE_IDENTITY', severity.blocker, piece.id,
        `本区读者尚不可读揭示锚点 ${settleAnchorOf(mention.actor)}，真名「${mention.surface}」对当前阅读位置属于剧透`,
        { actor: mention.actor, surface: mention.surface, gate: 'region', settleAnchor: settleAnchorOf(mention.actor) }));
    }
  }

  // 称谓提及：区分「保留多解」「职务泛称/口吻」与可推断身份后的口吻保留。
  for (const mention of scanned.handles) {
    if (mention.actor === null) continue;
    const storySettled = isSettledAtHorizon(bundle.lexicon, order, mention.actor, horizon);
    const readerSettled = storySettled && regionSettled(mention.actor, piece.links);
    if (genericSource) {
      findings.push(finding('GENERIC_HANDLE', severity.info, piece.id,
        `「${mention.surface}」对应原作的职务泛称用法（${mention.handle}），不是身份指认`,
        { actor: mention.actor, handle: mention.handle, surface: mention.surface }));
    } else if (readerSettled) {
      findings.push(finding('VOICE_HANDLE', severity.info, piece.id,
        `身份已可定论，仍用「${mention.surface}」（${mention.handle}）保留角色口吻；编辑可推断为 ${mention.actor}，与真歧义不同`,
        { actor: mention.actor, handle: mention.handle, surface: mention.surface }));
    } else {
      findings.push(finding('AMBIGUITY_RETAINED', severity.info, piece.id,
        `「${mention.surface}」（${mention.handle}）保留了原作在该阅读位置的多解，未把称谓换成真名`,
        { actor: mention.actor, handle: mention.handle, surface: mention.surface }));
    }
  }

  // 原作明示多解而译文收束：要么构成封闭解释，要么属于丢失线索。
  if (sourceMarkers.length > 0) {
    const blockingActor = scanned.actors.find(mention =>
      !isSettledAtHorizon(bundle.lexicon, order, mention.actor, horizon)
      || !regionSettled(mention.actor, piece.links));
    if (blockingActor) {
      findings.push(finding('CLOSED_ALTERNATIVE', severity.blocker, piece.id,
        `原作语句（${sourceMarkers.map(marker => marker.marker).join('、')}）仍保留多解，本稿却给出确定指认`,
        { actor: blockingActor.actor, markers: sourceMarkers.map(marker => marker.marker) }));
    } else if (!preservesMarker) {
      findings.push(finding('CLUE_DROPPED', severity.warning, piece.id,
        `原作保留的多解线索（${sourceMarkers.map(marker => marker.marker).join('、')}）在译文中没有对应说法`,
        { markers: sourceMarkers.map(marker => marker.marker) }));
    } else {
      findings.push(finding('CLUE_PRESERVED', severity.info, piece.id,
        `译文保留了原作多解线索（${sourceMarkers.map(marker => marker.marker).join('、')}）`,
        { markers: sourceMarkers.map(marker => marker.marker) }));
    }
  }

  // 译注/小结把揭示当成已证实，但读者位上还读不到揭示锚点。
  const referencesReveal = hasKeyword(piece.body, piece.language, revealReference[piece.language] ?? []);
  if (referencesReveal && !findings.some(item => item.severity === severity.blocker)) {
    const hinted = scanned.handles.filter(mention =>
      settleAnchorOf(mention.actor) !== null && !regionSettled(mention.actor, piece.links));
    for (const mention of hinted) {
      findings.push(finding('UNRESOLVED_REVEAL', severity.warning, piece.id,
        `本稿以「已证实」口吻提到 ${mention.handle} 的身份，但揭示锚点 ${settleAnchorOf(mention.actor)} 在本区尚不可读`,
        { actor: mention.actor, settleAnchor: settleAnchorOf(mention.actor) }));
    }
  }

  // 同一封闭解释可能由真名提及和多解线索两处触发，按编码+人物+线索合并。
  const unique = [];
  const seen = new Set();
  for (const item of findings) {
    const signature = [
      item.code, item.actor ?? '', (item.markers ?? []).join(','), (item.alternatives ?? []).join(','),
    ].join('|');
    if (!seen.has(signature)) {
      seen.add(signature);
      unique.push(item);
    }
  }
  return unique;
}

// 跨稿合看：开头、标题、小结、译注与正文连着看；
// 两个本身不违规的注解放到一起，可能同时出现真名与称谓而完成指认。
export function reviewCorpus(bundle, region, pieceIds, options = {}) {
  const ctx = createReviewContext(bundle, options);
  const pieces = pieceIds
    .map(id => bundle.translations.find(piece => piece.id === id))
    .filter(piece => piece && piece.region === region);
  const findings = [];
  for (const piece of pieces) findings.push(...reviewWithContext(ctx, piece));

  const corpusHorizon = horizonOf(ctx.order, pieces.flatMap(piece => piece.links));
  const nameActors = new Map();
  const handleActors = new Map();
  for (const piece of pieces) {
    const scanned = ctx.scannerFor(piece.language)(piece.body);
    for (const mention of scanned.actors) {
      if (!nameActors.has(mention.actor)) nameActors.set(mention.actor, []);
      nameActors.get(mention.actor).push(piece.id);
    }
    for (const mention of scanned.handles) {
      if (mention.actor === null) continue;
      if (!handleActors.has(mention.actor)) handleActors.set(mention.actor, []);
      handleActors.get(mention.actor).push(piece.id);
    }
  }
  for (const [actor, namingPieces] of nameActors) {
    const handlePieces = handleActors.get(actor);
    if (!handlePieces || handlePieces.length === 0) continue;
    const storySettled = isSettledAtHorizon(bundle.lexicon, ctx.order, actor, corpusHorizon);
    const readerSettled = storySettled && ctx.regionSettled(actor, pieces.flatMap(piece => piece.links));
    if (!readerSettled) {
      findings.push(finding('COMBINED_DEANON', severity.blocker, null,
        `${[...new Set([...namingPieces, ...handlePieces])].join('、')} 合看时同时出现 ${actor} 的真名与称谓，读者可在揭示前完成指认`,
        { actor, namingPieces: [...new Set(namingPieces)], handlePieces: [...new Set(handlePieces)] }));
    }
  }
  return findings;
}

// 区内全部译稿逐稿审查，并附视角人物，供编辑核对「谁在说话」。
export function reviewRegion(bundle, region, options = {}) {
  const ctx = createReviewContext(bundle, options);
  return bundle.translations
    .filter(piece => piece.region === region)
    .map(piece => ({
      pieceId: piece.id,
      rev: piece.rev,
      viewpoints: viewpointsOf(bundle.chapters, piece.links),
      findings: reviewWithContext(ctx, piece),
    }));
}

export function summarize(findings) {
  const counts = { blocker: 0, warning: 0, info: 0 };
  for (const item of findings) counts[item.severity] += 1;
  return counts;
}
