// Small Freshdesk API v2 CLI client.
// Reads FRESHDESK_DOMAIN / FRESHDESK_API_KEY from .env in this directory.
//
// Usage:
//   node freshdesk-client.js get-ticket <id>
//   node freshdesk-client.js reply <id> --file <path>
//   node freshdesk-client.js note <id> --file <path>
//   node freshdesk-client.js list --updated_since <ISO date>

const fs = require('fs');
const path = require('path');
const https = require('https');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const { FRESHDESK_DOMAIN, FRESHDESK_API_KEY } = loadEnv();

function apiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: FRESHDESK_DOMAIN,
        path: urlPath,
        method,
        auth: `${FRESHDESK_API_KEY}:X`,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed;
          try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getTicket(id) {
  return apiRequest('GET', `/api/v2/tickets/${id}`);
}

async function listTickets(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiRequest('GET', `/api/v2/tickets${qs ? '?' + qs : ''}`);
}

// Freshdesk status codes: 2=Open, 3=Pending, 4=Resolved, 5=Closed (custom statuses go higher).
const STATUS_NAMES = { open: 2, pending: 3, resolved: 4, closed: 5 };

async function updateTicket(id, fields) {
  return apiRequest('PUT', `/api/v2/tickets/${id}`, fields);
}

// Freshdesk's reply/note `body` field is rendered as HTML, so plain-text newlines
// collapse unless converted. Freshdesk also strips <p> tags down to bare <div>s
// with no margin, so blank lines between paragraphs disappear visually — using
// <br><br> between blocks (instead of separate <p>/<div> elements) guarantees a
// visible blank line. A single newline within a block becomes one <br> (used for
// the "If ..." lines that should stay visually separate but not become a full gap).
// A block containing {{IMAGE:<https-url>}} is rendered as an inline <img> in the
// reply body. Freshdesk's HTML sanitizer strips data: URI image sources entirely
// (confirmed on ticket 213744 — a base64-embedded <img> came back with no src), so
// the marker value must be a real, already-public HTTPS URL — e.g. the original
// help.farvisioncloud.com image location — not a local file path.
function renderImageMarkers(str, escape) {
  const parts = str.split(/(\{\{IMAGE:[^}]+\}\})/g);
  return parts
    .map((part) => {
      const m = part.match(/^\{\{IMAGE:(.+)\}\}$/);
      if (!m) return escape(part).replace(/\n/g, '<br>');
      const url = m[1].trim();
      return `<img src="${url}" style="max-width:600px;width:100%;height:auto;" alt="screenshot">`;
    })
    .join('');
}

