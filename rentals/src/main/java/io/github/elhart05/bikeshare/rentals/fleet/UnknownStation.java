package io.github.elhart05.bikeshare.rentals.fleet;

/** The fleet has no station with this code. */
public class UnknownStation extends RuntimeException {

    public UnknownStation(String code) {
        super("station unknown to the fleet: " + code);
    }
}
