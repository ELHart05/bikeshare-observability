package io.github.elhart05.bikeshare.rentals.fleet;

/**
 * The fleet service could not serve the request.
 *
 * <p>Two different causes end up here:
 * the fleet answered that it was unavailable
 * (an out-of-service station, for example),
 * or it did not answer at all.</p>
 */
public class FleetUnavailable extends RuntimeException {

    public FleetUnavailable(String message) {
        super(message);
    }

    public FleetUnavailable(String message, Throwable cause) {
        super(message, cause);
    }
}
