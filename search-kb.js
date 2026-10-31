// Keyword (BM25-style) search over the local FarVision help knowledge base.
// Usage: node search-kb.js "<query text>" [topN]

const fs = require('fs');
const path = require('path');

const KB_DIR = path.join(__dirname, 'kb');
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;

const STOPWORDS = new Set('a an the of to in on for and or is are be will can how do does what where when which this that i we you it not able unable issue problem'.split(' '));

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function chunkText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
    if (i + CHUNK_SIZE >= text.length) break;
  }
  return chunks.length ? chunks : [text];
}

function loadCorpus() {
  const chunks = [];
  for (const file of fs.readdirSync(KB_DIR)) {
    if (!file.endsWith('.jsonl')) continue;
    const lines = fs.readFileSync(path.join(KB_DIR, file), 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      for (const chunk of chunkText(rec.text)) {
        chunks.push({ module: rec.module, url: rec.url, title: rec.title, text: chunk });
      }
    }
  }
  return chunks;
}

function bm25Score(queryTerms, docTerms, docFreq, avgLen, N, k1 = 1.5, b = 0.75) {
  const termCounts = {};
  for (const t of docTerms) termCounts[t] = (termCounts[t] || 0) + 1;
  let score = 0;
  for (const term of queryTerms) {
    const tf = termCounts[term] || 0;
    if (!tf) continue;
    const df = docFreq.get(term) || 0;
    if (!df) continue;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docTerms.length / avgLen)));
  }
  return score;
}

function search(query, topN = 8) {
  const corpus = loadCorpus();
  const queryTerms = [...new Set(tokenize(query))];
  const docTermsList = corpus.map((c) => tokenize(`${c.title} ${c.text}`));
  const docFreq = new Map();
  for (const terms of docTermsList) {
    for (const t of new Set(terms)) docFreq.set(t, (docFreq.get(t) || 0) + 1);
  }
  const avgLen = docTermsList.reduce((s, t) => s + t.length, 0) / (docTermsList.length || 1);
  const N = corpus.length;

  const scored = corpus.map((c, i) => ({
    ...c,
    score: bm25Score(queryTerms, docTermsList[i], docFreq, avgLen, N),
  }));

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

module.exports = { search };

if (require.main === module) {
  const query = process.argv[2];
  const topN = parseInt(process.argv[3] || '8', 10);
  if (!query) {
    console.error('Usage: node search-kb.js "<query text>" [topN]');
    process.exit(1);
  }
  const results = search(query, topN);
  for (const r of results) {
    console.log(`\n[${r.score.toFixed(2)}] ${r.title}  (${r.module})`);
    console.log(r.url);
    console.log(r.text.slice(0, 300).replace(/\s+/g, ' ') + '...');
  }
}
