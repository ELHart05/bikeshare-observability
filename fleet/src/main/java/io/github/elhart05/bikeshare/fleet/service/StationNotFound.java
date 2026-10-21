package io.github.elhart05.bikeshare.fleet.service;

/** No station has this code. */
public class StationNotFound extends RuntimeException {

    private final String code;

    public StationNotFound(String code) {
        super("station not found: " + code);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
