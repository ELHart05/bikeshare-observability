/**
 * Telemetry checks, read back from live telemetry.
 *
 *     node scripts/browser.mjs
 *     node scripts/verify-telemetry.mjs
 *
 * <p>Reads `logs/actions.json`, the three logs and Jaeger. It does not prove the
 * instrumentation is good; it proves it behaves as documented.</p>
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { LOGS_DIR, sleep } from './lib.mjs';

let failures = 0;
function check(section, what, ok, detail = '') {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${section.padEnd(11)} ${what}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

const actions = JSON.parse(await fs.readFile(path.join(LOGS_DIR, 'actions.json'), 'utf8'));
const traceOf = (name) => actions.find((a) => a.action === name).trace;

/** The JSON lines of a log; other lines (banners) are skipped. */
async function readLog(name) {
  const text = await fs.readFile(path.join(LOGS_DIR, `${name}.log`), 'utf8');
  return text.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
}

/** All spans of a trace, flattened. */
async function spans(trace) {
  const body = await (await fetch(`http://localhost:16686/api/v3/traces/${trace}`)).json();
  return body.result.resourceSpans.flatMap((rs) => {
    const service = rs.resource.attributes.find((a) => a.key === 'service.name').value.stringValue;
    return rs.scopeSpans.flatMap((ss) =>
      ss.spans.map((s) => ({
        ...s,
        service,
        tracer: ss.scope.name,
        attributes: Object.fromEntries(
          (s.attributes ?? []).map((a) => [a.key, Object.values(a.value)[0]]),
        ),
        ms: Number(BigInt(s.endTimeUnixNano) - BigInt(s.startTimeUnixNano)) / 1e6,
        error: s.status?.code === 2 || s.status?.code === 'STATUS_CODE_ERROR',
      })),
    );
  });
}

await sleep(2000);
const [rentals, fleet, frontend] = await Promise.all(['rentals', 'fleet', 'frontend'].map(readLog));

const rent = await spans(traceOf('rent'));
const returned = await spans(traceOf('return'));
const report = await spans(traceOf('report (warm)'));
const failure = await spans(traceOf('rent (out-of-service station)'));
const refresh = await spans(actions[0].trace);

console.log('=== Structured logs ===');
const opened = rentals.filter((l) => l.message === 'rental.opened' && l.trace_id === rent[0].traceId);
check('logs', 'rental.opened is logged once for the action', opened.length === 1);
check('logs', 'level INFO', opened[0]?.log.level === 'INFO');
check('logs', 'named fields, no address', opened[0]?.bikeshare?.rental?.start_station === 'ST-COMEDIE'
  && opened[0]?.bikeshare?.subscriber?.domain === 'example.com');
const closed = rentals.find((l) => l.message === 'rental.closed' && l.trace_id === returned[0].traceId);
check('logs', 'the amount is a number', typeof closed?.bikeshare?.rental?.amount_eur === 'number',
  String(closed?.bikeshare?.rental?.amount_eur));
const rejection = rentals.find((l) => l.trace_id === failure[0].traceId);
check('logs', 'a failure logs one WARN or ERROR line', ['WARN', 'ERROR'].includes(rejection?.log.level),
  rejection?.log.level);

console.log('\n=== Agent auto-instrumentation ===');
const tracers = new Set(returned.map((s) => s.tracer));
for (const expected of ['tomcat', 'java-http-client', 'spring-data', 'hibernate', 'jdbc']) {
  check('agent', `tracer ${expected} present on the return`,
    [...tracers].some((t) => t.includes(expected)));
}

console.log('\n=== Manual spans ===');
const open = rent.find((s) => s.name === 'rental.open');
check('spans', 'rental.open carries the business data', open?.attributes['bikeshare.rental.reference']?.startsWith('R-'));
check('spans', 'it hangs off its service\'s server span',
  rent.find((s) => s.spanId === open?.parentSpanId)?.name === 'POST /rentals');
const inError = failure.filter((s) => s.error).map((s) => s.name);
check('spans', 'a failure marks the business spans as error',
  ['action.rent', 'rental.open', 'fleet.pickup'].every((n) => inError.includes(n)));
const consolidation = report.find((s) => s.name === 'fleet.consolidation');
check('spans', 'fleet.consolidation comes from the annotation', consolidation?.tracer.includes('annotations'),
  consolidation?.tracer);

console.log('\n=== Context propagation ===');
check('propagation', 'one TraceId across three services', new Set(rent.map((s) => s.service)).size === 3);
check('propagation', 'the click reaches the fleet SQL',
  rent.some((s) => s.service === 'fleet' && s.attributes['db.statement']));
const parent = (list, child) => list.find((s) => s.spanId === child?.parentSpanId);
const entry = rent.find((s) => s.name === 'POST /rentals');
const fleetCall = rent.find((s) => s.name === 'POST /stations/{code}/pickup');
check('propagation', 'browser -> rentals: the parent is in the other process',
  parent(rent, entry)?.service === 'bikeshare-frontend', `parent ${entry?.parentSpanId}`);
check('propagation', 'rentals -> fleet: the parent is in the other process',
  parent(rent, fleetCall)?.service === 'rentals', `parent ${fleetCall?.parentSpanId}`);
const calls = refresh.filter((s) => s.tracer.includes('fetch'));
check('propagation', 'both refresh requests stay in the action trace',
  calls.length === 2 && calls.every((s) => parent(refresh, s)?.name === 'action.refresh'));

console.log('\n=== Log-trace correlation ===');
check('correlation', 'rental.opened: same TraceId and SpanId as rental.open',
  opened[0]?.span_id === open?.spanId, open?.spanId);
const fleetRejection = fleet.find((l) => l.trace_id === failure[0].traceId);
check('correlation', 'fleet.pickup_rejected: same SpanId as fleet.pickup',
  fleetRejection?.span_id === failure.find((s) => s.name === 'fleet.pickup')?.spanId, fleetRejection?.span_id);
const browserLine = frontend.find((l) => l.trace_id === rent[0].traceId);
check('correlation', 'the browser line carries the trace TraceId', Boolean(browserLine),
  browserLine?.message);
check('correlation', 'and the SpanId of action.rent',
  browserLine?.span_id === rent.find((s) => s.name === 'action.rent')?.spanId);

console.log('\n=== Latency diagnosis ===');
const root = report.find((s) => !s.parentSpanId);
const share = (100 * consolidation?.ms) / root?.ms;
check('latency', 'most of the time is spent in fleet.consolidation', share > 60,
  `${consolidation?.ms.toFixed(1)} ms of ${root?.ms.toFixed(1)} ms, ${share.toFixed(0)} %`);

console.log('');
if (failures) {
  console.log(`FAIL: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('OK: all telemetry checks pass on live telemetry.');
