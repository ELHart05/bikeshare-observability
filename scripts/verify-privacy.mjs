/**
 * Privacy sentinel.
 *
 * <p>The web UI and the scenarios <b>deliberately</b> send a password and a
 * full email address. This tool checks that they come out of <b>no</b> output:</p>
 *
 * <ul>
 *   <li>the log files under the directory it is given;</li>
 *   <li>the spans stored by Jaeger, so everything that went through the
 *       Collector, browser telemetry included.</li>
 * </ul>
 *
 *     node scripts/verify-privacy.mjs
 *     node scripts/verify-privacy.mjs --logs my-logs
 *     node scripts/verify-privacy.mjs --jaeger http://localhost:16686
 *
 * <p>The address <b>domain</b> is allowed: it answers the question without
 * singling anyone out. The tool counts it without flagging it.</p>
 *
 * <p>This is the one check that must fail loudly: a secret in telemetry is an
 * incident.</p>
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  FORBIDDEN_FIELDS, JAEGER_URL, PASSWORD_FRAGMENT, SUBSCRIBER_DOMAIN, SUBSCRIBER_EMAIL,
  SUBSCRIBER_PASSWORD, countOccurrences,
} from './lib.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const logsDir = option('--logs', 'logs');
const jaeger = option('--jaeger', JAEGER_URL);

const EXTENSIONS = ['.txt', '.log', '.json', '.jsonl', '.ndjson', '.out'];
const isoOffset = (minutes) =>
  new Date(Date.now() + minutes * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');

/**
 * Counts, in a text, everything that must not be there.
 *
 * <p>Three markers are detected:</p>
 * <ul>
 *   <li>the WHOLE password;</li>
 *   <li>a FRAGMENT of the password, because a framework may have truncated
 *       it. Spring Web, for instance, cuts what it prints of a request body at
 *       DEBUG to about a hundred characters;</li>
 *   <li>a FORBIDDEN field name, because a line containing "password" logged a
 *       whole object without looking at what it carried.</li>
 * </ul>
 *
 * <p>The full address is counted separately.
 * The domain alone is counted too, but it is allowed.</p>
 */
function inspect(text) {
  const fields = FORBIDDEN_FIELDS.reduce((t, f) => t + countOccurrences(text, f), 0);
  return {
    password: countOccurrences(text, SUBSCRIBER_PASSWORD),
    fragment: countOccurrences(text, PASSWORD_FRAGMENT),
    fields,
    address: countOccurrences(text, SUBSCRIBER_EMAIL),
    domain: countOccurrences(text, SUBSCRIBER_DOMAIN),
  };
}

/** What counts as a leak. The fragment covers the whole password. */
const leaksIn = (c) => c.fragment + c.fields + c.address;

const line = (what, c) =>
  `  ${what.padEnd(40)} password=${c.password}  fragment=${c.fragment}  ` +
  `field=${c.fields}  address=${c.address}  domain_only=${c.domain}`;

let leaks = 0;
let inspected = 0;

/** All text files under a directory, recursively. */
async function textFiles(root) {
  const found = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'target') await walk(full);
      } else if (EXTENSIONS.includes(path.extname(e.name).toLowerCase())) {
        found.push(full);
      }
    }
  }
  await walk(root);
  return found.sort();
}

console.log(`=== 1. log files under "${logsDir}" ===`);
const files = await textFiles(logsDir);
if (!files.length) {
  console.log('  (no text file found: write the logs to disk, or');
  console.log('   point to the right directory with --logs <dir>)');
}
for (const f of files) {
  const counts = inspect(await fs.readFile(f, 'utf8'));
  //  Relative path while it stays readable, absolute otherwise.
  const relative = path.relative('.', f);
  console.log(line(relative.startsWith('..') ? f : relative, counts));
  leaks += leaksIn(counts);
  inspected += 1;
}

console.log('');
console.log('=== 2. spans stored by Jaeger ===');
let services = [];
try {
  const r = await fetch(`${jaeger}/api/v3/services`, { signal: AbortSignal.timeout(5000) });
  services = (await r.json()).services ?? [];
} catch {
  console.log(`  (Jaeger unreachable at ${jaeger}: check limited to files)`);
}

for (const svc of services) {
  if (svc === 'jaeger') continue;
  //  Inspect the RAW response, not selected fields: a secret can hide in an
  //  attribute nobody thought of reading.
  const url =
    `${jaeger}/api/v3/traces?query.service_name=${encodeURIComponent(svc)}` +
    `&query.num_traces=100&query.start_time_min=${isoOffset(-180)}` +
    `&query.start_time_max=${isoOffset(5)}`;
  let raw = '';
  try {
    raw = await (await fetch(url, { signal: AbortSignal.timeout(10000) })).text();
  } catch {
    console.log(`  (service "${svc}" unreadable)`);
    continue;
  }
  const counts = inspect(raw);
  console.log(line(`service "${svc}"`, counts));
  leaks += leaksIn(counts);
  inspected += 1;
}

console.log('');
if (inspected === 0) {
  console.log('NO SOURCE INSPECTED: this result proves nothing.');
  console.log('Produce some logs, start Jaeger, then run again.');
  process.exit(2);
}
if (leaks > 0) {
  console.log(`FAIL: ${leaks} occurrence(s) of sensitive data in the telemetry.`);
  console.log('A password or a full address in a log or a span is an incident.');
  console.log('Find the offending line and remove it.');
  process.exit(1);
}
console.log(`OK: ${inspected} source(s) inspected. No password, not even`);
console.log('    truncated, no forbidden field name, no full address.');
console.log('    Only the domain remains, as intended.');
