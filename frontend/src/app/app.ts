/**
 * The application shell: a title and the page.
 *
 * <p>No router, since there is only one page.</p>
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { RentalsPage } from './rentals/rentals-page';

@Component({
  selector: 'app-root',
  imports: [RentalsPage],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
