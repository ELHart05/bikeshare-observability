/**
 * Replays everything from a clean state and files the evidence.
 *
 *     cd frontend && npm start                 (in another terminal)
 *     node scripts/capture-evidence.mjs
 *
 * <p>Allow about ten minutes, two of them waiting for a rental to last long
 * enough to cost more than the minimum. Every id and duration in `evidence/`
 * comes from a single run of this script.</p>
 *
 * <p>The databases are in memory, and so is Jaeger: the stack is recreated first.</p>
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  LOGS_DIR, RENTALS_URL, ROOT, SUBSCRIBER_EMAIL, SUBSCRIBER_PASSWORD,
  sleep, startBackground, stopBackground,
} from './lib.mjs';

const EVIDENCE_DIR = path.join(ROOT, 'evidence');
const COMPOSE = ['-f', 'observability/docker-compose.yml'];
const SPOON_JAR = path.join(ROOT, 'tools/spoon-instrumenter/target/fleet-instrumented/target/fleet.jar');

/** Runs a command, shows its output, and keeps it in a file when one is given. */
function run(file, command, ...args) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const r = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  const output = r.stdout + r.stderr;
  console.log(output.trimEnd());
  if (file) writeFileSync(path.join(EVIDENCE_DIR, file), output);
  if (r.status !== 0) throw new Error(`${command} failed (${r.status})`);
  return output;
}

const write = (file, text) => {
  writeFileSync(path.join(EVIDENCE_DIR, file), text);
  console.log(text);
};

async function freshStack() {
  await stopBackground('rentals');
  await stopBackground('fleet');
  await startBackground('fleet');
  await startBackground('rentals');
}

