package io.github.elhart05.bikeshare.rentals.fleet;

/**
 * Result of a pickup or drop-off, as the fleet service describes it.
 *
 * @param stationCode    station concerned
 * @param bikeId         bike moved
 * @param availableBikes bikes available after the movement
 */
public record FleetMovement(String stationCode, String bikeId, int availableBikes) {
}
