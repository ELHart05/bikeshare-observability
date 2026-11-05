/**
 * Extended scenarios 8-11, complementing the core scenarios.
 *
 *     node scripts/stack.mjs start
 *     node scripts/extended-scenarios.mjs
 *
 * <p>Each one shows something the core scenarios do not, and its goal is
 * printed next to it. The script stops and restarts the fleet, so the services
 * must have been started by `stack.mjs`.</p>
 *
 * <p>Node has no agent. The script therefore picks the TraceId itself and sends
 * it in a `traceparent` header: the service adopts it, which gives an id to
 * look up in Jaeger and in the logs.</p>
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  LOGS_DIR, RENTALS_URL, SERVICES, SUBSCRIBER_EMAIL, SUBSCRIBER_PASSWORD,
  isPortInUse, requireServices, sleep, startBackground, stopBackground,
} from './lib.mjs';

await requireServices();

const traces = {};

/** A request under a TraceId known in advance. */
async function tracedRequest(route, { method = 'GET', body } = {}) {
  const trace = randomBytes(16).toString('hex');
  const start = performance.now();
  const r = await fetch(`${RENTALS_URL}${route}`, {
    method,
    headers: {
      traceparent: `00-${trace}-${randomBytes(8).toString('hex')}-01`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const response = await r.text();
  return { trace, status: r.status, ms: performance.now() - start, response };
}

function report(label, slug, { status, ms, trace }, goal) {
  console.log(`${label.padEnd(34)}${String(status).padEnd(6)}${ms.toFixed(0).padStart(6)} ms  ${trace}`);
  console.log(`    goal: ${goal}`);
  traces[slug] = trace;
}

/** Duration of the consolidation span of a trace, read back from Jaeger. */
async function consolidationDuration(trace) {
  await sleep(2500);
  const body = await (await fetch(`http://localhost:16686/api/v3/traces/${trace}`)).json();
  for (const rs of body.result.resourceSpans) {
    for (const ss of rs.scopeSpans) {
      const span = ss.spans.find((s) => s.name === 'fleet.consolidation');
      if (span) return Number(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / 1e6;
    }
  }
  return NaN;
}

console.log('scenario                          status  time   trace');
console.log('-'.repeat(92));

//  The core scenarios cover 409, 503 and 401. The fourth failure kind is missing.
report(
  '8. unknown station',
  'unknown-station',
  await tracedRequest('/rentals', {
    method: 'POST',
    body: { stationCode: 'ST-NOWHERE', email: SUBSCRIBER_EMAIL, password: SUBSCRIBER_PASSWORD },
  }),
  'the fourth failure kind: a 404 decided by the fleet, visible in both logs and on fleet.pickup',
);

//  The path nobody plays: validation fails before the service.
report(
  '9. invalid request',
  'invalid-request',
  await tracedRequest('/rentals', {
    method: 'POST',
    body: { stationCode: 'ST-COMEDIE', email: `${SUBSCRIBER_EMAIL} `, password: '  ' },
  }),
  'a 400 that never reaches the service: the agent span shows it, and the privacy sentinel proves Spring no longer logs the rejected value',
);
await tracedRequest('/rentals', {
  method: 'POST',
  body: `{"stationCode":"ST-COMEDIE","email":"${SUBSCRIBER_EMAIL}","password":"${SUBSCRIBER_PASSWORD}"`,
});

//  The same 503 as scenario 4, for a completely different reason.
await stopBackground('fleet');
if (await isPortInUse(SERVICES.fleet.port)) {
  console.error('the fleet is still running: start the services with "node scripts/stack.mjs start"');
  process.exit(1);
}
report(
  '10. fleet down',
  'fleet-down',
  await tracedRequest('/rentals', {
    method: 'POST',
    body: { stationCode: 'ST-COMEDIE', email: SUBSCRIBER_EMAIL, password: SUBSCRIBER_PASSWORD },
  }),
  'the same 503 as scenario 4: only the reason (fleet_unreachable) and the missing fleet span tell them apart',
);
await startBackground('fleet');

//  An experiment: change one parameter only, and see what moves.
const opened = await tracedRequest('/rentals', {
  method: 'POST',
  body: { stationCode: 'ST-MOSSON', email: SUBSCRIBER_EMAIL, password: SUBSCRIBER_PASSWORD },
});
if (opened.status !== 201) {
  console.error(`rental refused (${opened.status}): ${opened.response}`);
  process.exit(1);
}
const { reference } = JSON.parse(opened.response);
const warmReport = async () => {
  await tracedRequest(`/rentals/${reference}/report`);
  return tracedRequest(`/rentals/${reference}/report`);
};
const baseline = await warmReport();
await stopBackground('fleet');
await startBackground('fleet', ['-Dfleet.consolidation-ms=1200']);
const slowed = await warmReport();
report(
  '11. slow consolidation (1200 ms)',
  'slow-consolidation',
  slowed,
  'control experiment: if only fleet.consolidation grows, the cause is proven',
);
traces['slow-consolidation-baseline'] = baseline.trace;
console.log(
  `    consolidation: ${(await consolidationDuration(baseline.trace)).toFixed(1)} ms for 500 requested ` +
    `(request ${baseline.ms.toFixed(0)} ms), ${(await consolidationDuration(slowed.trace)).toFixed(1)} ms ` +
    `for 1200 requested (request ${slowed.ms.toFixed(0)} ms)`,
);
await stopBackground('fleet');
await startBackground('fleet');

await fs.writeFile(
  path.join(LOGS_DIR, 'extended-scenarios.json'),
  JSON.stringify(traces, null, 2),
);
