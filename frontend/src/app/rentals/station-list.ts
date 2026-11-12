/**
 * The stations table.
 *
 * <p>A display component that receives stations
 * and emits a code on click.
 * It knows neither the backend nor the global state.</p>
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { Station } from './rentals-models';

@Component({
  selector: 'app-station-list',
  templateUrl: './station-list.html',
  styleUrl: './station-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StationList {
  readonly stations = input.required<readonly Station[]>();
  readonly busy = input(false);
  readonly rent = output<string>();

  /** Widest station, so that every strip takes the same room. */
  readonly maxCapacity = computed(() => Math.max(0, ...this.stations().map((s) => s.capacity)));

  /** One entry per dock, true when a bike sits in it: the dock strip. */
  docks(station: Station): boolean[] {
    return Array.from({ length: station.capacity }, (_, i) => i < station.availableBikes);
  }
}
