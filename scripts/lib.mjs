/**
 * Shared helpers for the scripts.
 *
 * <p>Everything is Node, standard library only. The scripts run as is on
 * Windows, macOS and Linux, without PowerShell, Bash or WSL.</p>
 *
 * <p>PORTABILITY RULE: processes are spawned with an ARRAY of arguments.</p>
 */
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Project root: the directory that contains `scripts/`. */
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** The Java agent: downloaded, never committed. */
export const AGENT = path.join(ROOT, 'opentelemetry-javaagent.jar');

/** Where the services write their structured logs. */
export const LOGS_DIR = path.join(ROOT, 'logs');

/** The two services, their port and the JAR Maven builds. */
export const SERVICES = {
  fleet: {
    port: 8081,
    //  FLEET_JAR runs the instrumented copy (see tools/spoon-instrumenter). Read on every
    //  start, not once: capture-evidence.mjs switches JARs midway.
    get jar() {
      return process.env.FLEET_JAR ?? path.join(ROOT, 'fleet', 'target', 'fleet.jar');
    },
    module: 'fleet',
  },
  rentals: {
    port: 8080,
    jar: path.join(ROOT, 'rentals', 'target', 'rentals.jar'),
    module: 'rentals',
  },
};

export const RENTALS_URL = 'http://127.0.0.1:8080';
export const FLEET_URL = 'http://127.0.0.1:8081';
export const JAEGER_URL = 'http://localhost:16686';

/**
 * The demo subscriber, their password, and the domain of their address.
 *
 * <p>Defined in one place because two tools depend on them: the one that
 * sends them and the one that checks they never come back out.</p>
 */
export const SUBSCRIBER_EMAIL = 'camille.rey@example.com';
export const SUBSCRIBER_PASSWORD = 'Zx9!Vole-Tandem';
export const SUBSCRIBER_DOMAIN = 'example.com';

/**
 * A FRAGMENT of the password, not the whole password.
 *
 * <p>Several frameworks TRUNCATE what they log. Spring Web, for instance, cuts
 * the request body it prints at DEBUG to about a hundred characters. A secret
 * cut that way no longer contains the full string, and a check looking only
 * for that string would call it absent. It is still there, and still a leak.</p>
 */
export const PASSWORD_FRAGMENT = SUBSCRIBER_PASSWORD.slice(0, 8);

/**
 * Field names that have no business in any output.
 *
 * <p>A line containing "password" logged a whole object without looking at
 * what it carried. The secret is in it, truncated or not.</p>
 */
export const FORBIDDEN_FIELDS = ['password'];

export const exists = async (p) => fs.access(p).then(() => true, () => false);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tests whether something listens on a local port. */
export function isPortInUse(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port });
    const done = (v) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(700);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
  });
}

/** Waits until the port is really free before starting a JVM. */
export async function waitForFreePort(port, seconds = 30) {
  for (let i = 0; i < seconds * 2; i += 1) {
    if (!(await isPortInUse(port))) return true;
    await sleep(500);
  }
  return false;
}

/**
 * Builds the JVM command line of a service.
 *
 * <p>`extraJvmArgs` is copied AS IS before `-jar`.
 * Any extra argument given on the command line goes through here.</p>
 */
export async function jvmArgs(name, extraJvmArgs = []) {
  const service = SERVICES[name];
  if (!service) {
    throw new Error(`unknown service: ${name} (fleet or rentals)`);
  }
  if (!(await exists(service.jar))) {
    throw new Error(
      `jar missing, build the service:\n` +
        `    mvn -f ${service.module}/pom.xml clean package`,
    );
  }
  //  UTF-8 end to end, otherwise the JVM writes Cp1252 on Windows.
  return [
    '-Dfile.encoding=UTF-8',
    '-Dsun.stdout.encoding=UTF-8',
    '-Dsun.stderr.encoding=UTF-8',
    `-Dlogging.file.name=${path.join(LOGS_DIR, `${name}.log`)}`,
    ...extraJvmArgs,
    '-jar',
    service.jar,
  ];
}

