import assert from 'node:assert/strict';
import test from 'node:test';
import { readBundle } from '../tools/materials.mjs';
import { readerCatalog, assertNoEditorLeak, editorialDeskView, catalogSummary } from '../tools/catalog.mjs';
import { replay } from '../tools/replay.mjs';

const bundle = readBundle();
const NOW = '2026-11-20T18:00:00+08:00';

test('读者目录只含当前可见译稿，且 editorOnly 释义绝不外泄', () => {
  const catalog = readerCatalog(bundle, '河西', NOW);
  assert.deepEqual(catalog.readerVisible, ['x01', 'x02', 'x03', 'x11']);
  const leak = assertNoEditorLeak(bundle, '河西', NOW);
  assert.equal(leak.ok, true);
  assert.equal(assertNoEditorLeak(bundle, '北岸', NOW).ok, true);
  const payload = JSON.stringify(catalog);
  assert.equal(payload.includes('两名值夜者'), false);
  assert.equal(payload.includes('知歌且当晚在册上'), false);
});

test('编辑侧视图分层保留 editorOnly 事实与曝光窗口', () => {
  const desk = editorialDeskView(bundle, '河西', NOW);
  const facts = new Map(desk.editorFacts.map(f => [f.actor, f]));
  assert.ok(facts.get('韩芦').editorOnly.includes('第三回信件'));
  assert.equal(facts.get('冬澈').visibleAfter, null);
  const x04 = desk.exposure.find(e => e.pieceId === 'x04');
  assert.ok(x04 && x04.windows[0].to === '2026-11-20T11:00:00+08:00');
});

test('目录统计按阻塞/警告/信息分级', () => {
  const summary = catalogSummary(bundle, '河西', NOW);
  assert.equal(summary.allSafe, true);
  assert.ok(summary.warning > 0);
  assert.ok(summary.info > 0);
});

test('回放重放实际可见顺序：每一步带争议译法，撤下事件留在时间线上', () => {
  const report = replay(bundle, '河西', NOW);
  assert.deepEqual(report.steps.map(s => s.issueId), ['i1', 'i3', 'i4', 'i6', 'i7', 'i8', 'i9']);
  const withdrawStep = report.steps.find(s => s.issueId === 'i8');
  assert.equal(withdrawStep.state, '撤下');
  assert.deepEqual(withdrawStep.visibleAfterStep, ['x01', 'x02', 'x03', 'x11']);
  // 仍须校改范围只列阻塞与警告，且排除已撤下的 x04
  const ids = report.outstanding.map(o => o.pieceId);
  assert.ok(ids.includes('x05') && ids.includes('x12') && ids.includes('x10') && ids.includes('x11'));
  assert.equal(ids.includes('x04'), false);
});

test('历史时刻回放：i4 发行当下 x04 对读者安全可见', () => {
  const report = replay(bundle, '河西', '2026-11-18T20:00:00+08:00');
  const last = report.steps.at(-1);
  assert.ok(last.visibleAfterStep.includes('x04'));
  const x04 = last.disputes.find(d => d.pieceId === 'x04');
  assert.equal(x04.findings.some(f => f.severity === 'blocker'), false);
});

test('前置报告随回放一并给出，缺口不做事后美化', () => {
  const report = replay(bundle, '河西', NOW);
  const i7 = report.prerequisiteReports.find(r => r.issueId === 'i7');
  assert.equal(i7.ok, false);
  assert.deepEqual(i7.missing, ['c31']);
});
