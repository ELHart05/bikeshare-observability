package io.github.elhart05.bikeshare.fleet.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import io.github.elhart05.bikeshare.fleet.domain.BikeStatus;
import io.github.elhart05.bikeshare.fleet.domain.Station;

/**
 * Fleet rules, on the initial data.
 *
 * <p>Consolidation is set to zero milliseconds,
 * since these tests cover the rules, not the duration.</p>
 *
 * <p>{@code @Transactional} rolls the transaction back after each test.
 * Tests that move a bike do not interfere with each other, and
 * execution order has no effect on the result.</p>
 */
@SpringBootTest
@TestPropertySource(properties = "fleet.consolidation-ms=0")
@Transactional
class FleetServiceTest {

    @Autowired
    private FleetService service;

    @Test
    void loads_six_stations() {
        assertThat(service.stations()).hasSize(6);
        assertThat(service.stations().stream().map(Station::code))
                .containsExactly("ST-ARCEAUX", "ST-COMEDIE", "ST-GARE",
                                 "ST-MOSSON", "ST-PEYROU", "ST-TRIOLET");
    }

    @Test
    void counts_available_bikes_per_station() {
        assertThat(service.available("ST-ARCEAUX")).isEqualTo(4);
        assertThat(service.available("ST-COMEDIE")).isEqualTo(7);
        assertThat(service.available("ST-GARE")).isZero();
        assertThat(service.available("ST-MOSSON")).isEqualTo(3);
        assertThat(service.available("ST-PEYROU")).isEqualTo(5);
        assertThat(service.available("ST-TRIOLET")).isEqualTo(2);
    }

    @Test
    void picks_up_first_available_bike() {
        var bike = service.pickUp("ST-COMEDIE");
        assertThat(bike.id()).isEqualTo("B-0006");
        assertThat(bike.status()).isEqualTo(BikeStatus.IN_USE);
        assertThat(service.available("ST-COMEDIE")).isEqualTo(6);
    }

    @Test
    void refuses_pickup_at_empty_station() {
        assertThatThrownBy(() -> service.pickUp("ST-GARE"))
                .isInstanceOf(MovementNotAllowed.class);
    }

    @Test
    void refuses_out_of_service_station() {
        assertThatThrownBy(() -> service.pickUp("ST-PEYROU"))
                .isInstanceOf(StationOutOfService.class);
    }

    @Test
    void refuses_unknown_station() {
        assertThatThrownBy(() -> service.station("ST-UNKNOWN"))
                .isInstanceOf(StationNotFound.class);
    }

    @Test
    void drops_off_bike_in_use_at_another_station() {
        var pickedUp = service.pickUp("ST-MOSSON");
        var droppedOff = service.dropOff("ST-ARCEAUX", pickedUp.id());
        assertThat(droppedOff.stationCode()).isEqualTo("ST-ARCEAUX");
        assertThat(droppedOff.status()).isEqualTo(BikeStatus.AVAILABLE);
        assertThat(service.available("ST-ARCEAUX")).isEqualTo(5);
    }

    @Test
    void refuses_drop_off_of_bike_not_in_use() {
        assertThatThrownBy(() -> service.dropOff("ST-ARCEAUX", "B-0006"))
                .isInstanceOf(MovementNotAllowed.class);
    }

    @Test
    void consolidates_turnover_index_per_station() {
        assertThat(service.turnoverIndex("ST-ARCEAUX")).isEqualTo(80);
        assertThat(service.turnoverIndex("ST-COMEDIE")).isEqualTo(100);
        assertThat(service.turnoverIndex("ST-GARE")).isZero();
        assertThat(service.turnoverIndex("ST-TRIOLET")).isEqualTo(67);
    }
}
