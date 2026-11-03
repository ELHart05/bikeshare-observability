/**
 * Browser telemetry startup.
 *
 * <p>This is the only file that imports the SDK, the exporter and the
 * instrumentation. OpenTelemetry documents browser instrumentation as
 * experimental, and these packages change between versions: when they do,
 * this is the only place to update.</p>
 *
 * <p>Only traces go to the Collector.
 * OpenTelemetry logs for JavaScript are still in development:
 * the browser logs to its console (see {@link BrowserLogger}).</p>
 */
import { inject, Injectable } from '@angular/core';
import { FetchInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/fetch';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { APP_CONFIGURATION } from '../configuration';

@Injectable({ providedIn: 'root' })
export class TelemetryBootstrap {
  private readonly configuration = inject(APP_CONFIGURATION);

  /** Called before the first render: instrumentation installed after a `fetch` does not see it. */
  start(): void {
    const { serviceName, serviceVersion, otlpTracesUrl, rentalsUrl } = this.configuration;

    const provider = new WebTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: serviceVersion,
      }),
      spanProcessors: [
        new BatchSpanProcessor(new OTLPTraceExporter({ url: otlpTracesUrl }), {
          scheduledDelayMillis: 500,
        }),
      ],
    });
    provider.register();

    registerInstrumentations({
      tracerProvider: provider,
      instrumentations: [
        new FetchInstrumentation({
          //  The exporter sends its batches with `fetch`: without this exclusion,
          //  every export would produce a span, and so another export.
          ignoreUrls: [new RegExp('^' + otlpTracesUrl)],
          //  To another origin, `traceparent` is only added when explicitly allowed.
          //  Without this line: two traces instead of one, and no error.
          propagateTraceHeaderCorsUrls: [new RegExp('^' + rentalsUrl)],
        }),
      ],
    });
  }
}
