/**
 * What telemetry requires from the store, without a Collector or network.
 *
 * <p>The first test is the one that matters: with the browser context manager,
 * only `UserAction.run` keeps a second request in the click's trace.
 * If someone removes it, everything keeps working except the trace.</p>
 */
import { TestBed } from '@angular/core/testing';
import { context, ROOT_CONTEXT, Span, trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { StackContextManager } from '@opentelemetry/sdk-trace-web';
import { HttpErrorResponse } from '@angular/common/http';
import { defer, of, throwError } from 'rxjs';

import { RentalsApi } from './rentals-api';
import { RentalsStore } from './rentals-store';
import { Rental, Station } from './rentals-models';

const RENTAL: Rental = {
  reference: 'R-0001',
  bikeId: 'B-0006',
  startStation: 'ST-COMEDIE',
  endStation: null,
  durationMinutes: 0,
  amount: null,
  status: 'ACTIVE',
};

/** Records the active span at the moment each request would actually go out. */
function observe<T>(seen: (Span | undefined)[], response: T) {
  return defer(() => {
    seen.push(trace.getSpan(context.active()));
    return of(response);
  });
}

describe('RentalsStore telemetry', () => {
  const exporter = new InMemorySpanExporter();

  beforeAll(() => {
    context.setGlobalContextManager(new StackContextManager().enable());
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
    );
  });

  afterAll(() => {
    context.disable();
    trace.disable();
  });

  beforeEach(() => exporter.reset());

  function setup(api: Partial<RentalsApi>) {
    TestBed.configureTestingModule({ providers: [{ provide: RentalsApi, useValue: api }] });
    return TestBed.inject(RentalsStore);
  }

  it('keeps every request of an action in the action span, even after an await', async () => {
    const seen: (Span | undefined)[] = [];
    const store = setup({
      openRental: () => observe(seen, RENTAL),
      stations: () => observe(seen, [] as Station[]),
      rentals: () => observe(seen, [RENTAL]),
    });

    await store.rent('ST-COMEDIE');

    const [span] = exporter.getFinishedSpans();
    expect(exporter.getFinishedSpans().map((s) => s.name)).toEqual(['action.rent']);
    expect(seen).toHaveLength(3);
    seen.forEach((s) => expect(s?.spanContext().spanId).toBe(span.spanContext().spanId));
    expect(context.active()).toBe(ROOT_CONTEXT);
  });

  it('exposes the action trace id', async () => {
    const store = setup({ stations: () => of([]), rentals: () => of([]) });

    await store.refresh();

    expect(store.trace()).toBe(exporter.getFinishedSpans()[0].spanContext().traceId);
    expect(store.trace()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('marks the span as error and logs a line with the same trace_id', async () => {
    const lines: string[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((l) => void lines.push(l));
    const store = setup({
      openRental: () =>
        throwError(
          () => new HttpErrorResponse({ status: 503, error: { detail: 'station out of service' } }),
        ),
    });

    await store.rent('ST-PEYROU');
    warnSpy.mockRestore();

    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(2);
    expect(span.attributes['bikeshare.failure.http_status']).toBe(503);
    const line = JSON.parse(lines[0]);
    expect(line.message).toBe('action.failed');
    expect(line.trace_id).toBe(span.spanContext().traceId);
    expect(line.span_id).toBe(span.spanContext().spanId);
  });

  it('never logs the request payload', async () => {
    const lines: unknown[][] = [];
    const info = vi.spyOn(console, 'info').mockImplementation((...l) => void lines.push(l));
    const store = setup({
      openRental: () => of(RENTAL),
      stations: () => of([]),
      rentals: () => of([]),
    });

    await store.rent('ST-COMEDIE');
    info.mockRestore();

    const output = JSON.stringify(lines);
    expect(lines).toHaveLength(1);
    expect(output).not.toContain('camille');
    expect(output).not.toContain('password');
  });
});
