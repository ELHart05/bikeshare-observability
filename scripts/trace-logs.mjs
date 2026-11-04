/**
 * Links a log file to a trace.
 *
 *     node scripts/trace-logs.mjs --log my-log.txt
 *     node scripts/trace-logs.mjs --log my-log.txt --trace <id>
 *
 * <p>Without {@code --trace}, the tool lists the trace ids it sees, with the
 * number of lines that carry them. With it, it prints only that trace's lines.</p>
 *
 * <p>It recognizes both forms: the console form ({@code trace_id=abcd...})
 * and the structured form ({@code "trace_id":"abcd..."}).</p>
 *
 * <p>It is the other half of {@code read-trace.mjs}: that one shows where the
 * time went, this one shows what the program had to say meanwhile.</p>
 */
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const log = option('--log', null);
const trace = option('--trace', null);

if (!log) {
  console.error('usage: node scripts/trace-logs.mjs --log <file> [--trace <id>]');
  process.exit(2);
}

let text;
try {
  text = await fs.readFile(log, 'utf8');
} catch (e) {
  console.error(`cannot read log: ${e.message}`);
  process.exit(1);
}

//  Both forms in a single expression.
//  The named group avoids depending on the order of the alternatives.
const PATTERN = /(?:trace_id\s*[=:]\s*"?|"trace[._]id"\s*:\s*")(?<id>[0-9a-f]{32})/gi;

const lines = text.split(/\r?\n/);
const byTrace = new Map();

lines.forEach((line, index) => {
  for (const m of line.matchAll(PATTERN)) {
    const id = m.groups.id.toLowerCase();
    if (!byTrace.has(id)) byTrace.set(id, []);
    byTrace.get(id).push({ number: index + 1, line });
  }
});

if (!byTrace.size) {
  console.log(`no trace id in ${log}.`);
  console.log('');
  console.log('Two possible causes:');
  console.log('  - the log pattern does not print trace_id;');
  console.log('  - no agent was attached, so there was nothing to print.');
  process.exit(1);
}

if (!trace) {
  console.log(`${log}: ${byTrace.size} trace(s), ${lines.length} line(s) read`);
  console.log('-'.repeat(72));
  const sorted = [...byTrace.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [id, occurrences] of sorted) {
    const first = occurrences[0].number;
    console.log(
      `  ${id}  ${String(occurrences.length).padStart(3)} line(s)` +
        `  (from line ${first})`,
    );
  }
  console.log('-'.repeat(72));
  console.log('To see the lines of one trace: --trace <id>');
  process.exit(0);
}

const target = trace.toLowerCase();
const occurrences = byTrace.get(target);
if (!occurrences) {
  console.log(`trace ${target} does not appear in ${log}.`);
  process.exit(1);
}

console.log(`trace ${target}: ${occurrences.length} line(s) of ${log}`);
console.log('-'.repeat(92));
for (const { number, line } of occurrences) {
  console.log(`${String(number).padStart(5)} | ${line}`);
}
