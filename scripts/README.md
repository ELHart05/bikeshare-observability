# scripts

Node tools to run, exercise and check the two services and their telemetry.

**Requirements:** Node.js 20.19, 22.12 or 24 and later. Nothing to install: every
script uses the Node standard library only, and runs as is on Windows, macOS and
Linux. Run every command from the repository root.

On macOS, Linux and Git Bash, several scripts also have a `.sh`
wrapper with no logic of its own, for example `sh scripts/scenarios.sh`.

Exit codes are the same everywhere: `0` success, `1` failure, `2` usage error
(or, for `verify-privacy.mjs`, no source inspected).

---

## 1. Running the services

| Script | Usage | What it does |
|---|---|---|
| `download-agent.mjs` | `node scripts/download-agent.mjs [--version <x.y.z>] [--dir <dir>]` | Downloads the OpenTelemetry Java agent from Maven Central (default version `2.32.0`, default directory `.`). Writes to `opentelemetry-javaagent.jar.part` first, then renames, so an interrupted download never leaves a truncated agent. Does nothing if the agent is already there. |
| `start.mjs` | `node scripts/start.mjs <fleet\|rentals> [--agent] [JVM args...]` | Starts one service in the foreground; Ctrl-C stops it. `--agent` attaches the Java agent and exports to the Collector. Extra arguments go to the JVM before `-jar`, for example `-Dfleet.consolidation-ms=1200`. |
| `stack.mjs` | `node scripts/stack.mjs start \| stop \| restart <fleet\|rentals> [JVM args]` | Starts or stops both services in the background with the agent (fleet first, since rentals calls it). JVM output goes to `logs/<service>.out`, the PID to `logs/<service>.pid`. |

Both services write their structured log to `logs/fleet.log` and `logs/rentals.log`.
`FLEET_JAR` overrides the fleet JAR (used to run the instrumented copy built by
`tools/spoon-instrumenter`).

Typical messages:

- `port 8080 is already in use`: another process holds the port; stop it.
- `agent missing, download it`: run `node scripts/download-agent.mjs`.
- `jar missing, build the service`: run `mvn -f <service>/pom.xml clean package`.

---

## 2. Functional checks and scenarios

These need both services running (`Both services must be running` otherwise, exit 1).
They rely on the **initial** fleet state: the databases are in memory and recreated
on every start, so restart both services before running them again.

### `verify-functional.mjs`

```bash
node scripts/verify-functional.mjs
```

The functional baseline: the initial fleet, what the web UI sees, the
open / report / return cycle, and the rejections. Prints one `OK` or `FAIL` line per
check, then `OK: the functional baseline holds (24 checks).` Run it again after any
instrumentation change: instrumentation must not change behaviour. It checks
nothing about telemetry.

### `scenarios.mjs`

```bash
node scripts/scenarios.mjs
```

Plays the seven core scenarios, always in the same order, and prints the status,
duration and observation goal of each:

| # | Scenario | Request | Goal |
|---|---|---|---|
| 1 | happy path | `GET /stations` | the working case, end to end |
| 2 | open a rental | `POST /rentals` at `ST-COMEDIE` | a business milestone the agent cannot see |
| 3 | empty station | `POST /rentals` at `ST-GARE` | a rejection, not an outage |
| 4 | out-of-service station | `POST /rentals` at `ST-PEYROU` | a failure caused by the other service |
| 5 | rejected subscriber | `POST /rentals` with a wrong password | a secret actually sent |
| 6 | rental report | `GET /rentals/{reference}/report` | the slow operation: where does the time go? |
| 7 | return the bike | `POST /rentals/{reference}/return` to `ST-ARCEAUX` | closing: duration and amount |

It ends with the slowest scenario and its duration.

### `extended-scenarios.mjs`

```bash
node scripts/stack.mjs start
node scripts/extended-scenarios.mjs
```

Scenarios 8 to 11. Each request carries a `traceparent` header with a TraceId chosen
by the script, printed next to the result. The script stops and restarts the fleet,
so the services must have been started by `stack.mjs`.

| # | Scenario | Goal |
|---|---|---|
| 8 | unknown station | a 404 decided by the fleet, visible in both logs and on `fleet.pickup` |
| 9 | invalid request | a 400 that never reaches the service; the privacy sentinel shows Spring no longer logs the rejected value |
| 10 | fleet down | the same 503 as scenario 4; only the reason (`fleet_unreachable`) and the missing fleet span tell them apart |
| 11 | slow consolidation (1200 ms) | control experiment: if only `fleet.consolidation` grows, the cause is proven |

