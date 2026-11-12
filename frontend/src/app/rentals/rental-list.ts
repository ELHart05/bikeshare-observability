/**
 * The rentals table.
 *
 * <p>A display component, like {@link StationList},
 * that receives rentals and emits what the user asks for.</p>
 */
import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { Rental, Station } from './rentals-models';

/** What a return needs: which rental, and to which station. */
export interface ReturnSelection {
  reference: string;
  stationCode: string;
}

@Component({
  selector: 'app-rental-list',
  imports: [DecimalPipe],
  templateUrl: './rental-list.html',
  styleUrl: './rental-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RentalList {
  readonly rentals = input.required<readonly Rental[]>();
  readonly stations = input.required<readonly Station[]>();
  readonly busy = input(false);

  readonly returnBike = output<ReturnSelection>();
  readonly report = output<string>();

  /** Active rentals first, then closed ones, each in the service's order. */
  readonly ordered = computed(() => [
    ...this.rentals().filter((r) => r.status === 'ACTIVE'),
    ...this.rentals().filter((r) => r.status !== 'ACTIVE'),
  ]);

  /** Default return station (the first one that has a free dock). */
  returnStationFor(rental: Rental): string {
    const candidate = this.stations().find(
      (s) => !s.outOfService && s.code !== rental.startStation,
    );
    return candidate ? candidate.code : rental.startStation;
  }

  nameOf(code: string): string {
    return this.stations().find((s) => s.code === code)?.name ?? code;
  }
}
