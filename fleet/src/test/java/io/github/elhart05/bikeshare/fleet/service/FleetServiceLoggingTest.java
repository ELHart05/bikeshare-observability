package io.github.elhart05.bikeshare.fleet.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import java.util.stream.Collectors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/** What the fleet writes to its log, and above all what it does not. */
@SpringBootTest
@TestPropertySource(properties = "fleet.consolidation-ms=0")
@Transactional
class FleetServiceLoggingTest {

    @Autowired
    private FleetService service;

    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
    private final Logger logger = (Logger) LoggerFactory.getLogger(FleetService.class);

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

    @Test
    void successful_pickup_logs_nothing_because_rentals_already_does() {
        service.pickUp("ST-COMEDIE");

        assertThat(appender.list).isEmpty();
    }

    @Test
    void out_of_service_station_logs_one_typed_warn() {
        assertThatThrownBy(() -> service.pickUp("ST-PEYROU"))
                .isInstanceOf(StationOutOfService.class);

        assertThat(appender.list).hasSize(1);
        ILoggingEvent line = appender.list.get(0);
        assertThat(line.getLevel()).isEqualTo(Level.WARN);
        assertThat(line.getMessage()).isEqualTo("fleet.pickup_rejected");
        assertThat(fields(line)).containsEntry("bikeshare.station.code", "ST-PEYROU")
                                .containsEntry("bikeshare.fleet.rejection.reason", "station_out_of_service");
    }

    @Test
    void each_rejection_has_its_own_reason() {
        assertThatThrownBy(() -> service.pickUp("ST-GARE"))
                .isInstanceOf(MovementNotAllowed.class);
        assertThatThrownBy(() -> service.pickUp("ST-NOWHERE"))
                .isInstanceOf(StationNotFound.class);

        assertThat(appender.list).extracting(e -> fields(e).get("bikeshare.fleet.rejection.reason"))
                                 .containsExactly("no_bike_available", "station_not_found");
    }
}
