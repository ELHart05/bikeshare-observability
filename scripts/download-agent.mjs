/**
 * Downloads the OpenTelemetry Java agent.
 *
 * <p>The agent is not committed. It is a binary of about twenty megabytes,
 * and good practice is to fetch it from Maven Central once.</p>
 *
 *     node scripts/download-agent.mjs
 *     node scripts/download-agent.mjs --version 2.32.0
 *     node scripts/download-agent.mjs --dir my-dir
 *
 * <p>The file is first written under a temporary name, then renamed.
 * An interrupted download never leaves a truncated agent behind.</p>
 */
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Pinned version. */
const DEFAULT_VERSION = '2.32.0';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const version = option('--version', DEFAULT_VERSION);
const dir = path.resolve(option('--dir', '.'));
const target = path.join(dir, 'opentelemetry-javaagent.jar');
const mb = (b) => (b / 1024 / 1024).toFixed(1);

const present = await fs.access(target).then(() => true, () => false);
if (present) {
  const { size } = await fs.stat(target);
  console.log(`agent already present (${mb(size)} MB): ${target}`);
  process.exit(0);
}

const url =
  'https://repo1.maven.org/maven2/io/opentelemetry/javaagent/' +
  `opentelemetry-javaagent/${version}/opentelemetry-javaagent-${version}.jar`;

console.log(`downloading agent ${version} ...`);
console.log(`  from ${url}`);

const r = await fetch(url);
if (!r.ok) {
  console.error(`FAIL: Maven Central responded ${r.status} ${r.statusText}`);
  console.error('  check the requested version and network access.');
  process.exit(1);
}

const expected = Number(r.headers.get('content-length') ?? 0);
const partial = `${target}.part`;
await fs.mkdir(dir, { recursive: true });
await pipeline(Readable.fromWeb(r.body), createWriteStream(partial));

const { size } = await fs.stat(partial);
if (expected && size !== expected) {
  await fs.rm(partial, { force: true });
  console.error(`FAIL: ${size} bytes received, ${expected} announced.`);
  process.exit(1);
}

await fs.rename(partial, target);
console.log(`agent ${version} downloaded (${mb(size)} MB): ${target}`);
