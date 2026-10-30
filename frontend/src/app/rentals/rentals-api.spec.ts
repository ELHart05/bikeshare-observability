/**
 * Backend access: routes, payloads, failures.
 *
 * <p><code>provideHttpClientTesting</code> replaces the transport,
 * and <code>HttpTestingController</code> lets us assert what
 * went out and what came back.</p>
 */
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIGURATION } from '../core/configuration';
import { RentalsApi } from './rentals-api';
import { RentalRequest, ReturnRequest } from './rentals-models';

const BACKEND = 'http://backend.test';

describe('RentalsApi', () => {
  let api: RentalsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: APP_CONFIGURATION,
          useValue: {
            rentalsUrl: BACKEND,
            serviceName: 'bikeshare-frontend',
            serviceVersion: 'test',
          },
        },
      ],
    });
    api = TestBed.inject(RentalsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads stations from GET /stations', async () => {
    const promise = firstValueFrom(api.stations());
    const expected = [
      {
        code: 'ST-COMEDIE',
        name: 'Place de la Comédie',
        capacity: 20,
        availableBikes: 7,
        outOfService: false,
        rentable: true,
      },
    ];
    const req = httpMock.expectOne(`${BACKEND}/stations`);

    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(await promise).toEqual(expected);
  });

  it('reads rentals from GET /rentals', async () => {
    const promise = firstValueFrom(api.rentals());
    const req = httpMock.expectOne(`${BACKEND}/rentals`);

    expect(req.request.method).toBe('GET');
    req.flush([]);
    expect(await promise).toEqual([]);
  });

  it('posts a request that deliberately carries the secret', async () => {
    const promise = firstValueFrom(api.openRental('ST-COMEDIE'));
    const req = httpMock.expectOne(`${BACKEND}/rentals`);

    expect(req.request.method).toBe('POST');

    // The secret MUST be sent.
    // That makes its absence from logs and spans verifiable.
    const sent = req.request.body as RentalRequest;
    expect(sent.stationCode).toBe('ST-COMEDIE');
    expect(sent.password).toBeTruthy();
    expect(sent.email).toContain('@');

    req.flush({ reference: 'R-0001', bikeId: 'B-0006' });
    expect((await promise).reference).toBe('R-0001');
  });

  it('posts the return station when returning', async () => {
    const promise = firstValueFrom(api.returnRental('R-0001', 'ST-ARCEAUX'));
    const req = httpMock.expectOne(`${BACKEND}/rentals/R-0001/return`);

    expect(req.request.method).toBe('POST');
    expect((req.request.body as ReturnRequest).stationCode).toBe('ST-ARCEAUX');

    req.flush({ reference: 'R-0001', durationMinutes: 1, amount: 1.05 });
    expect((await promise).amount).toBe(1.05);
  });

  it('reads the report from GET /rentals/{reference}/report', async () => {
    const promise = firstValueFrom(api.report('R-0001'));
    const req = httpMock.expectOne(`${BACKEND}/rentals/R-0001/report`);

    expect(req.request.method).toBe('GET');
    req.flush({ reference: 'R-0001', startStation: 'ST-COMEDIE', turnoverIndex: 100, rentalsFromStation: 1 });
    expect((await promise).turnoverIndex).toBe(100);
  });

  it('passes HTTP failures through untranslated', async () => {
    const promise = firstValueFrom(api.openRental('ST-PEYROU'));
    httpMock
      .expectOne(`${BACKEND}/rentals`)
      .flush({ detail: 'station out of service: ST-PEYROU' },
             { status: 503, statusText: 'x' });
    //  The API layer builds no error message.
    //  It lets the failure through to rentals-errors.ts, which translates it.
    await expect(promise).rejects.toBeInstanceOf(HttpErrorResponse);
  });
});
