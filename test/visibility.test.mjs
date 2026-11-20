import assert from 'node:assert/strict';
import test from 'node:test';
import { readBundle } from '../tools/materials.mjs';
import {
  visibleTranslations, availableAnchorsFor, visibilityTimeline,
  visibilityWindows, wasEverVisible, evaluateAllPrerequisites, withdrawalCascade,
} from '../tools/visibility.mjs';

const bundle = readBundle();
const NOW = '2026-11-20T18:00:00+08:00';

test('晚记录覆盖可见状态：撤下后当前目录不再包含，但历史窗口保留', () => {
  const visible = visibleTranslations(bundle, '河西', NOW);
  assert.ok(visible.includes('x04') === false);
  assert.deepEqual(visible, ['x01', 'x02', 'x03', 'x11']);
  assert.equal(wasEverVisible(bundle, '河西', 'x04'), true);
  assert.deepEqual(visibilityWindows(bundle, '河西', 'x04'), [
    { from: '2026-11-18T08:00:00+08:00', to: '2026-11-20T11:00:00+08:00', issueId: 'i8' },
  ]);
  // 撤下前的时刻回放，x04 仍在
  assert.deepEqual(visibleTranslations(bundle, '河西', '2026-11-18T20:00:00+08:00'),
    ['x01', 'x02', 'x03', 'x04']);
});

test('可读锚点随已发译稿 links 汇总，撤下揭示章节后锚点同步收回', () => {
  const hx = availableAnchorsFor(bundle, '河西', NOW);
  for (const anchor of ['c11', 'c12', 'c13', 'c21', 'c22']) assert.ok(hx.has(anchor));
  assert.equal(hx.has('c31'), false);
  const before = availableAnchorsFor(bundle, '河西', '2026-11-18T20:00:00+08:00');
  assert.ok(before.has('c31') && before.has('c32'));
});

test('前置评估：编辑中缺锚点报阻塞，已发缺口作为历史事实照样报出', () => {
  const reports = new Map(evaluateAllPrerequisites(bundle, '河西', NOW).map(r => [r.issueId, r]));
  assert.equal(reports.get('i6').ok, false);
  assert.deepEqual(reports.get('i6').missing, ['c31']);
  assert.equal(reports.get('i7').ok, false, 'i7 发出时 c31 已可读，撤下后当前评估暴露缺口');
  assert.equal(reports.get('i1').ok, true);
  const north = new Map(evaluateAllPrerequisites(bundle, '北岸', NOW).map(r => [r.issueId, r]));
  assert.deepEqual(north.get('i5').missing, ['c31']);
});

test('撤下回退级联：未发附注降待审，已发内容标已知情，修订链暂停', () => {
  const cascade = withdrawalCascade(bundle, '河西', 'i8', NOW);
  assert.deepEqual(cascade.withdrawnReveal, ['c31']);
  assert.deepEqual(cascade.pending.map(p => p.issueId), ['i6']);
  assert.deepEqual(cascade.exposed.map(p => p.issueId), ['i7']);
  const exposed = cascade.exposed[0];
  assert.deepEqual(exposed.translationIds, ['x11']);
  assert.ok(exposed.everVisibleWindows.x11[0].from === '2026-11-19T12:00:00+08:00');
  // 不依赖 c31 的编辑中发行不受影响
  assert.equal(cascade.pending.some(p => p.issueId === 'i9'), false);
});

test('时间线严格按日志时间排序，未来时刻记录不提前生效', () => {
  const timeline = visibilityTimeline(bundle, '河西', '2026-11-15T00:00:00+08:00');
  assert.deepEqual(timeline.map(e => e.issueId), ['i1']);
  const full = visibilityTimeline(bundle, '河西', NOW);
  const times = full.map(e => Date.parse(e.at));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('地区隔离：北岸读者看不到河西稿件', () => {
  const north = visibleTranslations(bundle, '北岸', NOW);
  assert.deepEqual(north, ['x06', 'x07']);
  assert.equal(wasEverVisible(bundle, '北岸', 'x04'), false);
});
