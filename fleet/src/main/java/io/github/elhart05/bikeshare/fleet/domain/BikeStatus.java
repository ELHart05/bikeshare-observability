package io.github.elhart05.bikeshare.fleet.domain;

/** Status of a bike in the fleet. */
public enum BikeStatus {

    /** Docked and ready to be picked up. */
    AVAILABLE,

    /** Picked up from a station and being ridden. */
    IN_USE,

    /** Held for repair; does not count as available. */
    MAINTENANCE
}
