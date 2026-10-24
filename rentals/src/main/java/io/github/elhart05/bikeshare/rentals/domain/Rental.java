package io.github.elhart05.bikeshare.rentals.domain;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * A rental, from pickup to return.
 *
 * <p>This record holds <b>neither the subscriber's full email address
 * nor the password</b>.
 * Only the address domain is kept: it answers the one question operations
 * ask (where do subscribers come from?) and it does not single anyone out.</p>
 *
 * @param reference        rental id, for example {@code R-0001}
 * @param bikeId           bike picked up
 * @param startStation     pickup station
 * @param endStation       return station, {@code null} while the rental is
 *                         active
 * @param startedAt        pickup time
 * @param endedAt          return time, {@code null} while the rental is
 *                         active
 * @param durationMinutes  billed duration, {@code 0} while the rental is
 *                         active
 * @param amount           billed amount, {@code null} while the rental is
 *                         active
 * @param subscriberDomain domain of the subscriber's email address
 * @param status           current status of the rental
 */
public record Rental(String reference, String bikeId,
                     String startStation, String endStation,
                     Instant startedAt, Instant endedAt,
                     int durationMinutes, BigDecimal amount,
                     String subscriberDomain, RentalStatus status) {

    /** True while the bike has not been returned. */
    public boolean isActive() {
        return status == RentalStatus.ACTIVE;
    }
}
