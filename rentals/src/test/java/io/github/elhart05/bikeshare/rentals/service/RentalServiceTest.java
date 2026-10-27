package io.github.elhart05.bikeshare.rentals.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import io.github.elhart05.bikeshare.rentals.domain.Rental;
import io.github.elhart05.bikeshare.rentals.domain.RentalStatus;
import io.github.elhart05.bikeshare.rentals.fleet.FleetClient;
import io.github.elhart05.bikeshare.rentals.fleet.FleetMovement;
import io.github.elhart05.bikeshare.rentals.fleet.FleetStation;
import io.github.elhart05.bikeshare.rentals.fleet.FleetUnavailable;
import io.github.elhart05.bikeshare.rentals.repository.RentalRepository;

/**
 * Rental rules, without Spring, database or network.
 *
 * <p>If the fleet were not behind a port, checking a billing calculation
 * would take two running applications.</p>
 */
class RentalServiceTest {

    private static final Instant START = Instant.parse("2026-11-04T09:00:00Z");
    private static final String EMAIL = "camille.rey@example.com";
    private static final String SECRET = "Zx9" + "!" + "Vole-Tandem";

    /** In-memory registry that assigns the same references as the real one. */
    private static final class InMemoryRentalRepository implements RentalRepository {
        private final List<Rental> rentals = new ArrayList<>();

        @Override
        public List<Rental> all() {
            return List.copyOf(rentals);
        }

        @Override
        public Optional<Rental> byReference(String reference) {
            return rentals.stream().filter(r -> r.reference().equals(reference)).findFirst();
        }

        @Override
        public int countByStartStation(String startStation) {
            return (int) rentals.stream()
                    .filter(r -> r.startStation().equals(startStation)).count();
        }

        @Override
        public Rental open(String bikeId, String startStation, Instant startedAt,
                           String subscriberDomain) {
            Rental rental = new Rental(
                    String.format("R-%04d", rentals.size() + 1), bikeId,
                    startStation, null, startedAt, null, 0, null, subscriberDomain,
                    RentalStatus.ACTIVE);
            rentals.add(rental);
            return rental;
        }

        @Override
        public Rental close(String reference, String endStation, Instant endedAt,
                            int durationMinutes, BigDecimal amount) {
            Rental before = byReference(reference).orElseThrow();
            Rental after = new Rental(before.reference(), before.bikeId(),
                    before.startStation(), endStation, before.startedAt(), endedAt,
                    durationMinutes, amount, before.subscriberDomain(), RentalStatus.CLOSED);
            rentals.replaceAll(r -> r.reference().equals(reference) ? after : r);
            return after;
        }
    }

    /** Stand-in fleet. */
    private static final class FakeFleet implements FleetClient {
        private final List<String> calls = new ArrayList<>();
        private boolean unavailable;

        @Override
        public List<FleetStation> stations() {
            calls.add("stations");
            return List.of(new FleetStation("ST-COMEDIE", "Place de la Comédie",
                                            20, 7, false));
        }

        @Override
        public FleetMovement pickUp(String stationCode) {
            calls.add("pickUp:" + stationCode);
            if (unavailable) {
                throw new FleetUnavailable("station out of service: " + stationCode);
            }
            return new FleetMovement(stationCode, "B-0006", 6);
        }

        @Override
        public FleetMovement dropOff(String stationCode, String bikeId) {
            calls.add("dropOff:" + stationCode + ":" + bikeId);
            return new FleetMovement(stationCode, bikeId, 5);
        }

        @Override
        public int turnoverIndex(String stationCode) {
            calls.add("turnoverIndex:" + stationCode);
            return 100;
        }
    }

    /** Clock that moves forward by a fixed step on every read. */
    private static final class SteppingClock extends Clock {
        private Instant now = START;
        private Duration step = Duration.ZERO;

        @Override
        public Instant instant() {
            Instant read = now;
            now = now.plus(step);
            return read;
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }
    }