// A block whose every line starts with "|" is rendered as an HTML table (first row = header;
// a "|---|---|" separator row is skipped). Inline styles are used because Freshdesk strips <style>.
function renderTable(block, escape) {
  const rows = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\|[\s:\-|]+\|?$/.test(l))
    .map((l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => escape(c.trim())));
  const cell = 'border:1px solid #999;padding:4px 8px;text-align:left;vertical-align:top;';
  const head = rows[0].map((c) => `<th style="${cell}background:#eee;">${c}</th>`).join('');
  const body = rows
    .slice(1)
    .map((r) => '<tr>' + r.map((c) => `<td style="${cell}">${c}</td>`).join('') + '</tr>')
    .join('');
  return `<table style="border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function textToHtml(text) {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const b = block.trim();
      const isTable = b.split('\n').every((l) => l.trim().startsWith('|'));
      return isTable ? renderTable(b, escape) : renderImageMarkers(b, escape);
    })
    .join('<br><br>');
}

// Replies and notes are posted as the shared support agent (support@farvisionerp.com, Farvision Customer Support).
const REPLY_AS_USER_ID = Number(process.env.FRESHDESK_REPLY_AS_USER_ID || 1060027720115);

async function reply(id, body) {
  return apiRequest('POST', `/api/v2/tickets/${id}/reply`, { body, user_id: REPLY_AS_USER_ID });
}

async function addNote(id, body, isPrivate = true) {
  return apiRequest('POST', `/api/v2/tickets/${id}/notes`, { body, private: isPrivate, user_id: REPLY_AS_USER_ID });
}

// Attachments require multipart/form-data (Freshdesk rejects them on the plain JSON endpoint).
function apiRequestMultipart(method, urlPath, fields, attachmentPaths) {
  return new Promise((resolve, reject) => {
    const boundary = `----fdboundary${Date.now()}${Math.random().toString(16).slice(2)}`;
    const parts = [];
    for (const [key, value] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
    }
    for (const filePath of attachmentPaths) {
      const filename = path.basename(filePath);
      const fileData = fs.readFileSync(filePath);
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="attachments[]"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
      parts.push(fileData);
      parts.push(Buffer.from('\r\n'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const payload = Buffer.concat(parts);

    const req = https.request(
      {
        hostname: FRESHDESK_DOMAIN,
        path: urlPath,
        method,
        auth: `${FRESHDESK_API_KEY}:X`,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length,
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed;
          try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function replyWithAttachments(id, body, attachmentPaths) {
  return apiRequestMultipart('POST', `/api/v2/tickets/${id}/reply`, { body, user_id: REPLY_AS_USER_ID }, attachmentPaths);
}

async function noteWithAttachments(id, body, attachmentPaths, isPrivate = true) {
  return apiRequestMultipart('POST', `/api/v2/tickets/${id}/notes`, { body, private: isPrivate, user_id: REPLY_AS_USER_ID }, attachmentPaths);
}

module.exports = { getTicket, listTickets, reply, addNote, replyWithAttachments, noteWithAttachments, updateTicket, STATUS_NAMES };

if (require.main === module) {
  (async () => {
    const [cmd, ...rest] = process.argv.slice(2);
    try {
      if (cmd === 'get-ticket') {
        const ticket = await getTicket(rest[0]);
        console.log(JSON.stringify({
          id: ticket.id,
          subject: ticket.subject,
          description_text: ticket.description_text,
          status: ticket.status,
          priority: ticket.priority,
          requester_id: ticket.requester_id,
          tags: ticket.tags,
          group_id: ticket.group_id,
          created_at: ticket.created_at,
          attachments: (ticket.attachments || []).map((a) => ({ name: a.name, content_type: a.content_type, url: a.attachment_url })),
        }, null, 2));
      } else if (cmd === 'list') {
        const params = {};
        for (let i = 0; i < rest.length; i += 2) {
          params[rest[i].replace(/^--/, '')] = rest[i + 1];
        }
        const tickets = await listTickets(params);
        console.log(JSON.stringify(tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, tags: t.tags, created_at: t.created_at })), null, 2));
      } else if (cmd === 'reply' || cmd === 'note') {
        const id = rest[0];
        const fileIdx = rest.indexOf('--file');
        if (fileIdx === -1) throw new Error('Usage: reply|note <id> --file <path> [--attach <path> ...]');
        const body = textToHtml(fs.readFileSync(rest[fileIdx + 1], 'utf8'));
        const attachments = [];
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--attach') attachments.push(rest[i + 1]);
        }
        let result;
        if (attachments.length) {
          result = cmd === 'reply' ? await replyWithAttachments(id, body, attachments) : await noteWithAttachments(id, body, attachments);
        } else {
          result = cmd === 'reply' ? await reply(id, body) : await addNote(id, body);
        }
        console.log(`Posted ${cmd} to ticket ${id}. Response id: ${result.id}`);
      } else if (cmd === 'set-status') {
        const id = rest[0];
        const statusArg = (rest[1] || '').toLowerCase();
        const statusCode = STATUS_NAMES[statusArg] || parseInt(statusArg, 10);
        if (!statusCode) throw new Error('Usage: set-status <id> <open|pending|resolved|closed|numeric-code>');
        const result = await updateTicket(id, { status: statusCode });
        console.log(`Ticket ${id} status set to ${statusArg} (${result.status}).`);
      } else {
        console.error('Usage: node freshdesk-client.js <get-ticket|list|reply|note|set-status> ...');
        process.exit(1);
      }
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  })();
}
