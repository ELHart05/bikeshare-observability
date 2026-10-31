/**
 * The seven core functional scenarios.
 *
 * <p>They always run in the same order on a freshly started fleet, and always
 * produce the same results.</p>
 *
 *     node scripts/scenarios.mjs
 *
 * <p>Each scenario has an <b>observation goal</b>, shown in the right-hand
 * column.</p>
 */
import {
  RENTALS_URL, SUBSCRIBER_EMAIL, SUBSCRIBER_PASSWORD, request, requireServices,
} from './lib.mjs';

await requireServices();

const subscriber = { email: SUBSCRIBER_EMAIL, password: SUBSCRIBER_PASSWORD };

/**
 * Reference of the rental opened in scenario 2, reused by scenarios 6 and 7,
 * so the seven scenarios chain even when rentals already existed.
 */
let reference = 'R-0001';

const SCENARIOS = [
  {
    name: '1. happy path',
    goal: 'the working case, end to end',
    run: () => request(`${RENTALS_URL}/stations`),
  },
  {
    name: '2. open a rental',
    goal: 'a business milestone the agent cannot see',
    run: async () => {
      const r = await request(`${RENTALS_URL}/rentals`, {
        method: 'POST',
        body: { stationCode: 'ST-COMEDIE', ...subscriber },
      });
      if (r.body?.reference) reference = r.body.reference;
      return r;
    },
  },
  {
    name: '3. empty station',
    goal: 'a rejection, not an outage',
    run: () =>
      request(`${RENTALS_URL}/rentals`, {
        method: 'POST',
        body: { stationCode: 'ST-GARE', ...subscriber },
      }),
  },
  {
    name: '4. out-of-service station',
    goal: 'a failure caused by the other service',
    run: () =>
      request(`${RENTALS_URL}/rentals`, {
        method: 'POST',
        body: { stationCode: 'ST-PEYROU', ...subscriber },
      }),
  },
  {
    name: '5. rejected subscriber',
    goal: 'a secret actually sent',
    run: () =>
      request(`${RENTALS_URL}/rentals`, {
        method: 'POST',
        body: { stationCode: 'ST-COMEDIE', email: SUBSCRIBER_EMAIL, password: 'wrong' },
      }),
  },
  {
    name: '6. rental report',
    goal: 'the slow operation: where does the time go?',
    run: () => request(`${RENTALS_URL}/rentals/${reference}/report`),
  },
  {
    name: '7. return the bike',
    goal: 'closing: duration and amount',
    run: () =>
      request(`${RENTALS_URL}/rentals/${reference}/return`, {
        method: 'POST',
        body: { stationCode: 'ST-ARCEAUX' },
      }),
  },
];

console.log('scenario                        status    time   observation goal');
console.log('-'.repeat(96));

const results = [];
for (const scenario of SCENARIOS) {
  const t0 = process.hrtime.bigint();
  let status = 0;
  try {
    status = (await scenario.run()).status;
  } catch (e) {
    console.error(`  ${scenario.name}: ${e.message}`);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  results.push({ ...scenario, status, ms });
  console.log(
    `${scenario.name.padEnd(32)}${String(status).padEnd(10)}` +
      `${ms.toFixed(0).padStart(5)} ms  ${scenario.goal}`,
  );
}

console.log('');
const slowest = results.reduce((a, b) => (a.ms > b.ms ? a : b));
console.log(`the slowest scenario is "${slowest.name}": ${slowest.ms.toFixed(0)} ms.`);
console.log('The traces explain why.');
