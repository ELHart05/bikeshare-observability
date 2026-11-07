/**
 * Collector processing comparison: what the Collector removes, measured on the same trace.
 *
 *     node scripts/compare-collector.mjs prepare    restarts the Collector with a raw copy
 *     node scripts/stack.mjs start
 *     node scripts/browser.mjs
 *     node scripts/compare-collector.mjs measure
 *     node scripts/compare-collector.mjs finish     back to the normal configuration
 *
 * <p>The raw copy is written before any processing: it holds exactly what gets
 * removed, which is why `finish` deletes it.</p>
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { LOGS_DIR, ROOT } from './lib.mjs';

const OBSERVABILITY_DIR = path.join(ROOT, 'observability');
const RAW_FILE = path.join(OBSERVABILITY_DIR, 'comparison', 'raw.jsonl');
const REMOVED_KEYS = ['client.address', 'network.peer.address', 'network.peer.port', 'user_agent.original'];

function compose(files, ...args) {
  const f = files.flatMap((name) => ['-f', path.join(OBSERVABILITY_DIR, name)]);
  execFileSync('docker', ['compose', ...f, ...args], {
    stdio: 'inherit',
    env: { ...process.env, COLLECTOR_USER: String(process.getuid?.() ?? 0) },
  });
}

/** The spans of a list of OTLP batches, flattened. */
const flatten = (batches) =>
  batches.flatMap((b) => b.resourceSpans ?? []).flatMap((rs) => rs.scopeSpans ?? [])
    .flatMap((ss) => ss.spans ?? []);

const keys = (span) => (span.attributes ?? []).map((a) => a.key);
const isPreflight = (s) => s.name.startsWith('OPTIONS');

async function measure() {
  const actions = JSON.parse(await fs.readFile(path.join(LOGS_DIR, 'actions.json'), 'utf8'));
  const trace = actions.find((a) => a.action === 'rent').trace;

  const text = await fs.readFile(RAW_FILE, 'utf8');
  const batches = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const raw = flatten(batches);
  const before = raw.filter((s) => s.traceId === trace);

  const body = await (await fetch(`http://localhost:16686/api/v3/traces/${trace}`)).json();
  const after = flatten([body.result]);

  console.log(`trace ${trace} (action rent)`);
  console.log(`  spans                 before ${before.length}   after ${after.length}`);
  for (const key of REMOVED_KEYS) {
    const count = (spans) => spans.filter((s) => keys(s).includes(key)).length;
    console.log(`  ${key.padEnd(22)}before ${count(before)}   after ${count(after)}`);
  }
  //  A resource attribute, carried by the batch and not by the span.
  const resources = (b) => (b.resourceSpans ?? []).filter((rs) =>
    rs.resource.attributes.some((a) => a.key === 'process.command_args')).length;
  console.log(`  ${'process.command_args'.padEnd(22)}before ${batches.reduce((t, b) => t + resources(b), 0)} batches   ` +
    `after ${resources(body.result)} resources`);
  const size = (spans) => JSON.stringify(spans).length;
  console.log(`  JSON size             before ${size(before)} B   after ${size(after)} B`);

  const service = (await (await fetch(
    'http://localhost:16686/api/v3/traces?query.service_name=rentals&query.num_traces=500' +
      `&query.start_time_min=${new Date(Date.now() - 3600e3).toISOString()}` +
      `&query.start_time_max=${new Date().toISOString()}`,
  )).json()).result;
  const preflights = raw.filter(isPreflight).length;
  console.log('');
  console.log('over the whole session');
  console.log(`  spans received        ${raw.length}, of which ${preflights} CORS preflights`);
  console.log(`  CORS preflights in Jaeger: ${flatten([service]).filter(isPreflight).length}`);
}

const command = process.argv[2];
if (command === 'prepare') {
  await fs.mkdir(path.dirname(RAW_FILE), { recursive: true });
  await fs.rm(RAW_FILE, { force: true });
  compose(['docker-compose.yml', 'docker-compose.comparison.yml'], 'up', '-d', '--force-recreate');
} else if (command === 'measure') {
  await measure();
} else if (command === 'finish') {
  compose(['docker-compose.yml'], 'up', '-d', '--force-recreate', 'collector');
  await fs.rm(path.dirname(RAW_FILE), { recursive: true, force: true });
} else {
  console.error('usage: node scripts/compare-collector.mjs prepare | measure | finish');
  process.exit(2);
}
