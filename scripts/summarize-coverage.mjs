import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf8'));
const sum = { lines: [0, 0], statements: [0, 0], functions: [0, 0], branches: [0, 0] };
for (const item of Object.values(data)) {
  for (const [key, map] of [['statements', item.s], ['functions', item.f], ['branches', item.b]]) {
    const values = Object.values(map ?? {}).flat();
    sum[key][1] += values.length;
    sum[key][0] += values.filter((value) => value > 0).length;
  }
  const lineHits = new Map();
  for (const [id, count] of Object.entries(item.s ?? {})) {
    const line = item.statementMap?.[id]?.start?.line;
    if (line !== undefined) lineHits.set(line, Math.max(lineHits.get(line) ?? 0, count));
  }
  sum.lines[1] += lineHits.size;
  sum.lines[0] += [...lineHits.values()].filter((value) => value > 0).length;
}
for (const [key, [covered, total]] of Object.entries(sum)) {
  console.log(`${key}: ${covered}/${total} (${total ? (covered / total * 100).toFixed(2) : '0.00'}%)`);
}
