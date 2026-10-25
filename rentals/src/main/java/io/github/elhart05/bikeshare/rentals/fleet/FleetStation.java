package io.github.elhart05.bikeshare.rentals.fleet;

/**
 * A station, as the fleet service describes it.
 *
 * @param code           station code
 * @param name           display name
 * @param capacity       number of docks
 * @param availableBikes bikes available for pickup
 * @param outOfService   true when the station cannot serve
 */
public record FleetStation(String code, String name, int capacity,
                           int availableBikes, boolean outOfService) {
}
