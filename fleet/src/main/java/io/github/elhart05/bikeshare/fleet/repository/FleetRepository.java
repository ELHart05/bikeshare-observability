package io.github.elhart05.bikeshare.fleet.repository;

import java.util.List;
import java.util.Optional;

import io.github.elhart05.bikeshare.fleet.domain.Bike;
import io.github.elhart05.bikeshare.fleet.domain.Station;

/**
 * What the domain needs from storage.
 *
 * <p>The service only knows this interface
 * and does not know there is a database or Hibernate behind it.
 * The JPA implementation lives in {@code repository.jpa}.</p>
 */
public interface FleetRepository {

    List<Station> stations();

    Optional<Station> byCode(String code);

    /** Bikes attached to a station, whatever their status. */
    List<Bike> bikesAt(String code);

    /** Number of available bikes at a station. */
    int available(String code);

    /** Number of bikes on the docks, maintenance included. */
    int docked(String code);

    /** The first available bike at a station, by id order. */
    Optional<Bike> firstAvailable(String code);

    Optional<Bike> bike(String id);

    /** Detaches a bike from its station and marks it in use. */
    void pickUp(String id);

    /** Attaches a bike to a station and marks it available again. */
    void dropOff(String id, String code);

    /** Total bikes in the fleet, all statuses included. */
    int totalBikes();
}
