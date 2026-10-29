/**
 * Application state and its four actions.
 *
 * <p>This is the browser's application layer.
 * It knows what the user wants to do,
 * chains the calls to the backend,
 * and turns the result into displayable state.
 * It does not know the DOM.</p>
 *
 * <p>Components only display what it exposes and call its methods;
 * no component calls {@link RentalsApi} directly.</p>
 *
 * <p>So this is where an action's span starts and where the browser log is
 * written: lower down there are only requests, and higher up only DOM.</p>
 */
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { BrowserLogger } from '../core/observability/browser-logger';
import { Observability, SpanAttributes, UserAction } from '../core/observability/observability';
import { Failure, toFailure } from './rentals-errors';
import { RentalsApi } from './rentals-api';
import { Rental, Report, Station } from './rentals-models';

export type ActionResult =
  | { readonly state: 'idle' }
  | { readonly state: 'success'; readonly message: string }
  | { readonly state: 'failure'; readonly failure: Failure };

@Injectable({ providedIn: 'root' })
export class RentalsStore {
  private readonly api = inject(RentalsApi);
  private readonly observability = inject(Observability);
  private readonly logger = inject(BrowserLogger);

  private readonly _stations = signal<readonly Station[]>([]);
  private readonly _rentals = signal<readonly Rental[]>([]);
  private readonly _report = signal<Report | null>(null);
  private readonly _result = signal<ActionResult>({ state: 'idle' });
  private readonly _busy = signal(false);
  private readonly _trace = signal('');

  readonly stations = this._stations.asReadonly();
  readonly rentals = this._rentals.asReadonly();
  readonly report = this._report.asReadonly();
  readonly result = this._result.asReadonly();
  readonly busy = this._busy.asReadonly();

  /** Trace id of the latest action: the one to look up in Jaeger. */
  readonly trace = this._trace.asReadonly();

  readonly activeRentals = computed(() =>
    this._rentals().filter((r) => r.status === 'ACTIVE'),
  );

  // The four actions

  /** Loads stations, then rentals (the page's initial state). */
  refresh(): Promise<void> {
    return this.runAction('action.refresh', {}, async (action) => {
      const stations = await this.call(action, this.api.stations());
      const rentals = await this.call(action, this.api.rentals());
      this._stations.set(stations);
      this._rentals.set(rentals);
      const rentable = stations.filter((s) => s.rentable).length;
      return `${stations.length} stations, ${rentable} rentable`;
    });
  }

  rent(stationCode: string): Promise<void> {
    const attributes = { 'bikeshare.rental.start_station': stationCode };
    return this.runAction('action.rent', attributes, async (action) => {
      const rental = await this.call(action, this.api.openRental(stationCode));
      this.logger.write('info', 'action.rent_confirmed', action, {
        'bikeshare.rental.reference': rental.reference,
        'bikeshare.bike.id': rental.bikeId,
        'bikeshare.rental.start_station': stationCode,
      });
      await this.reload(action);
      return `rental ${rental.reference} opened: bike ${rental.bikeId}`;
    });
  }

  returnBike(reference: string, stationCode: string): Promise<void> {
    const attributes = {
      'bikeshare.rental.reference': reference,
      'bikeshare.rental.end_station': stationCode,
    };
    return this.runAction('action.return', attributes, async (action) => {
      const rental = await this.call(action, this.api.returnRental(reference, stationCode));
      this.logger.write('info', 'action.return_confirmed', action, {
        'bikeshare.rental.reference': rental.reference,
        'bikeshare.rental.duration_minutes': rental.durationMinutes,
        'bikeshare.rental.amount_eur': rental.amount,
      });
      await this.reload(action);
      return (
        `rental ${rental.reference} closed: ${rental.durationMinutes} min, ` +
        `${rental.amount} €`
      );
    });
  }

  /** The slow action. */
  viewReport(reference: string): Promise<void> {
    const attributes = { 'bikeshare.rental.reference': reference };
    return this.runAction('action.view_report', attributes, async (action) => {
      const report = await this.call(action, this.api.report(reference));
      this._report.set(report);
      return `report for ${report.reference} ready`;
    });
  }

  // The wrapper

  /**
   * A user action: a busy state while the work runs, a result,
   * and possibly a translated failure.
   */
  private async runAction(
    name: string,
    attributes: SpanAttributes,
    work: (action: UserAction) => Promise<string>,
  ): Promise<void> {
    this._busy.set(true);
    this._result.set({ state: 'idle' });
    await this.observability.withAction(name, attributes, async (action) => {
      this._trace.set(action.traceId);
      try {
        this._result.set({ state: 'success', message: await work(action) });
      } catch (cause) {
        const failure = toFailure(cause);
        this.reportFailure(name, action, failure);
        this._result.set({ state: 'failure', failure });
      } finally {
        this._busy.set(false);
      }
    });
  }

  /**
   * A service rejection is a WARN: it answered, the application carries on.
   * Anything else is an ERROR: nothing will get through until someone looks.
   */
  private reportFailure(name: string, action: UserAction, failure: Failure): void {
    const fields = {
      'bikeshare.failure.category': failure.category,
      'bikeshare.failure.http_status': failure.status ?? 0,
    };
    action.fail(failure.message, fields);
    const level = failure.category === 'rejected' ? 'warn' : 'error';
    this.logger.write(level, 'action.failed', action, {
      'bikeshare.action.name': name,
      ...fields,
      'bikeshare.failure.message': failure.message,
    });
  }

  /** Reloads stations and rentals after an action that changes them. */
  private async reload(action: UserAction): Promise<void> {
    this._stations.set(await this.call(action, this.api.stations()));
    this._rentals.set(await this.call(action, this.api.rentals()));
  }

  /** `firstValueFrom` subscribes immediately: the `fetch` starts in the action's context. */
  private call<T>(action: UserAction, source: Observable<T>): Promise<T> {
    return action.run(() => firstValueFrom(source));
  }
}
