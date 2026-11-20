import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readBundle, readCollection } from '../tools/materials.mjs';

test('接件资料包含原文和原始记录', () => {
  const bundle = readBundle();
  const excerpts = [["chapters", "c31", "韩芦"], ["editorial", "a02", "撤回重审"], ["translations", "x07", "El ayudante"], ["issues", "i4", "来信一回"]];
  for (const [group, id, phrase] of excerpts) {
    const entry = bundle[group].find(row => row.id === id);
    assert.ok(entry, `${group}/${id} 缺少来件`);
    if (phrase) assert.ok(Object.values(entry).some(value => typeof value === 'string' && value.includes(phrase)), `${group}/${id} 的源文字缺少约定片段`);
  }
});

test('拒绝缺少正式字段的接件', t => {
  const directory = mkdtempSync(join(tmpdir(), 'serial-translation-desk-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'chapters.json'), JSON.stringify([{ id: 'bad' }]));
  assert.throws(() => readCollection('chapters', pathToFileURL(directory + sep)), TypeError);
});

test('地区发行只包含同区稿件，原文各回行次唯一', () => {
  const { translations, chapters, issues } = readBundle();
  const order = chapters.map(row => [row.chapter, row.order].join('.'));
  assert.equal(new Set(order).size, order.length);
  for (const issue of issues) {
    for (const id of issue.translations) {
      assert.equal(translations.find(entry => entry.id === id).region, issue.region);
    }
  }
});
