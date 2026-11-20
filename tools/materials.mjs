import { readFileSync } from 'node:fs';

const groupDirectory = new URL('../data/', import.meta.url);
const contract = JSON.parse(readFileSync(new URL('contract.json', groupDirectory), 'utf8'));

function isType(value, type) {
  if (type.endsWith('?')) {
    return value === null || isType(value, type.slice(0, -1));
  }
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && !Array.isArray(value) && typeof value === 'object';
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type && (type !== 'string' || value.trim().length > 0);
}

export function readCollection(name, directory = groupDirectory) {
  if (!Object.hasOwn(contract, name)) throw new Error(`未登记的资料组 ${name}`);
  const data = JSON.parse(readFileSync(new URL(`${name}.json`, directory), 'utf8'));
  const seen = new Set();
  if (!Array.isArray(data)) throw new TypeError(`${name} 应为 JSON 数组`);
  for (const row of data) {
    if (row === null || Array.isArray(row) || typeof row !== 'object') {
      throw new TypeError(`${name} 中的记录应为 JSON 对象`);
    }
    for (const [key, type] of Object.entries(contract[name].columns)) {
      if (!Object.hasOwn(row, key) || !isType(row[key], type)) {
        throw new TypeError(`${name}/${row.id ?? '?'} 的 ${key} 应为 ${type}`);
      }
    }
    if (seen.has(row.id)) throw new Error(`${name} 中的编号 ${row.id} 重复`);
    seen.add(row.id);
  }
  return data;
}

export function readBundle(directory = groupDirectory) {
  const bundle = Object.fromEntries(Object.keys(contract).map(name => [name, readCollection(name, directory)]));
  const identifiers = Object.fromEntries(Object.entries(bundle).map(([name, data]) => [
    name, new Set(data.map(row => row.id)),
  ]));
  for (const [name, { links }] of Object.entries(contract)) {
    for (const row of bundle[name]) {
      for (const [key, target] of Object.entries(links)) {
        const values = Array.isArray(row[key]) ? row[key] : [row[key]];
        for (const value of values) {
          if (value !== null && !identifiers[target].has(value)) {
            throw new Error(`${name}/${row.id} 的 ${key} 找不到 ${target}/${value}`);
          }
        }
      }
    }
  }
  return bundle;
}