/** A request under a TraceId chosen here, so it can be read back later. */
async function tracedRequest(route, method = 'GET', body) {
  const trace = randomBytes(16).toString('hex');
  const r = await fetch(`${RENTALS_URL}${route}`, {
    method,
    headers: {
      traceparent: `00-${trace}-${randomBytes(8).toString('hex')}-01`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { trace, status: r.status, body: await r.json() };
}

/** All spans of a trace, flattened, durations in milliseconds. */
async function spans(trace) {
  const body = await (await fetch(`http://localhost:16686/api/v3/traces/${trace}`)).json();
  return body.result.resourceSpans.flatMap((rs) =>
    rs.scopeSpans.flatMap((ss) =>
      ss.spans.map((s) => ({
        ...s,
        tracer: ss.scope.name,
        service: rs.resource.attributes.find((a) => a.key === 'service.name').value.stringValue,
        ms: Number(BigInt(s.endTimeUnixNano) - BigInt(s.startTimeUnixNano)) / 1e6,
      })),
    ),
  );
}

/** Splits a report into slices that add up: each one has a single explanation. */
async function latencyBreakdown(title, trace) {
  const list = await spans(trace);
  const one = (name) => list.find((s) => s.name === name);
  const action = one('action.view_report');
  const fetchSpan = list.find((s) => s.tracer.includes('fetch'));
  const entry = one('GET /rentals/{reference}/report');
  const call = list.find((s) => s.tracer.includes('java-http-client'));
  const fleet = one('GET /stations/{code}/turnover-index');
  const consolidation = one('fleet.consolidation');
  const sql = (service) => list.filter((s) => s.tracer.includes('jdbc') && s.service === service)
    .reduce((t, s) => t + s.ms, 0);
  const rows = [
    ['fleet.consolidation (fleet service layer)', consolidation.ms],
    ['rest of fleet: SQL, Hibernate, Spring, HTTP', fleet.ms - consolidation.ms],
    ['rentals -> fleet call, outside fleet', call.ms - fleet.ms],
    ['rentals, outside the fleet call', entry.ms - call.ms],
    ['browser -> rentals call, outside server', fetchSpan.ms - entry.ms],
    ['browser, outside the call', action.ms - fetchSpan.ms],
  ];
  const total = action.ms;
  return [
    `${title}  trace ${trace}`,
    ...rows.map(([what, ms]) =>
      `  ${what.padEnd(48)} ${ms.toFixed(1).padStart(8)} ms ${((100 * ms) / total).toFixed(1).padStart(6)} %`),
    `  ${'total, action.view_report'.padEnd(48)} ${total.toFixed(1).padStart(8)} ms  100.0 %`,
    `  of which SQL: fleet ${sql('fleet').toFixed(1)} ms, rentals ${sql('rentals').toFixed(1)} ms`,
    '',
  ].join('\n');
}

/** Rentals by station, read from the structured log: no regex, just fields. */
function rentalsByStation() {
  const lines = readFileSync(path.join(LOGS_DIR, 'rentals.log'), 'utf8')
    .split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
  const stations = new Map();
  const of = (code) => {
    if (!stations.has(code)) stations.set(code, { opened: 0, closed: 0, amount: 0 });
    return stations.get(code);
  };
  for (const l of lines) {
    if (l.message === 'rental.opened') of(l.bikeshare.rental.start_station).opened += 1;
    if (l.message === 'rental.closed') {
      const s = of(l.bikeshare.rental.start_station);
      s.closed += 1;
      s.amount += l.bikeshare.rental.amount_eur;
    }
  }
  const table = [...stations].sort().map(([code, s]) =>
    `  ${code.padEnd(12)} opened ${String(s.opened).padStart(3)}   closed ` +
    `${String(s.closed).padStart(3)}   amount ${s.amount.toFixed(2).padStart(7)} EUR`);
  const reasons = new Map();
  for (const l of lines.filter((x) => x.bikeshare?.rental?.failure)) {
    const r = l.bikeshare.rental.failure.reason;
    reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }
  return [
    'From logs/rentals.log, events rental.opened and rental.closed:',
    ...table,
    '',
    'Failures, by reason (rental.open_failed and rental.return_failed):',
    ...[...reasons].sort().map(([r, n]) => `  ${r.padEnd(26)} ${n}`),
    '',
  ].join('\n');
}

async function prometheus(query) {
  const r = await fetch(`http://localhost:9090/api/v1/query?query=${encodeURIComponent(query)}`);
  return (await r.json()).data.result;
}

async function metricsReport() {
  const lines = [];
  const writeSeries = (title, result, label) => {
    lines.push(title);
    for (const { metric, value } of result) {
      lines.push(`  ${(metric[label] ?? '').padEnd(14)} ${value[1]}`);
    }
    lines.push('');
  };
  writeSeries('bikeshare_rentals_opened_total, by station:',
    await prometheus('sum by (bikeshare_rental_start_station) (bikeshare_rentals_opened_total)'),
    'bikeshare_rental_start_station');
  writeSeries('bikeshare_rentals_amount_EUR_sum, by station:',
    await prometheus('sum by (bikeshare_rental_start_station) (bikeshare_rentals_amount_EUR_sum)'),
    'bikeshare_rental_start_station');
  writeSeries('bikeshare_rentals_amount_EUR_bucket, all stations, by bucket:',
    await prometheus('sum by (le) (bikeshare_rentals_amount_EUR_bucket)'), 'le');
  const series = await prometheus('count({__name__=~"bikeshare_.*"})');
  lines.push(`bikeshare_* series in Prometheus: ${series[0]?.value[1]}`);
  lines.push('');
  lines.push('One raw series, as Prometheus stores it:');
  const [raw] = await prometheus('bikeshare_rentals_opened_total');
  lines.push(`  ${JSON.stringify(raw.metric)}`);
  return `${lines.join('\n')}\n`;
}

if (!(await fetch('http://localhost:4200').catch(() => null))?.ok) {
  console.error('the frontend must be running: cd frontend && npm start');
  process.exit(1);
}

rmSync(EVIDENCE_DIR, { recursive: true, force: true });
for (const d of ['logs', 'traces', 'diagnostics', 'collector', 'metrics', 'instrumenter']) {
  mkdirSync(path.join(EVIDENCE_DIR, d), { recursive: true });
}
await stopBackground('rentals');
await stopBackground('fleet');
rmSync(LOGS_DIR, { recursive: true, force: true });
run(null, 'docker', 'compose', ...COMPOSE, 'down');
run(null, 'node', 'scripts/compare-collector.mjs', 'prepare');

//  Functional check: it needs a fresh fleet.
await freshStack();
run('logs/functional-check.txt', 'node', 'scripts/verify-functional.mjs');

//  Core scenarios, cold then warm.
await freshStack();
run('logs/scenarios-cold.txt', 'node', 'scripts/scenarios.mjs');
run('logs/scenarios-warm.txt', 'node', 'scripts/scenarios.mjs');

//  Browser walkthrough and telemetry checks, on a fresh fleet.
await freshStack();
run('traces/actions.txt', 'node', 'scripts/browser.mjs');
await sleep(3000);
run('traces/telemetry-checks.txt', 'node', 'scripts/verify-telemetry.mjs');
run('collector/before-after.txt', 'node', 'scripts/compare-collector.mjs', 'measure');

const actions = JSON.parse(readFileSync(path.join(LOGS_DIR, 'actions.json'), 'utf8'));
for (const { action, trace } of actions) {
  const slug = action.replace(/[^a-z]+/g, '-').replace(/-$/, '');
  run(`traces/action-${slug}.txt`, 'node', 'scripts/read-trace.mjs', '--trace', trace);
}
const traceOf = (name) => actions.find((a) => a.action === name).trace;
run('traces/correlation-rent.txt', 'node', 'scripts/correlate.mjs', traceOf('rent'));
run('traces/correlation-failure.txt', 'node', 'scripts/correlate.mjs',
  traceOf('rent (out-of-service station)'));

//  Extended scenarios.
run('logs/extended-scenarios.txt', 'node', 'scripts/extended-scenarios.mjs');
await sleep(3000);
const extended = JSON.parse(
  readFileSync(path.join(LOGS_DIR, 'extended-scenarios.json'), 'utf8'),
);
for (const [slug, trace] of Object.entries(extended)) {
  run(`traces/scenario-${slug}.txt`, 'node', 'scripts/read-trace.mjs', '--trace', trace);
}

//  Latency diagnosis, warm and cold, plus the raw export.
write('diagnostics/latency-breakdown.txt', [
  await latencyBreakdown('warm report', traceOf('report (warm)')),
  await latencyBreakdown('cold report', traceOf('report (cold)')),
].join('\n'));
writeFileSync(
  path.join(EVIDENCE_DIR, 'diagnostics/latency-trace-warm.json'),
  await (await fetch(`http://localhost:16686/api/v3/traces/${traceOf('report (warm)')}`)).text(),
);

//  Failure diagnosis: browser, rentals and fleet, under a single id.
const failure = traceOf('rent (out-of-service station)');
const failureLogs = ['frontend', 'rentals', 'fleet'].map((log) =>
  run(null, 'node', 'scripts/trace-logs.mjs',
    '--log', `logs/${log}.log`, '--trace', failure));
write('diagnostics/failure-logs-out-of-service.txt', failureLogs.join('\n'));
run('diagnostics/failure-trace-out-of-service.txt', 'node', 'scripts/read-trace.mjs', '--trace', failure);
writeFileSync(
  path.join(EVIDENCE_DIR, 'diagnostics/failure-trace-out-of-service.json'),
  await (await fetch(`http://localhost:16686/api/v3/traces/${failure}`)).text(),
);

//  Metrics: rentals at several stations, long enough to cost more than the minimum.
const subscriber = { email: SUBSCRIBER_EMAIL, password: SUBSCRIBER_PASSWORD };
const open = async (stationCode) =>
  (await tracedRequest('/rentals', 'POST', { stationCode, ...subscriber })).body.reference;
const short = await open('ST-ARCEAUX');
const medium = await open('ST-TRIOLET');
const long = await open('ST-COMEDIE');
await open('ST-MOSSON');
const returnRental = (reference) =>
  tracedRequest(`/rentals/${reference}/return`, 'POST', { stationCode: 'ST-MOSSON' });
await returnRental(short);
await sleep(65_000);
await returnRental(medium);
await sleep(65_000);
await returnRental(long);
await sleep(12_000);
write('metrics/prometheus.txt', await metricsReport());
write('diagnostics/rentals-by-station.txt', rentalsByStation());

//  Spoon vs hand-written instrumentation: the same request on both builds.
const stations = async (label) => {
  await tracedRequest('/stations');
  const { trace } = await tracedRequest('/stations');
  await sleep(2500);
  const list = await spans(trace);
  const fleet = list.filter((s) => s.service === 'fleet');
  const manual = fleet.filter((s) => s.tracer.includes('annotations')).map((s) => s.name);
  return [
    `${label}: ${list.length} spans, ${fleet.length} in fleet, ` +
      `${manual.length} created by annotation  (trace ${trace})`,
    ...[...new Set(manual)].map((n) => `    ${n} x${manual.filter((m) => m === n).length}`),
  ].join('\n');
};
if (existsSync(SPOON_JAR)) {
  const handWritten = await stations('GET /stations, hand-written instrumentation');
  await stopBackground('fleet');
  process.env.FLEET_JAR = SPOON_JAR;
  await startBackground('fleet');
  const spoon = await stations('GET /stations, Spoon-instrumented copy');
  delete process.env.FLEET_JAR;
  await stopBackground('fleet');
  await startBackground('fleet');
  write('instrumenter/spoon-vs-manual.txt', `${handWritten}\n\n${spoon}\n`);
} else {
  console.log('\nSkipping Spoon comparison: build the instrumented copy first (see README).');
}

//  The final check, on everything this run produced.
await sleep(3000);
run('logs/privacy-sentinel.txt', 'node', 'scripts/verify-privacy.mjs',
  '--logs', 'logs');

for (const f of ['frontend.log', 'rentals.log', 'fleet.log']) {
  cpSync(path.join(LOGS_DIR, f), path.join(EVIDENCE_DIR, 'logs', f));
}
run(null, 'node', 'scripts/compare-collector.mjs', 'finish');
console.log(`\nEvidence filed in ${EVIDENCE_DIR}`);
