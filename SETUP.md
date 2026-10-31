# Run the agent from a cloud session or another machine

1. Open this repo as a Claude Code session (cloud session on the web, or `claude` in a clone on another machine).
2. Credentials (never in the repo):
   - Cloud: add environment secrets `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY` to the cloud environment,
     then run `node setup-env.js` in the session to create `.env`.
   - Local clone: copy `.env.example` to `.env` and fill it in.
3. Check the connection: `node _co.js <any ticket id>` should print a requester and company.
4. Send a ticket ID. The agent follows `CLAUDE.md`.

The cloud environment must be able to reach the Freshdesk domain. If it uses a restricted network, allow that host.
Replies post as support@farvisionerp.com. If the API key is ever committed by mistake, rotate it in Freshdesk.
`CLAUDE.md` holds the operator's standing rules; update it when a rule changes.
