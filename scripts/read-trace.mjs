/**
 * Reads a trace from Jaeger and prints it as a tree, with durations.
 *
 *     node scripts/read-trace.mjs --service rentals
 *     node scripts/read-trace.mjs --trace 4bf92f3577b34da6a3ce929d0e0e4736
 *     node scripts/read-trace.mjs --service rentals --all
 *
 * <p>Why a tool when Jaeger has a web UI? Because an incident note quotes
 * <b>values</b> (a trace id, a span name, a duration in milliseconds), and a
 * screenshot cannot be copied from.</p>
 *
 * <p>It only uses the Jaeger v3 API and Node's built-in fetch.</p>
 */
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const jaeger = option('--jaeger', 'http://localhost:16686');
const service = option('--service', null);
const trace = option('--trace', null);
const all = args.includes('--all');

if (!service && !trace) {
  console.error('usage: node scripts/read-trace.mjs --service <name> | --trace <id>');
  console.error('       --jaeger <url>   (default: http://localhost:16686)');
  console.error('       --all            (every trace, not only the latest)');
  process.exit(2);
}

const isoOffset = (minutes) =>
  new Date(Date.now() + minutes * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');

async function readJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    throw new Error(`Jaeger responded ${r.status} for ${url}`);
  }
  return r.json();
}

/**
 * Jaeger returns a span's kind and status either by name or in their numeric
 * OTLP form. Both are mapped to a name.
 */
const KINDS = ['', 'INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER'];
const STATUSES = ['UNSET', 'OK', 'ERROR'];

const nameOf = (value, names, prefix) => {
  if (typeof value === 'number') return names[value] ?? '';
  return String(value ?? '').replace(prefix, '');
};

/** Flattens Jaeger's OTLP response into a list of usable spans. */
function spansOf(body) {
  const batches = Array.isArray(body) ? body : [body];
  const spans = [];
  for (const batch of batches) {
    for (const rs of batch?.result?.resourceSpans ?? []) {
      const serviceName = (rs.resource?.attributes ?? []).find(
        (a) => a.key === 'service.name',
      )?.value?.stringValue;
      for (const ss of rs.scopeSpans ?? []) {
        const tracer = ss.scope?.name ?? '?';
        for (const s of ss.spans ?? []) {
          const start = BigInt(s.startTimeUnixNano ?? 0);
          const end = BigInt(s.endTimeUnixNano ?? 0);
          spans.push({
            service: serviceName ?? '?',
            tracer,
            trace: s.traceId,
            span: s.spanId,
            parent: s.parentSpanId || null,
            name: s.name,
            kind: nameOf(s.kind, KINDS, 'SPAN_KIND_'),
            status: nameOf(s.status?.code, STATUSES, 'STATUS_CODE_'),
            start,
            ms: Number(end - start) / 1e6,
          });
        }
      }
    }
  }
  return spans;
}

/** Prints a span tree, each child under its parent. */
function printTree(spans) {
  const traceId = spans[0].trace;
  const roots = spans.filter((s) => !s.parent || !spans.some((p) => p.span === s.parent));
  const total = Math.max(...spans.map((s) => s.ms));

  console.log('');
  console.log(`trace ${traceId}   ${spans.length} span(s)`);
  console.log('-'.repeat(92));

  const walk = (span, depth) => {
    const share = total > 0 ? Math.round((span.ms / total) * 100) : 0;
    const bar = '#'.repeat(Math.max(1, Math.round(share / 5))).padEnd(20, '.');
    const name = '  '.repeat(depth) + span.name;
    const error = String(span.status).includes('ERROR') ? '  ERROR' : '';
    console.log(
      `${name.padEnd(44).slice(0, 44)} ${span.ms.toFixed(1).padStart(8)} ms  ` +
      `${String(share).padStart(3)} %  ${bar}  ${span.service}${error}`,
    );
    spans
      .filter((s) => s.parent === span.span)
      .sort((a, b) => Number(a.start - b.start))
      .forEach((child) => walk(child, depth + 1));
  };

  roots.sort((a, b) => Number(a.start - b.start)).forEach((r) => walk(r, 0));

  const services = [...new Set(spans.map((s) => s.service))];
  const tracers = [...new Set(spans.map((s) => s.tracer))];
  console.log('-'.repeat(92));
  console.log(`services crossed: ${services.join(', ')}`);
  console.log(`tracers: ${tracers.join(' | ')}`);
}

let spans;
if (trace) {
  spans = spansOf(await readJson(`${jaeger}/api/v3/traces/${trace}`));
} else {
  const url =
    `${jaeger}/api/v3/traces?query.service_name=${encodeURIComponent(service)}` +
    `&query.num_traces=50&query.start_time_min=${isoOffset(-120)}` +
    `&query.start_time_max=${isoOffset(5)}`;
  spans = spansOf(await readJson(url));
}

if (!spans.length) {
  console.log('no span found. Are the services instrumented, and does the');
  console.log('Collector export to Jaeger?');
  process.exit(1);
}

const traces = [...new Set(spans.map((s) => s.trace))];
const ordered = traces
  .map((t) => spans.filter((s) => s.trace === t))
  .sort((a, b) => Number(b[0].start - a[0].start));

for (const batch of all || trace ? ordered : ordered.slice(0, 1)) {
  printTree(batch);
}

if (!all && !trace && ordered.length > 1) {
  console.log('');
  console.log(`(${ordered.length - 1} more trace(s): add --all)`);
}
