package io.github.elhart05.bikeshare.fleet.service;

/**
 * The requested movement contradicts the state of the fleet:
 * no bike left to pick up, or no free dock to drop one off.
 */
public class MovementNotAllowed extends RuntimeException {

    public MovementNotAllowed(String message) {
        super(message);
    }
}
