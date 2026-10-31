// Crawls FarVision help modules (MadCap Flare "WebHelp" sites) into local JSONL knowledge base files.
// Instead of following in-page <a href> links (which misses topics only reachable via the sidebar TOC),
// this walks the site's own TOC data API: whxdata/toc.new.js is the root, and any node with a "key"
// (e.g. "toc18") has its children at whxdata/toc18.new.js, recursively, down to leaf "item" nodes
// that carry the actual topic page "url".
//
// Usage: node crawl-docs.js [moduleKey ...]   (no args = crawl all modules)

const fs = require('fs');
const path = require('path');
const https = require('https');

const MODULES = JSON.parse(fs.readFileSync(path.join(__dirname, 'modules.json'), 'utf8'));
const KB_DIR = path.join(__dirname, 'kb');
const CONCURRENCY = 6;

// This network intercepts TLS (corporate proxy) so Node's default CA store can't verify
// help.farvisioncloud.com's chain. These are public documentation pages with no
// credentials involved, so we disable verification for this crawl only.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      agent: insecureAgent,
      headers: { 'User-Agent': 'Mozilla/5.0 (FarVisionKBCrawler)' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchText(new URL(res.headers.location, url).toString()).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

function stripHtml(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? stripHtml(m[1]).slice(0, 200) : '';
}

async function fetchTocNode(base, key) {
  const fileUrl = `${base}whxdata/${key}.new.js`;
  const js = await fetchText(fileUrl);
  const m = js.match(/var toc\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) throw new Error(`Unrecognized toc format in ${fileUrl}`);
  return JSON.parse(m[1]);
}

// Walks the whole TOC tree for a module, returns a de-duped list of { name, url } topic pages.
async function collectTopicUrls(mod) {
  const results = [];
  const seenUrls = new Set();
  const seenKeys = new Set();

  function addPage(name, relUrl) {
    if (!relUrl || seenUrls.has(relUrl)) return;
    seenUrls.add(relUrl);
    results.push({ name, url: relUrl });
  }

  async function walk(key) {
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    let nodes;
    try {
      nodes = await fetchTocNode(mod.base, key);
    } catch (e) {
      console.error(`  [${mod.key}] failed to load toc node ${key}: ${e.message}`);
      return;
    }
    for (const node of nodes) {
      if (node.url) addPage(node.name, node.url);
      if (node.key) await walk(node.key);
    }
  }

  await walk('toc');
  return results;
}

async function runPool(items, worker) {
  let i = 0;
  async function next() {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
}

async function crawlModule(mod) {
  console.log(`  discovering topic pages via TOC...`);
  const topics = await collectTopicUrls(mod);
  console.log(`  found ${topics.length} topic pages in TOC`);

  const outFile = path.join(KB_DIR, `${mod.key}.jsonl`);
  const already = new Map();
  if (fs.existsSync(outFile)) {
    for (const line of fs.readFileSync(outFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        already.set(rec.url, rec);
      } catch {}
    }
  }

  let fetched = 0;
  let failed = 0;
  const records = [];

  await runPool(topics, async (topic) => {
    const absUrl = new URL(topic.url, mod.base).toString();
    if (already.has(absUrl)) {
      records.push(already.get(absUrl));
      return;
    }
    try {
      const html = await fetchText(absUrl);
      const record = {
        module: mod.key,
        url: absUrl,
        title: topic.name || extractTitle(html),
        text: stripHtml(html),
      };
      records.push(record);
      fetched++;
    } catch (e) {
      failed++;
      console.error(`  [${mod.key}] failed ${absUrl}: ${e.message}`);
    }
  });

  const stream = fs.createWriteStream(outFile);
  for (const rec of records) stream.write(JSON.stringify(rec) + '\n');
  await new Promise((resolve) => stream.end(resolve));

  return { module: mod.key, total: records.length, fetched, failed };
}

(async () => {
  const args = process.argv.slice(2);
  const targets = args.length ? MODULES.filter((m) => args.includes(m.key)) : MODULES;
  if (!fs.existsSync(KB_DIR)) fs.mkdirSync(KB_DIR, { recursive: true });

  for (const mod of targets) {
    console.log(`Crawling ${mod.name} (${mod.key})...`);
    const result = await crawlModule(mod);
    console.log(`  done: ${result.total} pages saved (${result.fetched} newly fetched, ${result.failed} failed)`);
  }
})();
