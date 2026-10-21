package io.github.elhart05.bikeshare.fleet.api.view;

/**
 * The result of a pickup or a drop-off.
 *
 * @param stationCode     station concerned
 * @param bikeId          bike moved
 * @param availableBikes  available bikes after the movement
 */
public record MovementView(String stationCode, String bikeId,
                           int availableBikes) {
}
