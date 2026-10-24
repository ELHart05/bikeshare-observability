package io.github.elhart05.bikeshare.rentals.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import io.github.elhart05.bikeshare.rentals.domain.Rental;

/**
 * What the domain expects from rental storage.
 *
 * <p>The service only knows this interface
 * and does not know there is a database.</p>
 */
public interface RentalRepository {

    /** All rentals, newest first. */
    List<Rental> all();

    /** One rental, by reference. */
    Optional<Rental> byReference(String reference);

    /** Number of rentals opened at a given station. */
    int countByStartStation(String startStation);

    /**
     * Opens a rental and assigns it a reference.
     *
     * @return the stored rental, reference included
     */
    Rental open(String bikeId, String startStation, Instant startedAt,
                String subscriberDomain);

    /**
     * Closes a rental.
     *
     * @return the updated rental
     */
    Rental close(String reference, String endStation, Instant endedAt,
                 int durationMinutes, BigDecimal amount);
}
