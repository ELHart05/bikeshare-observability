/**
 * Failures.
 *
 * <p>Without this file, every action in the application would end up with
 * its own <code>if (status === 503)</code>.</p>
 *
 * <p>Failures fall into three categories.</p>
 */
import { HttpErrorResponse } from '@angular/common/http';

export type FailureCategory =
  /** The service did not answer: stopped, unreachable, CORS refused. */
  | 'unreachable'
  /** It answered, and it said no. That is a response, not an outage. */
  | 'rejected'
  /** Neither: the fault is on our side. */
  | 'unexpected';

export interface Failure {
  readonly category: FailureCategory;
  readonly message: string;
  /** Present only when the service answered. */
  readonly status?: number;
}

/** The services return their errors as ProblemDetail (RFC 9457). */
interface ProblemDetail {
  detail?: string;
  title?: string;
}

export function toFailure(cause: unknown): Failure {
  if (cause instanceof HttpErrorResponse) {
    //  Status 0 means the response never reached us: service stopped,
    //  network down, or CORS preflight refused.
    //  Treating it as an application error makes the diagnosis wrong.
    if (cause.status === 0) {
      return {
        category: 'unreachable',
        message:
          'rentals service unreachable: check that it is listening on port 8080',
      };
    }
    const body = cause.error as ProblemDetail | string | null;
    const detail =
      typeof body === 'object' && body !== null
        ? (body.detail ?? body.title)
        : undefined;
    return {
      category: 'rejected',
      message: detail ?? `the service responded ${cause.status}`,
      status: cause.status,
    };
  }
  return {
    category: 'unexpected',
    message: cause instanceof Error ? cause.message : String(cause),
  };
}
