package io.github.elhart05.bikeshare.fleet.domain;

/**
 * A station of the fleet.
 *
 * <p>The capacity is the number of docks.
 * It caps how many bikes the station can hold.</p>
 *
 * @param code         short, stable code, for example {@code ST-COMEDIE}
 * @param name         display name
 * @param capacity     number of docks
 * @param outOfService true when the station is out of service
 */
public record Station(String code, String name, int capacity, boolean outOfService) {
}
