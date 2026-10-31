/**
 * Functional baseline check: does the application still do what it did?
 *
 *     node scripts/verify-functional.mjs
 *
 * <p>Run it on two FRESHLY started services.
 * It relies on the initial fleet state, and opens rental {@code R-0001}.</p>
 *
 * <p>Run it again after instrumenting:
 * <b>instrumentation must not change behaviour</b>.
 * It checks nothing about telemetry.</p>
 */
import {
  FLEET_URL, RENTALS_URL, SUBSCRIBER_EMAIL, SUBSCRIBER_PASSWORD, request, requireServices,
} from './lib.mjs';

await requireServices();

const subscriber = { email: SUBSCRIBER_EMAIL, password: SUBSCRIBER_PASSWORD };
let failures = 0;
let checks = 0;

function check(what, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${what.padEnd(52)} ` +
      `${ok ? '' : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`,
  );
  if (!ok) failures += 1;
}

console.log('=== 1. initial fleet ===');
const stations = (await request(`${FLEET_URL}/stations`)).body;
check('number of stations', stations.length, 6);
check(
  'station codes',
  stations.map((s) => s.code),
  ['ST-ARCEAUX', 'ST-COMEDIE', 'ST-GARE', 'ST-MOSSON', 'ST-PEYROU', 'ST-TRIOLET'],
);
check(
  'available bikes per station',
  stations.map((s) => s.availableBikes),
  [4, 7, 0, 3, 5, 2],
);
check(
  'total available bikes',
  stations.reduce((t, s) => t + s.availableBikes, 0),
  21,
);
check(
  'out-of-service stations',
  stations.filter((s) => s.outOfService).map((s) => s.code),
  ['ST-PEYROU'],
);

console.log('');
console.log('=== 2. what the web UI sees ===');
const views = (await request(`${RENTALS_URL}/stations`)).body;
check('number of stations seen by the frontend', views.length, 6);
check(
  'rentable stations',
  views.filter((s) => s.rentable).map((s) => s.code),
  ['ST-ARCEAUX', 'ST-COMEDIE', 'ST-MOSSON', 'ST-TRIOLET'],
);

console.log('');
console.log('=== 3. open, report, return ===');
const opened = await request(`${RENTALS_URL}/rentals`, {
  method: 'POST',
  body: { stationCode: 'ST-COMEDIE', ...subscriber },
});
check('open: status', opened.status, 201);
check('open: reference', opened.body?.reference, 'R-0001');
check('open: bike picked up', opened.body?.bikeId, 'B-0006');
check('open: rental status', opened.body?.status, 'ACTIVE');

const report = await request(`${RENTALS_URL}/rentals/R-0001/report`);
check('report: status', report.status, 200);
check('report: turnover index', report.body?.turnoverIndex, 100);
check('report: rentals from this station', report.body?.rentalsFromStation, 1);

const returned = await request(`${RENTALS_URL}/rentals/R-0001/return`, {
  method: 'POST',
  body: { stationCode: 'ST-ARCEAUX' },
});
check('return: status', returned.status, 200);
check('return: billed minutes', returned.body?.durationMinutes, 1);
check('return: amount', returned.body?.amount, 1.05);
check('return: rental status', returned.body?.status, 'CLOSED');

console.log('');
console.log('=== 4. rejections ===');
const empty = await request(`${RENTALS_URL}/rentals`, {
  method: 'POST',
  body: { stationCode: 'ST-GARE', ...subscriber },
});
check('empty station: status', empty.status, 409);

const outOfService = await request(`${RENTALS_URL}/rentals`, {
  method: 'POST',
  body: { stationCode: 'ST-PEYROU', ...subscriber },
});
check('out-of-service station: status', outOfService.status, 503);

const unknown = await request(`${RENTALS_URL}/rentals`, {
  method: 'POST',
  body: { stationCode: 'ST-NOWHERE', ...subscriber },
});
check('unknown station: status', unknown.status, 404);

const rejected = await request(`${RENTALS_URL}/rentals`, {
  method: 'POST',
  body: { stationCode: 'ST-COMEDIE', email: SUBSCRIBER_EMAIL, password: 'wrong' },
});
check('wrong password: status', rejected.status, 401);
check(
  'wrong password: the message does not echo the secret',
  rejected.text.includes(SUBSCRIBER_PASSWORD),
  false,
);

const twice = await request(`${RENTALS_URL}/rentals/R-0001/return`, {
  method: 'POST',
  body: { stationCode: 'ST-ARCEAUX' },
});
check('return already done: status', twice.status, 409);

console.log('');
if (failures > 0) {
  console.log(`FAIL: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`OK: the functional baseline holds (${checks} checks).`);
