// npm run loyverse:matches -- [--date YYYY-MM-DD] [--all]
// Terminal-only wildcard-match report (Step loyverse-preview-iii). Calls the
// SAME engine function as GET /api/loyverse/preview, then prints
// server/engines/loyverseReport.js's text. Writes nothing.
// Exit 1 if an account failed (or the date is invalid), else 0.

const fs = require('fs');
const path = require('path');
const { computePreview, businessDate } = require('../server/engines/loyversePreview.js');
const { formatReport } = require('../server/engines/loyverseReport.js');

const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--date');
  const date = i >= 0 ? args[i + 1] : businessDate(new Date());
  const preview = await computePreview({ date });
  process.stdout.write(formatReport(preview, { all: args.includes('--all') }));
  return preview.accounts.every(a => a.ok) ? 0 : 1;
}

main().then(code => { process.exitCode = code; }, err => {
  console.error(`loyverse:matches failed: ${err.message}`);
  process.exitCode = 1;
});
