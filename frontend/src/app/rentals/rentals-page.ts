/**
 * The page.
 * It wires the state to the two tables.
 *
 * <p>It holds no rules.
 * It loads the state on first display,
 * forwards actions to the store,
 * and shows the result of the latest action.</p>
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';

import { APP_CONFIGURATION } from '../core/configuration';
import { RentalList, ReturnSelection } from './rental-list';
import { RentalsStore } from './rentals-store';
import { StationList } from './station-list';

@Component({
  selector: 'app-rentals-page',
  imports: [StationList, RentalList],
  templateUrl: './rentals-page.html',
  styleUrl: './rentals-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RentalsPage implements OnInit {
  private readonly store = inject(RentalsStore);
  private readonly jaegerUrl = inject(APP_CONFIGURATION).jaegerUrl;

  readonly stations = this.store.stations;
  readonly rentals = this.store.rentals;
  readonly report = this.store.report;
  readonly result = this.store.result;
  readonly busy = this.store.busy;
  readonly trace = this.store.trace;

  readonly traceUrl = computed(() => `${this.jaegerUrl}/trace/${this.trace()}`);
  readonly copied = signal(false);

  /** Name of the report's start station, when the station list has it. */
  readonly reportStation = computed(
    () => this.stations().find((s) => s.code === this.report()?.startStation)?.name,
  );

  ngOnInit(): void {
    void this.store.refresh();
  }

  refresh(): void {
    void this.store.refresh();
  }

  rent(stationCode: string): void {
    void this.store.rent(stationCode);
  }

  returnBike(selection: ReturnSelection): void {
    void this.store.returnBike(selection.reference, selection.stationCode);
  }

  viewReport(reference: string): void {
    void this.store.viewReport(reference);
  }

  copyTrace(): void {
    navigator.clipboard?.writeText(this.trace()).then(
      () => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1500);
      },
      () => {},
    );
  }
}
