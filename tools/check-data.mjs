import { readBundle } from './materials.mjs';

try {
  const collections = readBundle();
  for (const [name, entries] of Object.entries(collections)) {
    console.log(`${name}  ${entries.length} 条记录`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
