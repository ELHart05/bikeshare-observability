/**
 * Plays real clicks in a headless Chrome and keeps the browser log.
 *
 *     node scripts/browser.mjs
 *
 * <p>The frontend log only exists in the browser console. This script copies
 * it to `logs/frontend.log`, so that the privacy sentinel and `trace-logs.mjs`
 * read it like the other two. It also writes `logs/actions.json`: the TraceId
 * of each action.</p>
 *
 * <p>It talks to Chrome over the DevTools protocol, with the WebSocket built
 * into Node 22: no dependency. If Chrome is not found, point to it with the
 * CHROME variable, or do the same clicks by hand (see the README).</p>
 */
import { spawn } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { LOGS_DIR, sleep } from './lib.mjs';

const PORT = 9333;
const FRONTEND_URL = 'http://localhost:4200';
const CHROME_CANDIDATES = [process.env.CHROME, 'google-chrome', 'chromium', 'chromium-browser',
  'chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);

/**
 * The walkthrough: what to click, and on which row. `RENTAL` stands for the rental
 * the first action just opened. The report is requested twice, because the first
 * request on a cold JVM does not measure the same thing as the next one.
 */
const RENTAL = Symbol('the open rental');
const WALKTHROUGH = [
  { action: 'rent', row: 'ST-COMEDIE', button: 'Rent' },
  { action: 'report (cold)', row: RENTAL, button: 'Report' },
  { action: 'report (warm)', row: RENTAL, button: 'Report' },
  { action: 'return', row: RENTAL, button: 'Return' },
  { action: 'rent (empty station)', row: 'ST-GARE', button: 'Rent' },
  { action: 'rent (out-of-service station)', row: 'ST-PEYROU', button: 'Rent' },
];

function launchChrome(profile) {
  const options = [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-gpu', 'about:blank',
  ];
  return new Promise((resolve, reject) => {
    const attempt = (i) => {
      if (i >= CHROME_CANDIDATES.length) {
        reject(new Error('Chrome not found: set the CHROME variable'));
        return;
      }
      const p = spawn(CHROME_CANDIDATES[i], options, { stdio: 'ignore' });
      p.once('error', () => attempt(i + 1));
      p.once('spawn', () => resolve(p));
    };
    attempt(0);
  });
}

async function openTab() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {
      //  Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error('Chrome does not answer on its debugging port');
}

/** A DevTools client cut down to what this script needs. */
function connect(url, onConsole) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id) pending.get(m.id)?.(m.result);
    if (m.method === 'Runtime.consoleAPICalled') onConsole(m.params.args[0]?.value);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  return new Promise((resolve) => ws.addEventListener('open', () => resolve(send)));
}

const profile = await mkdtemp(path.join(os.tmpdir(), 'bikeshare-chrome-'));
await mkdir(LOGS_DIR, { recursive: true });

let chrome;
try {
  chrome = await launchChrome(profile);
  const logFile = path.join(LOGS_DIR, 'frontend.log');
  const send = await connect(await openTab(), (line) => {
    if (typeof line === 'string' && line.startsWith('{')) {
      console.log(`  log       ${line}`);
      void appendFile(logFile, `${line}\n`);
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');

  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

  /** State of the last action: pending or not, the message shown, and the trace. */
  const state = () => evaluate(`({
    busy: !!document.querySelector('.pending'),
    message: document.querySelector('.success, .failure')?.textContent.trim().replace(/\\s+/g, ' ') ?? '',
    trace: document.querySelector('.trace code')?.textContent ?? '',
  })`);

  const waitForEnd = async (previousTrace) => {
    for (let i = 0; i < 200; i += 1) {
      const s = await state();
      if (s.trace && s.trace !== previousTrace && !s.busy && s.message) return s;
      await sleep(50);
    }
    throw new Error('the action does not finish: are the services listening?');
  };

  await send('Page.navigate', { url: FRONTEND_URL });
  const actions = [{ action: 'refresh (page load)', ...(await waitForEnd('')) }];

  let reference = '';
  for (const { action, row, button } of WALKTHROUGH) {
    const before = (await state()).trace;
    const text = JSON.stringify(row === RENTAL ? reference : row);
    await evaluate(`[...[...document.querySelectorAll('tr')].find((t) => t.textContent.includes(${text}))
      .querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(button)})).click()`);
    const end = await waitForEnd(before);
    reference ||= end.message.match(/R-\d{4}/)?.[0] ?? '';
    actions.push({ action, ...end });
  }

  for (const { action, trace, message } of actions) {
    console.log(`${action.padEnd(36)} ${trace}  ${message}`);
  }
  await writeFile(path.join(LOGS_DIR, 'actions.json'), JSON.stringify(actions, null, 2));
  //  Give the last span batch time to reach the Collector.
  await sleep(1500);
} finally {
  chrome?.kill();
  await sleep(300);
  await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
