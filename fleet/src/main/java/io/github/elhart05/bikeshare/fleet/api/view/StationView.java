package io.github.elhart05.bikeshare.fleet.api.view;

import io.github.elhart05.bikeshare.fleet.domain.Station;

/**
 * A station, as the service returns it.
 *
 * @param code            station code
 * @param name            display name
 * @param capacity        number of docks
 * @param availableBikes  bikes available right now
 * @param outOfService    true when the station cannot serve
 */
public record StationView(String code, String name, int capacity,
                          int availableBikes, boolean outOfService) {

    public static StationView of(Station station, int availableBikes) {
        return new StationView(station.code(), station.name(), station.capacity(),
                               availableBikes, station.outOfService());
    }
}