    private final InMemoryRentalRepository repository = new InMemoryRentalRepository();
    private final FakeFleet fleet = new FakeFleet();
    private final SteppingClock clock = new SteppingClock();
    private final RentalService service =
            new RentalService(repository, fleet, new Subscribers(), clock);

    @Test
    void opens_rental_and_picks_up_bike() {
        Rental rental = service.open("ST-COMEDIE", EMAIL, SECRET);

        assertThat(rental.reference()).isEqualTo("R-0001");
        assertThat(rental.bikeId()).isEqualTo("B-0006");
        assertThat(rental.startStation()).isEqualTo("ST-COMEDIE");
        assertThat(rental.isActive()).isTrue();
        assertThat(fleet.calls).containsExactly("pickUp:ST-COMEDIE");
    }

    @Test
    void keeps_only_subscriber_domain() {
        Rental rental = service.open("ST-COMEDIE", EMAIL, SECRET);

        assertThat(rental.subscriberDomain()).isEqualTo("example.com");
        assertThat(rental.toString()).doesNotContain(SECRET);
        assertThat(rental.toString()).doesNotContain(EMAIL);
    }

    @Test
    void rejects_unknown_subscriber_without_calling_fleet() {
        assertThatThrownBy(() -> service.open("ST-COMEDIE", "unknown@example.com", "x"))
                .isInstanceOf(SubscriberRejected.class);
        assertThat(fleet.calls).isEmpty();
    }

    @Test
    void rejects_wrong_secret() {
        assertThatThrownBy(() -> service.open("ST-COMEDIE", EMAIL, "wrong"))
                .isInstanceOf(SubscriberRejected.class);
    }

    @Test
    void bills_one_minute_minimum() {
        service.open("ST-COMEDIE", EMAIL, SECRET);
        Rental closed = service.returnRental("R-0001", "ST-ARCEAUX");

        assertThat(closed.durationMinutes()).isEqualTo(1);
        assertThat(closed.amount()).isEqualByComparingTo("1.05");
        assertThat(closed.endStation()).isEqualTo("ST-ARCEAUX");
        assertThat(closed.status()).isEqualTo(RentalStatus.CLOSED);
    }

    @Test
    void bills_every_started_minute() {
        clock.step = Duration.ofSeconds(601);
        service.open("ST-COMEDIE", EMAIL, SECRET);
        Rental closed = service.returnRental("R-0001", "ST-ARCEAUX");

        assertThat(closed.durationMinutes()).isEqualTo(11);
        assertThat(closed.amount()).isEqualByComparingTo("1.55");
    }

    @Test
    void refuses_to_return_twice() {
        service.open("ST-COMEDIE", EMAIL, SECRET);
        service.returnRental("R-0001", "ST-ARCEAUX");

        assertThatThrownBy(() -> service.returnRental("R-0001", "ST-ARCEAUX"))
                .isInstanceOf(RentalAlreadyClosed.class);
    }

    @Test
    void rejects_unknown_reference() {
        assertThatThrownBy(() -> service.returnRental("R-9999", "ST-ARCEAUX"))
                .isInstanceOf(RentalNotFound.class);
    }

    @Test
    void propagates_fleet_unavailability() {
        fleet.unavailable = true;
        assertThatThrownBy(() -> service.open("ST-PEYROU", EMAIL, SECRET))
                .isInstanceOf(FleetUnavailable.class);
        assertThat(repository.all()).isEmpty();
    }

    @Test
    void report_combines_local_and_fleet_data() {
        service.open("ST-COMEDIE", EMAIL, SECRET);
        service.open("ST-COMEDIE", EMAIL, SECRET);

        Report report = service.report("R-0001");

        assertThat(report.turnoverIndex()).isEqualTo(100);
        assertThat(report.rentalsFromStation()).isEqualTo(2);
        assertThat(fleet.calls).contains("turnoverIndex:ST-COMEDIE");
    }
}
