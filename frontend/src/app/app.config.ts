/**
 * Application providers.
 *
 * <ol>
 *   <li><b>configuration</b> is an injectable token, not a constant
 *       copied into feature code;</li>
 *   <li><b>HttpClient</b> is provided with <code>withFetch()</code>, so the
 *       transport is <code>fetch</code>, not <code>XMLHttpRequest</code>.
 *       That is the transport the telemetry instruments: removing
 *       <code>withFetch()</code> would break the trace without any error;</li>
 *   <li><b>telemetry</b> starts before the first render.</li>
 * </ol>
 */
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { APP_CONFIGURATION, defaultConfiguration } from './core/configuration';
import { TelemetryBootstrap } from './core/observability/telemetry-bootstrap';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: APP_CONFIGURATION, useFactory: () => defaultConfiguration() },
    provideHttpClient(withFetch()),
    provideAppInitializer(() => inject(TelemetryBootstrap).start()),
  ],
};
