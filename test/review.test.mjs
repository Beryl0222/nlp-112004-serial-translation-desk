import assert from 'node:assert/strict';
import test from 'node:test';
import { readBundle } from '../tools/materials.mjs';
import { makeScanner } from '../tools/glossary.mjs';
import { anchorOrder, settledAt, horizonOf, isSettledAtHorizon, viewpointsOf, viableActors } from '../tools/story.mjs';
import { reviewPiece, reviewCorpus, severity } from '../tools/review.mjs';
import { availableAnchorsFor } from '../tools/visibility.mjs';

const bundle = readBundle();
const NOW = '2026-11-20T18:00:00+08:00';
const hxAnchors = () => availableAnchorsFor(bundle, '河西', NOW);
const baAnchors = () => availableAnchorsFor(bundle, '北岸', NOW);
const piece = id => bundle.translations.find(item => item.id === id);
const codes = (findings, level) => findings.filter(f => f.severity === level).map(f => f.code);

test('故事位阶：信件锚点之前韩芦身份不能定论，副手仍是候选', () => {
  const order = anchorOrder(bundle.chapters);
  assert.deepEqual([...settledAt(bundle.lexicon, order, 'c22')], []);
  assert.deepEqual([...settledAt(bundle.lexicon, order, 'c31')], ['韩芦']);
  assert.equal(isSettledAtHorizon(bundle.lexicon, order, '韩芦', horizonOf(order, ['c11'])), false);
  const candidates = [...viableActors(bundle.lexicon, order, horizonOf(order, ['c11']))];
  assert.ok(candidates.includes('冬澈') && candidates.includes('韩芦'));
  // visibleAfter 为 null 的词条永远没有 settle 时刻
  assert.equal(isSettledAtHorizon(bundle.lexicon, order, '冬澈', horizonOf(order, ['c33'])), false);
});

test('词面扫描：译稿并段后仍能逐面识别人名与称谓', () => {
  const en = makeScanner(bundle.lexicon, 'en');
  const scanned = en(piece('x01').body);
  assert.ok(scanned.actors.length === 0, 'x01 不应出现任何真名');
  const handles = scanned.handles.map(h => h.handle);
  assert.ok(handles.includes('芦') && handles.includes('看灯人') && handles.includes('掌灯的'));
  const hanLu = en(piece('x04').body).actors;
  assert.ok(hanLu.some(a => a.actor === '韩芦' && a.surface === 'Han Lu'));
  // Han 落在 Han Lu 之内时只保留更长匹配，不会拆成两条
  assert.deepEqual([...new Set(en('Han Lu came.').actors.map(a => a.surface))], ['Han Lu']);
});

test('双闸门：x04 两闸皆过，x05/x12 卡在故事位，x09 卡在读者位', () => {
  assert.equal(reviewPiece(bundle, piece('x04'), { availableAnchors: hxAnchors() }).length, 0);
  for (const id of ['x05', 'x12']) {
    const blockers = codes(reviewPiece(bundle, piece(id), { availableAnchors: hxAnchors() }), severity.blocker);
    assert.ok(blockers.includes('PREMATURE_IDENTITY') && blockers.includes('CLOSED_ALTERNATIVE'), `${id} 应封死多解`);
  }
  const x09 = reviewPiece(bundle, piece('x09'), { availableAnchors: baAnchors() });
  const gate = x09.find(f => f.code === 'PREMATURE_IDENTITY');
  assert.equal(gate.gate, 'region');
  assert.equal(gate.settleAnchor, 'c31');
});

test('封闭解释会列出原作仍允许的候选，且能识别原文多解线索丢失', () => {
  const findings = reviewPiece(bundle, piece('x05'), { availableAnchors: hxAnchors() });
  const closed = findings.find(f => f.code === 'CLOSED_ALTERNATIVE' && f.alternatives);
  assert.ok(closed.alternatives.includes('冬澈'));
  const preserved = reviewPiece(bundle, piece('x01'), { availableAnchors: hxAnchors() });
  assert.ok(codes(preserved, severity.info).includes('CLUE_PRESERVED'));
});

test('口吻区分：职务泛称与可推断身份后的称谓保留都不算歧义违规', () => {
  const x03 = reviewPiece(bundle, piece('x03'), { availableAnchors: hxAnchors() });
  assert.ok(codes(x03, severity.info).includes('GENERIC_HANDLE'));
  const x13 = reviewPiece(bundle, piece('x13'), { availableAnchors: baAnchors() });
  assert.ok(codes(x13, severity.info).includes('GENERIC_HANDLE'));
  assert.equal(x13.some(f => f.code === 'UNRESOLVED_REVEAL'), false);
  // 身份在读者位已定论后仍用称谓：标 VOICE_HANDLE 而非歧义
  const x04 = reviewPiece(bundle, piece('x04'), { availableAnchors: new Set([...hxAnchors(), 'c31', 'c32']) });
  assert.equal(x04.filter(f => f.severity === severity.blocker).length, 0);
});

test('译注与小结：未到读者位的「已证实」口吻给警告，词干近似不触发误报', () => {
  const x10 = reviewPiece(bundle, piece('x10'), { availableAnchors: hxAnchors() });
  assert.ok(codes(x10, severity.warning).includes('UNRESOLVED_REVEAL'));
  const x11 = reviewPiece(bundle, piece('x11'), { availableAnchors: hxAnchors() });
  assert.ok(codes(x11, severity.warning).includes('UNRESOLVED_REVEAL'));
});

test('跨稿合看：单篇干净的两篇放一起可完成指认', () => {
  const hx = reviewCorpus(bundle, '河西', ['x01', 'x05'], { availableAnchors: hxAnchors() });
  assert.ok(hx.some(f => f.code === 'COMBINED_DEANON' && f.actor === '韩芦'));
  const ba = reviewCorpus(bundle, '北岸', ['x07', 'x09'], { availableAnchors: baAnchors() });
  assert.ok(ba.some(f => f.code === 'COMBINED_DEANON'));
  // 揭示已可读后合看不再构成合谋指认
  const after = reviewCorpus(bundle, '河西', ['x01', 'x04'],
    { availableAnchors: new Set([...hxAnchors(), 'c31', 'c32']) });
  assert.equal(after.some(f => f.code === 'COMBINED_DEANON'), false);
});

test('视角人物随链接锚点返回，并段稿可对应多个视角', () => {
  assert.deepEqual(viewpointsOf(bundle.chapters, ['c11', 'c12']), ['引录人', '小满']);
  assert.deepEqual(viewpointsOf(bundle.chapters, ['c33']), ['编者']);
});
