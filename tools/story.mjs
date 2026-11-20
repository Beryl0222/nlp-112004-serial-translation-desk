// 原作侧的叙事位阶：回内/回间顺序、身份揭示锚点、视角人物。
// 身份只有在故事内书信明确之后（lexicon.visibleAfter）才能视为定论；
// visibleAfter 为 null 的词条没有定论时刻，始终按读者视角处理。

export function anchorOrder(chapters) {
  return [...chapters]
    .sort((a, b) => a.chapter - b.chapter || a.order - b.order)
    .map(row => row.id);
}

export function indexOfAnchor(order, anchorId) {
  return order.indexOf(anchorId);
}

// 到某个原作锚点（含）为止，故事里已经可以定论的人物。
export function settledAt(lexicon, order, anchorId) {
  const cutoff = indexOfAnchor(order, anchorId);
  const result = new Set();
  for (const entry of lexicon) {
    if (entry.visibleAfter !== null && indexOfAnchor(order, entry.visibleAfter) <= cutoff) {
      result.add(entry.actor);
    }
  }
  return result;
}

// 一组原作锚点覆盖到的最早共同认知位（取其中最靠后的锚点）。
export function horizonOf(order, anchorIds) {
  let horizon = -1;
  for (const anchorId of anchorIds) {
    const index = indexOfAnchor(order, anchorId);
    if (index > horizon) horizon = index;
  }
  return horizon;
}

export function isSettledAtHorizon(lexicon, order, actor, horizon) {
  const entry = lexicon.find(item => item.actor === actor);
  if (!entry || entry.visibleAfter === null) return false;
  return indexOfAnchor(order, entry.visibleAfter) <= horizon;
}

// 译稿链接锚点所对应的原作视角人物（中文/译文并段后允许一段对应多个原锚点）。
export function viewpointsOf(chapters, anchorIds) {
  const found = [];
  for (const anchorId of anchorIds) {
    const chapter = chapters.find(row => row.id === anchorId);
    if (chapter && !found.includes(chapter.pointOfView)) found.push(chapter.pointOfView);
  }
  return found;
}

export function sourceTextOf(chapters, anchorIds) {
  const byAnchor = new Map(chapters.map(row => [row.id, row]));
  return anchorIds.map(id => byAnchor.get(id)?.text).filter(Boolean).join('\n');
}

// 某称谓在原作锚点处是否仍属于合法候选：
// visibleAfter 为 null（无揭示点）的人物恒为候选；未到揭示点前也仍是候选。
export function viableActors(lexicon, order, horizon) {
  const actors = new Set();
  for (const entry of lexicon) {
    if (entry.visibleAfter === null || indexOfAnchor(order, entry.visibleAfter) > horizon) {
      actors.add(entry.actor);
    }
  }
  return actors;
}
