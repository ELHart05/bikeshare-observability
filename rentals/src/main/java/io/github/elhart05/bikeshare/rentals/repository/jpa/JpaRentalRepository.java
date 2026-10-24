package io.github.elhart05.bikeshare.rentals.repository.jpa;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import io.github.elhart05.bikeshare.rentals.domain.Rental;
import io.github.elhart05.bikeshare.rentals.repository.RentalRepository;

/**
 * Database storage for rentals.
 *
 * <p>It assigns references in opening order:
 * {@code R-0001}, {@code R-0002}, and so on.
 * Since the database is recreated on every start,
 * the first rental of a run always gets the same reference.</p>
 */
@Repository
public class JpaRentalRepository implements RentalRepository {

    private final RentalJpaRepository rentals;

    JpaRentalRepository(RentalJpaRepository rentals) {
        this.rentals = rentals;
    }

    @Override
    public List<Rental> all() {
        return rentals.findAllByOrderByReferenceDesc().stream()
                .map(JpaRentalRepository::rental).toList();
    }

    @Override
    public Optional<Rental> byReference(String reference) {
        return rentals.findById(reference).map(JpaRentalRepository::rental);
    }

    @Override
    public int countByStartStation(String startStation) {
        return rentals.countByStartStation(startStation);
    }

    @Override
    @Transactional
    public Rental open(String bikeId, String startStation, Instant startedAt,
                       String subscriberDomain) {
        String reference = String.format("R-%04d", rentals.count() + 1);
        RentalEntity entity = new RentalEntity(reference, bikeId, startStation,
                                               startedAt, subscriberDomain);
        return rental(rentals.save(entity));
    }

    @Override
    @Transactional
    public Rental close(String reference, String endStation, Instant endedAt,
                        int durationMinutes, BigDecimal amount) {
        RentalEntity entity = rentals.findById(reference).orElseThrow();
        entity.close(endStation, endedAt, durationMinutes, amount);
        return rental(rentals.save(entity));
    }

    private static Rental rental(RentalEntity e) {
        return new Rental(e.getReference(), e.getBikeId(), e.getStartStation(),
                          e.getEndStation(), e.getStartedAt(), e.getEndedAt(),
                          e.getDurationMinutes(), e.getAmount(), e.getSubscriberDomain(),
                          e.getStatus());
    }
}
