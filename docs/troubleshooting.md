# Troubleshooting

**`port 8080 is already in use`.** A service is still running. Run `node scripts/stack.mjs stop`, or stop the process listening on the port.

**`agent missing`.** Run `node scripts/download-agent.mjs`.

**The UI shows `unreachable` while rentals is running.** Look at the CORS preflight in the browser network tab. If it answers 403, `traceparent` is missing from the allowed headers in `CorsConfig`.

**Two traces instead of one, with no error.** Check, in this order: `withFetch()` in `frontend/src/app/app.config.ts`, `propagateTraceHeaderCorsUrls` in `frontend/src/app/core/observability/telemetry-bootstrap.ts`, then `allowedHeaders` in `CorsConfig`.

**The second request of an action starts its own trace.** The call does not go through `action.run(...)`. Without `zone.js`, the active context is lost at the first `await`.

**Jaeger is empty.** `docker compose -f observability/docker-compose.yml logs collector` shows what comes in. Check that `--agent` was passed: the agent writes to standard error at startup.

**Empty `trace_id` in a log line.** The service runs without the agent, or the line was written outside any span.

**A 404 right after fleet starts.** Tomcat listens before fleet has loaded its stations. `stack.mjs` waits until `/stations` answers with data for this reason.

**`verify-functional.mjs` fails on `R-0001`.** The services are not fresh. Run `node scripts/stack.mjs stop`, then `node scripts/stack.mjs start`.

**`Chrome not found: set the CHROME variable`.** Point the `CHROME` environment variable at a Chrome or Chromium binary, or do the clicks by hand.

**`Cannot read properties of null (reading 'edgesOut')`, or `npm ci` rejects the lock file.** `frontend/.npmrc` is missing, or the command was not run from `frontend/`. The file sets `legacy-peer-deps=true`, which works around an npm resolver bug with Vitest's peer dependencies and matches how `package-lock.json` was produced.

**The first `npm test` fails after 60 s without running a test.** Run it again: the first Vitest start sometimes exceeds its timeout.

**The privacy sentinel reports `NO SOURCE INSPECTED`.** There are no files in `logs/` and Jaeger is not reachable.
