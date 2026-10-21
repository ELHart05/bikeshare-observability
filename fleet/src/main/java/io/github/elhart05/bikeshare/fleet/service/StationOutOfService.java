package io.github.elhart05.bikeshare.fleet.service;

/**
 * The station exists but cannot serve: it is out of service.
 *
 * <p>This is a temporary unavailability on the service side, not a
 * caller error.</p>
 */
public class StationOutOfService extends RuntimeException {

    private final String code;

    public StationOutOfService(String code) {
        super("station out of service: " + code);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
