/**
 * Access to the rentals service.
 *
 * <p>No state and no user-facing messages.
 * This layer knows routes and types;
 * it does not know why it is called.</p>
 *
 * <p>It is the only place in the application that knows the backend
 * address, and the only one that handles {@link RentalRequest}.</p>
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIGURATION } from '../core/configuration';
import {
  Rental,
  RentalRequest,
  Report,
  ReturnRequest,
  Station,
} from './rentals-models';

/**
 * The subscriber and their password.
 *
 * <p>These are <b>demo</b> values.</p>
 */
export const SUBSCRIBER_EMAIL = 'camille.rey@example.com';
export const SUBSCRIBER_PASSWORD = 'Zx9!Vole-Tandem';

@Injectable({ providedIn: 'root' })
export class RentalsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(APP_CONFIGURATION).rentalsUrl;

  stations(): Observable<Station[]> {
    return this.http.get<Station[]>(`${this.base}/stations`);
  }

  rentals(): Observable<Rental[]> {
    return this.http.get<Rental[]>(`${this.base}/rentals`);
  }

  openRental(stationCode: string): Observable<Rental> {
    const request: RentalRequest = {
      stationCode,
      email: SUBSCRIBER_EMAIL,
      password: SUBSCRIBER_PASSWORD,
    };
    return this.http.post<Rental>(`${this.base}/rentals`, request);
  }

  returnRental(reference: string, stationCode: string): Observable<Rental> {
    const request: ReturnRequest = { stationCode };
    return this.http.post<Rental>(
      `${this.base}/rentals/${reference}/return`,
      request,
    );
  }

  report(reference: string): Observable<Report> {
    return this.http.get<Report>(`${this.base}/rentals/${reference}/report`);
  }
}
