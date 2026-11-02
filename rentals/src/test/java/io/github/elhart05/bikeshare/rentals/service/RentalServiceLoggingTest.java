package io.github.elhart05.bikeshare.rentals.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.elhart05.bikeshare.rentals.domain.Rental;
import io.github.elhart05.bikeshare.rentals.domain.RentalStatus;
import io.github.elhart05.bikeshare.rentals.fleet.FleetClient;
import io.github.elhart05.bikeshare.rentals.fleet.FleetMovement;
import io.github.elhart05.bikeshare.rentals.fleet.FleetStation;
import io.github.elhart05.bikeshare.rentals.fleet.FleetUnavailable;
import io.github.elhart05.bikeshare.rentals.fleet.MovementRefused;
import io.github.elhart05.bikeshare.rentals.fleet.UnknownStation;
import io.github.elhart05.bikeshare.rentals.repository.RentalRepository;

/**
 * The domain log contract: each event is logged once, with typed fields,
 * at the right level, and with nothing that identifies the subscriber.
 */
class RentalServiceLoggingTest {

    private static final String EMAIL = "camille.rey@example.com";
    private static final String SECRET = "Zx9" + "!" + "Vole-Tandem";

    /** The minimal registry these tests need. */
    private static final class InMemoryRentalRepository implements RentalRepository {
        private final List<Rental> rentals = new ArrayList<>();

        @Override
        public List<Rental> all() {
            return rentals;
        }

        @Override
        public Optional<Rental> byReference(String reference) {
            return rentals.stream().filter(r -> r.reference().equals(reference)).findFirst();
        }

        @Override
        public int countByStartStation(String startStation) {
            return 0;
        }

        @Override
        public Rental open(String bike, String start, Instant startedAt, String domain) {
            Rental rental = new Rental("R-0001", bike, start, null, startedAt, null, 0, null,
                                       domain, RentalStatus.ACTIVE);
            rentals.add(rental);
            return rental;
        }

        @Override
        public Rental close(String reference, String end, Instant endedAt, int minutes,
                            BigDecimal amount) {
            Rental a = byReference(reference).orElseThrow();
            Rental closed = new Rental(a.reference(), a.bikeId(), a.startStation(),
                                       end, a.startedAt(), endedAt, minutes, amount,
                                       a.subscriberDomain(), RentalStatus.CLOSED);
            rentals.set(0, closed);
            return closed;
        }
    }

    /** A fleet that answers, or throws the failure it is given. */
    private static final class FakeFleet implements FleetClient {
        private RuntimeException failure;

        @Override
        public List<FleetStation> stations() {
            return List.of();
        }

        @Override
        public FleetMovement pickUp(String code) {
            if (failure != null) {
                throw failure;
            }
            return new FleetMovement(code, "B-0006", 6);
        }

        @Override
        public FleetMovement dropOff(String code, String bike) {
            return new FleetMovement(code, bike, 5);
        }

        @Override
        public int turnoverIndex(String code) {
            return 100;
        }
    }

    private final FakeFleet fleet = new FakeFleet();
    private final RentalService service = new RentalService(
            new InMemoryRentalRepository(), fleet, new Subscribers(),
            Clock.fixed(Instant.parse("2026-11-04T09:00:00Z"), ZoneOffset.UTC));

    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
    private final Logger logger = (Logger) LoggerFactory.getLogger(RentalService.class);

