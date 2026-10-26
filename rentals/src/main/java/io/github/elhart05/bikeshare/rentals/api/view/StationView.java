package io.github.elhart05.bikeshare.rentals.api.view;

import io.github.elhart05.bikeshare.rentals.fleet.FleetStation;

/**
 * A station, as the web frontend receives it.
 *
 * <p>It adds to the fleet's description the one thing a subscriber cares
 * about: can I rent here, right now?</p>
 *
 * @param code           station code
 * @param name           display name
 * @param capacity       number of docks
 * @param availableBikes bikes available for pickup
 * @param outOfService   true when the station cannot serve
 * @param rentable       true when a pickup can succeed
 */
public record StationView(String code, String name, int capacity,
                          int availableBikes, boolean outOfService, boolean rentable) {

    public static StationView of(FleetStation station) {
        return new StationView(station.code(), station.name(), station.capacity(),
                               station.availableBikes(), station.outOfService(),
                               !station.outOfService() && station.availableBikes() > 0);
    }
}
