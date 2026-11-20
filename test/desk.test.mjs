import assert from 'node:assert/strict';
import test from 'node:test';
import { readBundle } from '../tools/materials.mjs';
import { approveRevision, compareRegionalWordings, editorialTrail } from '../tools/desk.mjs';

const bundle = readBundle();
const NOW = '2026-11-20T18:00:00+08:00';

test('批准修订：剧透稿与跨区稿被拒，安全稿通过并保留口吻说明', () => {
  assert.equal(approveRevision(bundle, '河西', 'x05', NOW).approved, false);
  assert.equal(approveRevision(bundle, '河西', 'x12', NOW).approved, false);
  const north = approveRevision(bundle, '北岸', 'x09', NOW);
  assert.equal(north.approved, false);
  assert.ok(north.reasons.some(r => r.includes('c31')));
  const generic = approveRevision(bundle, '北岸', 'x13', NOW);
  assert.equal(generic.approved, true);
  assert.equal(generic.withWarnings, false);
  const warned = approveRevision(bundle, '河西', 'x10', NOW);
  assert.equal(warned.approved, true);
  assert.equal(warned.withWarnings, true);
});

test('跨区不得发行他区稿件', () => {
  const result = approveRevision(bundle, '北岸', 'x01', NOW);
  assert.equal(result.approved, false);
  assert.ok(result.reasons[0].includes('不能在 北岸 发行'));
});

test('同锚点跨区词形对照：编辑可见各区词形、线索标记与曝光历史', () => {
  const rows = compareRegionalWordings(bundle, 'c11', NOW);
  const hx = rows.find(r => r.region === '河西');
  const ba = rows.find(r => r.region === '北岸');
  const hxBodies = hx.wordings.map(w => w.pieceId);
  assert.ok(hxBodies.includes('x01') && hxBodies.includes('x05'));
  const revision = hx.wordings.find(w => w.pieceId === 'x05');
  assert.ok(revision.flags.some(f => f.code === 'PREMATURE_IDENTITY'));
  assert.equal(ba.wordings.some(w => w.pieceId === 'x06'), true);
  // 河西读者实际见过 x01，没见过待批的 x05
  const visibleOne = hx.wordings.find(w => w.pieceId === 'x01');
  assert.equal(visibleOne.everVisible, true);
  assert.equal(revision.everVisible, false);
});

test('编辑意见按时间回放并挂接相关稿件', () => {
  const trail = editorialTrail(bundle, '河西');
  assert.deepEqual(trail.map(n => n.noteId), ['a01', 'a02']);
  assert.deepEqual(trail[1].related, ['x04', 'x10']);
  assert.deepEqual(editorialTrail(bundle, '北岸').map(n => n.noteId), ['a03']);
});
