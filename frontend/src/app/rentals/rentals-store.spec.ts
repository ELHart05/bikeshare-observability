/**
 * Application state, tested without a network.
 *
 * <p>The store depends only on {@link RentalsApi}.
 * A few-line fake is enough to drive it,
 * including its failure cases.</p>
 */
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { RentalsApi } from './rentals-api';
import { RentalsStore } from './rentals-store';
import { Rental, Station } from './rentals-models';

const STATIONS: Station[] = [
  {
    code: 'ST-COMEDIE',
    name: 'Place de la Comédie',
    capacity: 20,
    availableBikes: 7,
    outOfService: false,
    rentable: true,
  },
  {
    code: 'ST-PEYROU',
    name: 'Promenade du Peyrou',
    capacity: 8,
    availableBikes: 5,
    outOfService: true,
    rentable: false,
  },
];

const ACTIVE: Rental = {
  reference: 'R-0001',
  bikeId: 'B-0006',
  startStation: 'ST-COMEDIE',
  endStation: null,
  durationMinutes: 0,
  amount: null,
  status: 'ACTIVE',
};

const CLOSED: Rental = {
  ...ACTIVE,
  endStation: 'ST-ARCEAUX',
  durationMinutes: 1,
  amount: 1.05,
  status: 'CLOSED',
};

function setup(api: Partial<RentalsApi>) {
  TestBed.configureTestingModule({
    providers: [{ provide: RentalsApi, useValue: api }],
  });
  return TestBed.inject(RentalsStore);
}

describe('RentalsStore', () => {
  it('starts idle', () => {
    const store = setup({});
    expect(store.result().state).toBe('idle');
    expect(store.stations()).toEqual([]);
    expect(store.rentals()).toEqual([]);
    expect(store.report()).toBeNull();
    expect(store.busy()).toBe(false);
  });

  it('loads stations and rentals and counts rentable stations', async () => {
    const store = setup({
      stations: () => of(STATIONS),
      rentals: () => of([ACTIVE]),
    });

    await store.refresh();

    expect(store.stations()).toEqual(STATIONS);
    expect(store.rentals()).toEqual([ACTIVE]);
    expect(store.result()).toEqual({
      state: 'success',
      message: '2 stations, 1 rentable',
    });
    expect(store.busy()).toBe(false);
  });

  it('treats only unclosed rentals as active', async () => {
    const store = setup({
      stations: () => of(STATIONS),
      rentals: () => of([ACTIVE, CLOSED]),
    });

    await store.refresh();

    expect(store.activeRentals()).toEqual([ACTIVE]);
  });

  it('announces reference and bike after renting', async () => {
    const store = setup({
      stations: () => of(STATIONS),
      rentals: () => of([ACTIVE]),
      openRental: () => of(ACTIVE),
    });

    await store.rent('ST-COMEDIE');

    const result = store.result();
    expect(result.state).toBe('success');
    if (result.state === 'success') {
      expect(result.message).toContain('R-0001');
      expect(result.message).toContain('B-0006');
    }
  });

  it('announces duration and amount after a return', async () => {
    const store = setup({
      stations: () => of(STATIONS),
      rentals: () => of([CLOSED]),
      returnRental: () => of(CLOSED),
    });

    await store.returnBike('R-0001', 'ST-ARCEAUX');

    const result = store.result();
    if (result.state === 'success') {
      expect(result.message).toContain('1 min');
      expect(result.message).toContain('1.05');
    } else {
      throw new Error('the return should have succeeded');
    }
  });

  it('publishes the received report', async () => {
    const store = setup({
      report: () =>
        of({
          reference: 'R-0001',
          startStation: 'ST-COMEDIE',
          turnoverIndex: 100,
          rentalsFromStation: 2,
        }),
    });

    await store.viewReport('R-0001');

    expect(store.report()?.turnoverIndex).toBe(100);
  });

  it('turns a service rejection into a readable failure', async () => {
    const store = setup({
      openRental: () =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: 503,
              error: { detail: 'station out of service: ST-PEYROU' },
            }),
        ),
    });

    await store.rent('ST-PEYROU');

    const result = store.result();
    expect(result.state).toBe('failure');
    if (result.state === 'failure') {
      expect(result.failure.category).toBe('rejected');
      expect(result.failure.status).toBe(503);
      expect(result.failure.message).toContain('out of service');
    }
    expect(store.busy()).toBe(false);
  });

  it('tells an unreachable service from a rejection', async () => {
    const store = setup({
      stations: () => throwError(() => new HttpErrorResponse({ status: 0 })),
    });

    await store.refresh();

    const result = store.result();
    if (result.state === 'failure') {
      expect(result.failure.category).toBe('unreachable');
    } else {
      throw new Error('a stopped service should produce a failure');
    }
  });

  it('always clears busy, even on failure', async () => {
    const store = setup({
      report: () => throwError(() => new HttpErrorResponse({ status: 500 })),
    });

    await store.viewReport('R-0001');

    expect(store.busy()).toBe(false);
  });
});
