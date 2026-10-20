package io.github.elhart05.bikeshare.fleet.domain;

/**
 * A bike of the fleet.
 *
 * @param id          stable id, for example {@code B-0147}
 * @param stationCode station it is docked at, {@code null} while in use
 * @param status      current status
 */
public record Bike(String id, String stationCode, BikeStatus status) {
}
