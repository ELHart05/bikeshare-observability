/**
 * The browser log: one JSON line per event, on the console.
 *
 * <p>On the Java side, the agent puts `trace_id` into the logger context.
 * Nobody does that here, and the active context is already lost by the time
 * we log, since that is almost always after a response.
 * So the action, which holds its ids from the click onward, passes them in.</p>
 */
import { Injectable } from '@angular/core';

import { UserAction } from './observability';

type Level = 'info' | 'warn' | 'error';

@Injectable({ providedIn: 'root' })
export class BrowserLogger {
  write(level: Level, event: string, action: UserAction, fields: Record<string, unknown>): void {
    console[level](
      JSON.stringify({
        '@timestamp': new Date().toISOString(),
        level: level.toUpperCase(),
        message: event,
        ...fields,
        trace_id: action.traceId,
        span_id: action.spanId,
      }),
    );
  }
}