/**
 * What to add to a JVM to attach it to the observability stack.
 *
 * <p>The JAR does not change. The agent attaches with a single argument, and
 * everything else (service name, endpoint, exporters) goes through environment
 * variables, never through code.</p>
 */
export async function agentConfig(name) {
  if (!(await exists(AGENT))) {
    throw new Error(
      `agent missing, download it:\n    node scripts/download-agent.mjs`,
    );
  }
  return {
    jvm: [`-javaagent:${AGENT}`],
    env: {
      OTEL_SERVICE_NAME: name,
      OTEL_TRACES_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4317',
      OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
      OTEL_METRICS_EXPORTER: 'otlp',
      OTEL_METRIC_EXPORT_INTERVAL: '5000',
      //  Logs stay in a file: the Collector has no logs pipeline.
      OTEL_LOGS_EXPORTER: 'none',
      OTEL_BSP_SCHEDULE_DELAY: '200',
    },
  };
}

const pidFile = (name) => path.join(LOGS_DIR, `${name}.pid`);

/**
 * Starts a service in the background, with the agent, and waits until it listens.
 *
 * <p>This is what lets a script stop the fleet in the middle of a scenario.
 * The JVM output (agent included) goes to `logs/<name>.out`.</p>
 */
export async function startBackground(name, extraJvmArgs = []) {
  const { port } = SERVICES[name];
  if (!(await waitForFreePort(port, 15))) {
    throw new Error(`port ${port} is already in use`);
  }
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const agent = await agentConfig(name);
  const argv = await jvmArgs(name, [...agent.jvm, ...extraJvmArgs]);
  const output = openSync(path.join(LOGS_DIR, `${name}.out`), 'a');
  const p = spawn('java', argv, {
    env: { ...process.env, ...agent.env },
    stdio: ['ignore', output, output],
    detached: true,
  });
  p.unref();
  await fs.writeFile(pidFile(name), String(p.pid));
  if (!(await waitUntilReady(port))) {
    throw new Error(`"${name}" is not listening on ${port}: see logs/${name}.out`);
  }
}

/**
 * Waits until the service really answers.
 *
 * <p>The port is not enough: Tomcat listens before the fleet has loaded its
 * stations, and a request arriving in between gets a 404.</p>
 */
async function waitUntilReady(port, seconds = 120) {
  for (let i = 0; i < seconds * 2; i += 1) {
    try {
      const { status, body } = await request(`http://127.0.0.1:${port}/stations`);
      if (status === 200 && body.length > 0) return true;
    } catch {
      //  Still starting.
    }
    await sleep(500);
  }
  return false;
}

/** Stops a service started by {@link startBackground}. */
export async function stopBackground(name) {
  const pid = Number(await fs.readFile(pidFile(name), 'utf8').catch(() => 0));
  if (pid) {
    try {
      process.kill(pid);
    } catch {
      //  Already stopped.
    }
    await fs.rm(pidFile(name), { force: true });
  }
  await waitForFreePort(SERVICES[name].port, 15);
}

/** Calls a route and returns the status, the parsed body and the raw text. */
export async function request(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, body: json, text };
}

/** Counts literal occurrences of a string. */
export function countOccurrences(text, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = text.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = text.indexOf(needle, i + needle.length);
  }
  return n;
}

/** True when both services answer. */
export async function servicesReady() {
  for (const url of [RENTALS_URL + '/stations', FLEET_URL + '/stations']) {
    try {
      const r = await request(url);
      if (r.status !== 200) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Stops the tool with a useful message when the services are not running. */
export async function requireServices() {
  if (!(await servicesReady())) {
    console.error('Both services must be running:');
    console.error('    node scripts/start.mjs fleet      (port 8081)');
    console.error('    node scripts/start.mjs rentals    (port 8080)');
    process.exit(1);
  }
}