Writes `logs/extended-scenarios.json`, mapping each slug (`unknown-station`,
`invalid-request`, `fleet-down`, `slow-consolidation`, `slow-consolidation-baseline`)
to its TraceId.

---

## 3. Telemetry

These need the observability stack (`observability/docker-compose.yml`) and both
services started with the agent.

| Script | Usage | What it does |
|---|---|---|
| `browser.mjs` | `node scripts/browser.mjs` | Drives a headless Chrome over the DevTools protocol through the walkthrough: page load, `rent`, `report (cold)`, `report (warm)`, `return`, `rent (empty station)`, `rent (out-of-service station)`. Copies every JSON console line to `logs/frontend.log` and writes `logs/actions.json` (`{action, busy, message, trace}` per action). Needs the frontend on port 4200. If Chrome is not found (`Chrome not found: set the CHROME variable`), set `CHROME` to its path. |
| `verify-telemetry.mjs` | `node scripts/verify-telemetry.mjs` | Reads `logs/actions.json`, the three logs and Jaeger, and runs 24 checks in six sections: structured logs, agent auto-instrumentation, manual spans, context propagation, log-trace correlation, latency diagnosis. Ends with `OK: all telemetry checks pass on live telemetry.` |
| `read-trace.mjs` | `node scripts/read-trace.mjs --service <name> \| --trace <id> [--all] [--jaeger <url>]` | Prints a trace from Jaeger as a tree: one span per line with its duration, share of the total and service, then the services crossed and the tracers. With `--service`, shows the latest trace (`--all` for every trace). Jaeger defaults to `http://localhost:16686`. |
| `trace-logs.mjs` | `node scripts/trace-logs.mjs --log <file> [--trace <id>]` | Without `--trace`, lists the trace ids found in a log file and how many lines carry each. With it, prints only that trace's lines. Recognizes both the console form `trace_id=...` and the JSON form `"trace_id":"..."`. |
| `correlate.mjs` | `node scripts/correlate.mjs <traceId>` | Puts each log line of a trace (frontend, rentals, fleet) next to the span it was written in, as found in Jaeger. |
| `compare-collector.mjs` | `node scripts/compare-collector.mjs prepare \| measure \| finish` | Collector processing comparison. `prepare` restarts the Collector with an extra raw copy of every span (`observability/comparison/raw.jsonl`); `measure` compares the `rent` trace before and after processing (removed attributes, CORS preflights, size); `finish` restores the normal Collector and deletes the raw copy. |

`read-trace.mjs` shows where the time went; `trace-logs.mjs` shows what the program
said meanwhile. Together they give log-trace correlation.

### `verify-privacy.mjs`

```bash
node scripts/verify-privacy.mjs [--logs <dir>] [--jaeger <url>]
```

The privacy sentinel. The web UI and the scenarios deliberately send the demo
subscriber's password and full email address. The sentinel looks for them in every
text file under `--logs` (default `logs`) and in the raw spans Jaeger holds for every
service. Per source it prints `password=`, `fragment=` (first 8 characters, in case a
framework truncated the secret), `field=` (the word `password`), `address=` and
`domain_only=`. Any password fragment, forbidden field or full address fails the run
(exit 1). The domain alone is allowed. If nothing could be inspected it prints
`NO SOURCE INSPECTED` and exits 2.

The demo subscriber (`camille.rey@example.com`) and password are defined once, in
`scripts/lib.mjs`, because two tools depend on them: the one that sends them and the
one that checks they never come back out.

---

## 4. Capturing evidence

```bash
cd frontend && npm start        # in another terminal
node scripts/capture-evidence.mjs
```

Replays everything from a clean state (about ten minutes) and files the results
under `evidence/`:

