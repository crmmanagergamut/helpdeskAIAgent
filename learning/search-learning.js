#!/usr/bin/env node
// Search the distilled ticket lessons. Usage: node learning/search-learning.js "<query>" [N]
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync(__dirname).filter((f) => /^ticket-learnings.*.jsonl$/.test(f)).map((f) => path.join(__dirname, f));
const query = (process.argv[2] || '').toLowerCase();
const limit = +process.argv[3] || 5;
const ALL = process.argv.includes('--all'); // default: reviewed lessons only
if (!query) { console.log('usage: node learning/search-learning.js "<query>" [N]'); process.exit(0); }
if (!files.length) { console.log('no lessons yet'); process.exit(0); }
const words = query.split(/\W+/).filter((w) => w.length > 2);
const all = files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const rows = ALL ? all : all.filter((r) => r.review === 'reviewed');
const scored = rows.map((r) => {
  const hay = [r.module, r.topic, r.symptom, r.cause, r.fix, (r.keywords || []).join(' ')].join(' ').toLowerCase();
  let s = 0;
  for (const w of words) if (hay.includes(w)) s += (r.topic || '').toLowerCase().includes(w) ? 3 : 1;
  return { r, s: s * (r.confidence === 'high' ? 1.3 : r.confidence === 'low' ? 0.7 : 1) };
}).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit);
for (const { r, s } of scored) {
  console.log(`\n[${s.toFixed(1)}] ${r.module} | ${r.topic}  (${r.review === 'reviewed' ? 'REVIEWED' : 'UNREVIEWED'}, confidence: ${r.confidence}, seen in ${r.ticket_count} tickets${r.internal_only ? ', INTERNAL ONLY - never offer as steps to a customer' : ''})`);
  console.log('  Symptom:', r.symptom);
  console.log('  Cause  :', r.cause);
  console.log('  Fix    :', r.fix);
  if (r.help_page) console.log('  Help page:', r.help_page);
}
if (!scored.length) console.log('no matching ' + (ALL ? '' : 'reviewed ') + 'lessons' + (ALL ? '' : ' (add --all to include unreviewed)'));
