// Usage: node mrt-schema/search-mrt.js "<field or keywords>" [--doc invoice|receipt|credit|booking] [--n 12]
// Searches pms-mrt-schema.jsonl (from "FMS Print Data(DTO).xlsx") and prints Table, Field, Data Type, Description, Example.
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const doc = (flag('--doc', '') || '').toLowerCase();
const limit = +flag('--n', 12);
const q = args.join(' ').toLowerCase().trim();
if (!q) { console.log('Usage: node mrt-schema/search-mrt.js "<field or keywords>" [--doc invoice|receipt|credit|booking] [--n 12]'); process.exit(1); }
const rows = fs.readFileSync(path.join(__dirname, 'pms-mrt-schema.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const words = q.split(/[\s,]+/).filter(Boolean);
const scored = [];
for (const r of rows) {
  if (doc && !r.document.toLowerCase().includes(doc)) continue;
  const f = r.field.toLowerCase(), d = r.description.toLowerCase(), t = r.table.toLowerCase();
  let s = 0;
  if (f === q) s += 50;
  for (const w of words) { if (f.includes(w)) s += 10; if (d.includes(w)) s += 6; if (t.includes(w)) s += 2; }
  if (words.every(w => (f + ' ' + d).includes(w))) s += 8;
  if (s) scored.push([s, r]);
}
scored.sort((a, b) => b[0] - a[0]);
if (!scored.length) console.log('No field in the schema file matches "' + q + '". Do not guess a table or data type; tell the client it is not in the standard PMS schema.');
for (const [s, r] of scored.slice(0, limit)) {
  console.log(`[${r.document}${r.section ? ' / ' + r.section : ''}] Table: ${r.table} | Field: ${r.field} | Type: ${r.type || '(not given)'} | ${r.description}${r.example ? ' | e.g. ' + r.example : ''}`);
}
