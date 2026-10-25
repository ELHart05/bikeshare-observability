package io.github.elhart05.bikeshare.rentals.fleet;

/**
 * The fleet answered, and refused.
 * No bike left to pick up, no free dock, or unknown bike.
 */
public class MovementRefused extends RuntimeException {

    public MovementRefused(String message) {
        super(message);
    }
}
