package io.github.elhart05.bikeshare.rentals.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;

/**
 * Rental fare.
 *
 * <p>Every started minute is billed, and every rental is billed at least
 * one minute.
 * A rental opened and returned within the same minute therefore costs
 * exactly the base fee plus one minute.</p>
 */
public final class Fare {

    /** Amount due as soon as the bike is picked up, in euros. */
    public static final BigDecimal BASE_FEE = new BigDecimal("1.00");

    /** Amount due per started minute, in euros. */
    public static final BigDecimal PER_MINUTE = new BigDecimal("0.05");

    private Fare() {
    }

    /** Minutes billed between two instants (at least one, rounded up). */
    public static int billedMinutes(Instant start, Instant end) {
        long seconds = Math.max(0, Duration.between(start, end).getSeconds());
        return (int) Math.max(1, (seconds + 59) / 60);
    }

    /** Amount billed for a given duration (rounded to the cent). */
    public static BigDecimal amount(int minutes) {
        return BASE_FEE
                .add(PER_MINUTE.multiply(BigDecimal.valueOf(minutes)))
                .setScale(2, RoundingMode.HALF_UP);
    }
}
