/**
 * What the application handles in the browser.
 *
 * <p>TypeScript types, not classes: nothing here has behaviour.</p>
 *
 * <p>Two families: what the application <b>receives</b> and what it <b>sends</b>.</p>
 */

export interface Station {
  code: string;
  name: string;
  capacity: number;
  availableBikes: number;
  outOfService: boolean;
  /** True when a pickup can succeed (decided by the service). */
  rentable: boolean;
}

export type RentalStatus = 'ACTIVE' | 'CLOSED';

export interface Rental {
  reference: string;
  bikeId: string;
  startStation: string;
  endStation: string | null;
  durationMinutes: number;
  amount: number | null;
  status: RentalStatus;
}

export interface Report {
  reference: string;
  startStation: string;
  turnoverIndex: number;
  rentalsFromStation: number;
}

/**
 * The payload sent to open a rental.
 *
 * <p>It carries a full email address and a password, because the service
 * must authenticate the subscriber. Only the API layer uses this type.</p>
 */
export interface RentalRequest {
  stationCode: string;
  email: string;
  password: string;
}

export interface ReturnRequest {
  stationCode: string;
}
