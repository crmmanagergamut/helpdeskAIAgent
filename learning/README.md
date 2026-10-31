# Ticket learning layer (pilot)

A separate, removable knowledge layer distilled from past resolved Freshdesk tickets. It sits next to the
help-page knowledge base (`../kb/`) and never modifies it.

Pilot scope: modules **Payroll** and **Sales and Customer Care, Portal and App**, tickets created
2025-10-01 to 2026-10-10 that ended Resolved or Closed.

## Files
| File | What it is | Committed? |
|---|---|---|
| `collect.js` | Reads tickets from Freshdesk into `raw/` | yes |
| `raw/`, `index.jsonl`, `state.json` | Raw tickets (contain customer data) | **never** (git-ignored) |
| `ticket-learnings.jsonl` | Distilled lessons, no customer data | optional |
| `search-learning.js` | Searches the lessons: `node learning/search-learning.js "<query>" 5` | yes |

## Using it
Lessons are *precedent from past tickets*, not documented fact. A draft that relies on one must say so and
still hedge anything the help pages do not confirm.

## Removing it completely
1. Delete this `learning/` folder.
2. That is all: `search-kb.js`, `kb/` and `freshdesk-client.js` do not depend on it.
