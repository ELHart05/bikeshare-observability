package io.github.elhart05.bikeshare.rentals.api.view;

import java.math.BigDecimal;

import io.github.elhart05.bikeshare.rentals.domain.Rental;

/**
 * A rental, as the web frontend receives it.
 * <p>The subscriber domain is not part of it.</p>
 *
 * @param reference       rental reference
 * @param bikeId          bike picked up
 * @param startStation    pickup station
 * @param endStation      return station, {@code null} while active
 * @param durationMinutes billed duration, {@code 0} while active
 * @param amount          billed amount, {@code null} while active
 * @param status          {@code ACTIVE} or {@code CLOSED}
 */
public record RentalView(String reference, String bikeId,
                         String startStation, String endStation,
                         int durationMinutes, BigDecimal amount, String status) {

    public static RentalView of(Rental rental) {
        return new RentalView(rental.reference(), rental.bikeId(),
                              rental.startStation(), rental.endStation(),
                              rental.durationMinutes(), rental.amount(),
                              rental.status().name());
    }
}