| Step | Output |
|---|---|
| Functional check on a fresh stack | `logs/functional-check.txt` |
| Core scenarios, cold then warm | `logs/scenarios-cold.txt`, `logs/scenarios-warm.txt` |
| Browser walkthrough and telemetry checks | `traces/actions.txt`, `traces/telemetry-checks.txt` |
| Collector processing comparison | `collector/before-after.txt` |
| Trace per action | `traces/action-<slug>.txt` |
| Log-trace correlation | `traces/correlation-rent.txt`, `traces/correlation-failure.txt` |
| Extended scenarios | `logs/extended-scenarios.txt`, `traces/scenario-<slug>.txt` |
| Latency diagnosis | `diagnostics/latency-breakdown.txt`, `diagnostics/latency-trace-warm.json` |
| Failure diagnosis | `diagnostics/failure-logs-out-of-service.txt`, `diagnostics/failure-trace-out-of-service.txt` / `.json` |
| Metrics | `metrics/prometheus.txt` |
| Rentals by station, from logs | `diagnostics/rentals-by-station.txt` |
| Spoon vs hand-written instrumentation | `instrumenter/spoon-vs-manual.txt` (skipped if the instrumented copy is not built) |
| Privacy sentinel on everything produced | `logs/privacy-sentinel.txt` |
| Raw service logs | `logs/frontend.log`, `logs/rentals.log`, `logs/fleet.log` |

Any failing step stops the run.

---

## 5. Expected functional values

On a freshly started fleet.

### Initial fleet

6 stations, 25 bikes, 21 of them available.

| Code | Name | Docks | Available | Maintenance | Status |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `ST-ARCEAUX` | Les Arceaux | 12 | 4 | 1 | open |
| `ST-COMEDIE` | Place de la Comédie | 20 | 7 | 0 | open |
| `ST-GARE` | Gare Saint-Roch | 16 | 0 | 2 | no bikes |
| `ST-MOSSON` | Mosson | 10 | 3 | 0 | open |
| `ST-PEYROU` | Promenade du Peyrou | 8 | 5 | 0 | **out of service** |
| `ST-TRIOLET` | Campus Triolet | 14 | 2 | 1 | open |

Bikes are numbered `B-0001` to `B-0025`, assigned station by station in code order,
available bikes before those in maintenance.

A station is **rentable** when it is not out of service and has at least one
available bike: `ST-ARCEAUX`, `ST-COMEDIE`, `ST-MOSSON`, `ST-TRIOLET`.

### Rental lifecycle

- `POST /rentals` `{ stationCode: "ST-COMEDIE", email, password }`
  returns **201**: reference `R-0001`, bike `B-0006`, status `ACTIVE`.
  The bike picked up is always the **first** available one at the station, by id.
  References are assigned in opening order: `R-0001`, `R-0002`, ...

- `GET /rentals/R-0001/report`
  returns **200**: `turnoverIndex` 100, `rentalsFromStation` 1.
  The turnover index is the share of the station's bikes that are available, in
  percent. On the initial fleet: `ST-ARCEAUX` 80, `ST-COMEDIE` 100, `ST-GARE` 0,
  `ST-MOSSON` 100, `ST-PEYROU` 100, `ST-TRIOLET` 67.

- `POST /rentals/R-0001/return` `{ stationCode: "ST-ARCEAUX" }`
  returns **200**: `durationMinutes` 1, `amount` 1.05, status `CLOSED`.
  Fare: 1.00 EUR base fee plus 0.05 EUR per **started** minute, with a one-minute
  minimum. A rental opened and returned within the same minute costs 1.05 EUR; ten
  minutes and one second cost 1.55 EUR (11 minutes billed).

### Rejections

| Action | Status | Reason |
| :--- | :---: | :--- |
| Open at `ST-GARE` | **409** | no bike available |
| Open at `ST-PEYROU` | **503** | station out of service |
| Open at `ST-NOWHERE` | **404** | station unknown to the fleet |
| Open with a wrong password | **401** | invalid credentials |
| Return an unknown reference | **404** | rental not found |
| Return twice | **409** | rental already closed |

Error bodies follow the RFC 9457 `ProblemDetail` format: a JSON object with
`status`, `title` and `detail`.

A **rejection** by the fleet stays a conflict (409), while fleet **unavailability**
becomes unavailability of the rentals service (503). A caller that only saw a 500
could not tell which of the two services is at fault.

### Durations

On an ordinary desktop machine, once the JVMs are warm, six of the seven core
scenarios answer within a few tens of milliseconds. The first run after a start pays
for JVM warm-up (opening the first rental can take about a second). The sixth (the report) takes about 500 ms, and that duration is
**fixed**: it depends neither on the machine nor on the number of rentals.
