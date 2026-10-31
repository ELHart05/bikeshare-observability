/**
 * Starts and stops both services in the background, with the agent.
 *
 *     node scripts/stack.mjs start
 *     node scripts/stack.mjs stop
 *     node scripts/stack.mjs restart fleet -Dfleet.consolidation-ms=1200
 *
 * <p>Order matters: rentals calls fleet. To watch the log scroll in a
 * terminal, use `node scripts/start.mjs <service> --agent` instead.</p>
 */
import { SERVICES, startBackground, stopBackground } from './lib.mjs';

const [command, ...rest] = process.argv.slice(2);

try {
  if (command === 'start') {
    await startBackground('fleet');
    await startBackground('rentals');
    console.log('fleet (8081) and rentals (8080) are listening, agent attached');
  } else if (command === 'stop') {
    await stopBackground('rentals');
    await stopBackground('fleet');
    console.log('services stopped');
  } else if (command === 'restart' && SERVICES[rest[0]]) {
    await stopBackground(rest[0]);
    await startBackground(rest[0], rest.slice(1));
    console.log(`"${rest[0]}" restarted ${rest.slice(1).join(' ')}`);
  } else {
    console.error('usage: node scripts/stack.mjs start | stop | restart <fleet|rentals> [JVM args]');
    process.exit(2);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
