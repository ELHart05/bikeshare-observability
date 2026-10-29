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
}
