/**
 * Starts a service IN THE FOREGROUND.
 *
 *     node scripts/start.mjs fleet
 *     node scripts/start.mjs rentals
 *     node scripts/start.mjs fleet --agent        exports to the Collector
 *
 * <p>Any extra argument is passed AS IS to the JVM, before `-jar`.
 * For instance, to override a startup property:</p>
 *
 *     node scripts/start.mjs fleet -Dfleet.consolidation-ms=1200
 *
 * <p>Ctrl-C to stop.</p>
 */
import { spawn } from 'node:child_process';

import { SERVICES, agentConfig, jvmArgs, waitForFreePort } from './lib.mjs';

const [name, ...rest] = process.argv.slice(2);
const withAgent = rest.includes('--agent');
const extraJvmArgs = rest.filter((a) => a !== '--agent');

if (!name || !SERVICES[name]) {
  console.error('usage: node scripts/start.mjs <fleet|rentals> [--agent] [JVM args...]');
  process.exit(2);
}

let argv;
let env = process.env;
try {
  const agent = withAgent ? await agentConfig(name) : { jvm: [], env: {} };
  argv = await jvmArgs(name, [...agent.jvm, ...extraJvmArgs]);
  env = { ...process.env, ...agent.env };
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const { port } = SERVICES[name];
if (!(await waitForFreePort(port, 5))) {
  console.error(
    `port ${port} is already in use: stop the process using it`,
  );
  process.exit(1);
}

console.log(`starting "${name}" on port ${port}, Ctrl-C to stop`);
if (extraJvmArgs.length) {
  console.log(`extra JVM args: ${extraJvmArgs.join(' ')}`);
}

//  `stdio: 'inherit'` shows the service log directly in the terminal, and Ctrl-C
//  reaches it.
const p = spawn('java', argv, { env, stdio: 'inherit' });
p.on('error', (e) => {
  console.error(`java not found: ${e.message}`);
  process.exit(1);
});
p.on('exit', (code, signal) => process.exit(signal ? 0 : code ?? 0));
