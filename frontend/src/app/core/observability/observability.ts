/**
 * Observability as the application sees it.
 *
 * <p>This file imports only the stable `@opentelemetry/api`, never the SDK.
 * Without {@link TelemetryBootstrap}, as in tests, these calls do nothing.</p>
 */
import { Injectable } from '@angular/core';
import { context, Span, SpanStatusCode, trace } from '@opentelemetry/api';

/** What a span attribute value can be here. */
export type SpanAttributes = Record<string, string | number>;

/** A user action in progress: a span, and what is needed to attach to it. */
export interface UserAction {
  readonly traceId: string;
  readonly spanId: string;

  /**
   * Runs work in the action's context.
   *
   * <p>This is what keeps every call of an action in the same trace.
   * Without `zone.js`, the browser's active context is lost at the first `await`.
   * `refresh`, `rent` and `returnBike` chain several requests: the second
   * would go out without a parent and start a trace of its own.
   * So we do not rely on the active context; we restore it before each call.</p>
   */
  run<T>(work: () => T): T;

  /** Marks the action as failed, with what is needed to find it again. */
  fail(message: string, attributes: SpanAttributes): void;
}

@Injectable({ providedIn: 'root' })
export class Observability {
  /**
   * Runs work in a span named after the user action, not after the request.
   *
   * <p>One click can send three requests: the `fetch` instrumentation
   * sees three and does not know there was only one click.</p>
   */
  async withAction<T>(
    name: string,
    attributes: SpanAttributes,
    work: (action: UserAction) => Promise<T>,
  ): Promise<T> {
    const span = trace
      .getTracer('io.github.elhart05.bikeshare.frontend', '1.0.0')
      .startSpan(name, { attributes });
    try {
      return await work(this.actionOf(span));
    } finally {
      span.end();
    }
  }

  private actionOf(span: Span): UserAction {
    const ctx = trace.setSpan(context.active(), span);
    const { traceId, spanId } = span.spanContext();
    return {
      traceId,
      spanId,
      run: (work) => context.with(ctx, work),
      fail: (message, attributes) => {
        span.setAttributes(attributes);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
      },
    };
  }
}
