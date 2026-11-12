/**
 * Application configuration: one place for infrastructure constants.
 *
 * <p>No URL is hard-coded in feature code.</p>
 *
 * <p>The mechanism Angular currently recommends:
 * an <code>InjectionToken</code> provided by the application.</p>
 */
import { InjectionToken } from '@angular/core';

export interface AppConfiguration {
  /** Origin of the rentals service (the only service the browser calls). */
  readonly rentalsUrl: string;

  /** Where browser telemetry goes: the Collector, never Jaeger. */
  readonly otlpTracesUrl: string;

  /** Identity of this application. */
  readonly serviceName: string;

  readonly serviceVersion: string;

  /** Jaeger UI, for the "Open in Jaeger" link next to each trace id. */
  readonly jaegerUrl: string;
}

export const APP_CONFIGURATION = new InjectionToken<AppConfiguration>(
  'app configuration',
);

export function defaultConfiguration(): AppConfiguration {
  return {
    rentalsUrl: 'http://localhost:8080',
    otlpTracesUrl: 'http://localhost:4318/v1/traces',
    serviceName: 'bikeshare-frontend',
    serviceVersion: '1.0.0',
    jaegerUrl: 'http://localhost:16686',
  };
}
