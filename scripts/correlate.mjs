/**
 * Puts each log line of a trace next to the span it was written in.
 *
 *     node scripts/correlate.mjs <traceId>
 *
 * <p>`trace-logs.mjs` finds the lines; this one checks them against Jaeger.</p>
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { LOGS_DIR } from './lib.mjs';

const trace = process.argv[2];
if (!/^[0-9a-f]{32}$/.test(trace ?? '')) {
  console.error('usage: node scripts/correlate.mjs <traceId, 32 hex characters>');
  process.exit(2);
}

const body = await (await fetch(`http://localhost:16686/api/v3/traces/${trace}`)).json();
const spans = body.result.resourceSpans.flatMap((rs) => {
  const service = rs.resource.attributes.find((a) => a.key === 'service.name').value.stringValue;
  return rs.scopeSpans.flatMap((ss) => ss.spans.map((s) => ({ ...s, service })));
});

console.log(`trace ${trace}, ${spans.length} spans\n`);
for (const log of ['frontend', 'rentals', 'fleet']) {
  const lines = (await readFile(path.join(LOGS_DIR, `${log}.log`), 'utf8'))
    .split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l))
    .filter((l) => l.trace_id === trace);
  for (const l of lines) {
    const span = spans.find((s) => s.spanId === l.span_id);
    console.log(`log     ${log.padEnd(10)} ${(l.log?.level ?? l.level).padEnd(6)}${l.message}`);
    console.log(`        trace_id=${l.trace_id}  span_id=${l.span_id}`);
    console.log(`span    ${span ? span.service.padEnd(10) : '?'.padEnd(10)} ${span?.name ?? 'NOT FOUND'}`);
    console.log(`        TraceId =${span?.traceId}  SpanId =${span?.spanId}`);
    console.log(`        parent ${span?.parentSpanId ?? '(root)'}\n`);
  }
}
