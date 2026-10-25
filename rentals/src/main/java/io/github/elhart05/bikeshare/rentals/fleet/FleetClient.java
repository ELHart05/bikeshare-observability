package io.github.elhart05.bikeshare.rentals.fleet;

import java.util.List;

/**
 * What the rentals service expects from the fleet service.
 *
 * <p>This is a <b>port</b>.
 * The domain depends on this interface, not on the HTTP client behind it.
 * Tests can therefore do without it
 * and replace the fleet with a fake of a few lines.</p>
 */
public interface FleetClient {

    /**
     * All fleet stations.
     *
     * @throws FleetUnavailable the fleet did not answer
     */
    List<FleetStation> stations();

    /**
     * Picks a bike up from a station.
     *
     * @throws UnknownStation   the fleet does not know this code
     * @throws MovementRefused  no bike is available
     * @throws FleetUnavailable the station is out of service, or the fleet
     *                          did not answer
     */
    FleetMovement pickUp(String stationCode);

    /**
     * Drops a bike off at a station.
     *
     * @throws UnknownStation   the fleet does not know this code
     * @throws MovementRefused  no dock is free, or the bike is unknown
     * @throws FleetUnavailable the station is out of service, or the fleet
     *                          did not answer
     */
    FleetMovement dropOff(String stationCode, String bikeId);

    /**
     * Consolidated turnover index of a station.
     *
     * <p>This is the slow call of the application.</p>
     *
     * @throws UnknownStation   the fleet does not know this code
     * @throws FleetUnavailable the fleet did not answer
     */
    int turnoverIndex(String stationCode);
}
