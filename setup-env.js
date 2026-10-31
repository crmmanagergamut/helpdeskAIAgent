// Creates .env from the FRESHDESK_DOMAIN and FRESHDESK_API_KEY environment variables
// (for cloud sessions where the credentials are set as secrets). Never overwrites an existing .env.
const fs = require('fs');
const { FRESHDESK_DOMAIN, FRESHDESK_API_KEY } = process.env;
if (fs.existsSync('.env')) {
  console.log('.env already exists, left unchanged');
} else if (!FRESHDESK_DOMAIN || !FRESHDESK_API_KEY) {
  console.error('Set FRESHDESK_DOMAIN and FRESHDESK_API_KEY as environment variables first');
  process.exit(1);
} else {
  fs.writeFileSync('.env', `FRESHDESK_DOMAIN=${FRESHDESK_DOMAIN}\nFRESHDESK_API_KEY=${FRESHDESK_API_KEY}\n`);
  console.log('.env created');
}
