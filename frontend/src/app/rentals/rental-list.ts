/**
 * The rentals table.
 *
 * <p>A display component, like {@link StationList},
 * that receives rentals and emits what the user asks for.</p>
 */
import {
  ChangeDetectionStrategy,
  Component,
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

  /** Default return station (the first one that has a free dock). */
  returnStationFor(rental: Rental): string {
    const candidate = this.stations().find(
      (s) => !s.outOfService && s.code !== rental.startStation,
    );
    return candidate ? candidate.code : rental.startStation;
  }
}