    @BeforeEach
    void attach() {
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach
    void detach() {
        logger.detachAppender(appender);
    }

    private static Map<String, Object> fields(ILoggingEvent e) {
        return e.getKeyValuePairs().stream().collect(Collectors.toMap(p -> p.key, p -> p.value));
    }

    private ILoggingEvent singleLine() {
        assertThat(appender.list).hasSize(1);
        return appender.list.get(0);
    }

    private void openAndFail(RuntimeException failure) {
        fleet.failure = failure;
        assertThatThrownBy(() -> service.open("ST-GARE", EMAIL, SECRET))
                .isSameAs(failure);
    }

    @Test
    void opening_logs_one_typed_event() {
        service.open("ST-COMEDIE", EMAIL, SECRET);

        ILoggingEvent line = singleLine();
        assertThat(line.getLevel()).isEqualTo(Level.INFO);
        assertThat(line.getMessage()).isEqualTo("rental.opened");
        assertThat(fields(line)).containsEntry("bikeshare.rental.reference", "R-0001")
                                .containsEntry("bikeshare.bike.id", "B-0006")
                                .containsEntry("bikeshare.rental.start_station", "ST-COMEDIE")
                                .containsEntry("bikeshare.subscriber.domain", "example.com");
    }

    @Test
    void neither_email_nor_secret_is_logged() {
        service.open("ST-COMEDIE", EMAIL, SECRET);
        assertThatThrownBy(() -> service.open("ST-COMEDIE", EMAIL, "wrong"))
                .isInstanceOf(SubscriberRejected.class);

        assertThat(appender.list).hasSize(2).allSatisfy(line -> assertThat(
                line.getFormattedMessage() + fields(line))
                .doesNotContain(EMAIL, SECRET, "wrong", "camille.rey"));
    }

    @Test
    void closing_logs_numeric_amount_and_start_station() {
        service.open("ST-COMEDIE", EMAIL, SECRET);
        appender.list.clear();

        service.returnRental("R-0001", "ST-ARCEAUX");

        ILoggingEvent line = singleLine();
        assertThat(line.getMessage()).isEqualTo("rental.closed");
        assertThat(fields(line)).containsEntry("bikeshare.rental.start_station", "ST-COMEDIE")
                                .containsEntry("bikeshare.rental.end_station", "ST-ARCEAUX")
                                .containsEntry("bikeshare.rental.duration_minutes", 1)
                                .containsEntry("bikeshare.rental.amount_eur", new BigDecimal("1.05"));
    }

    @Test
    void rejected_subscriber_is_warn_at_subscriber_check() {
        assertThatThrownBy(() -> service.open("ST-COMEDIE", EMAIL, "wrong"))
                .isInstanceOf(SubscriberRejected.class);

        ILoggingEvent line = singleLine();
        assertThat(line.getLevel()).isEqualTo(Level.WARN);
        assertThat(line.getThrowableProxy()).isNull();
        assertThat(fields(line)).containsEntry("bikeshare.rental.failure.step", "subscriber_check")
                                .containsEntry("bikeshare.rental.failure.reason", "subscriber_rejected");
    }

    @Test
    void fleet_rejection_is_warn_at_pickup_step() {
        openAndFail(new MovementRefused("no bike available at station ST-GARE"));

        ILoggingEvent line = singleLine();
        assertThat(line.getLevel()).isEqualTo(Level.WARN);
        assertThat(fields(line)).containsEntry("bikeshare.rental.failure.step", "fleet_pickup")
                                .containsEntry("bikeshare.rental.failure.reason", "movement_refused");
    }

    @Test
    void unknown_station_has_its_reason() {
        openAndFail(new UnknownStation("ST-NOWHERE"));

        assertThat(fields(singleLine()))
                .containsEntry("bikeshare.rental.failure.reason", "unknown_station");
    }

    @Test
    void both_503s_differ_by_reason_and_log_as_error() {
        openAndFail(new FleetUnavailable("station out of service: ST-PEYROU"));
        openAndFail(new FleetUnavailable("fleet service unreachable",
                                         new java.net.ConnectException()));

        assertThat(appender.list).hasSize(2).allSatisfy(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getThrowableProxy()).isNotNull();
        });
        assertThat(appender.list).extracting(l -> fields(l).get("bikeshare.rental.failure.reason"))
                                 .containsExactly("fleet_unavailable", "fleet_unreachable");
    }

    @Test
    void returning_twice_is_warn() {
        service.open("ST-COMEDIE", EMAIL, SECRET);
        service.returnRental("R-0001", "ST-ARCEAUX");
        appender.list.clear();

        assertThatThrownBy(() -> service.returnRental("R-0001", "ST-ARCEAUX"))
                .isInstanceOf(RentalAlreadyClosed.class);

        ILoggingEvent line = singleLine();
        assertThat(line.getMessage()).isEqualTo("rental.return_failed");
        assertThat(line.getLevel()).isEqualTo(Level.WARN);
        assertThat(fields(line)).containsEntry("bikeshare.rental.failure.step", "lookup")
                                .containsEntry("bikeshare.rental.failure.reason", "rental_already_closed");
    }
}
