package io.github.elhart05.bikeshare.rentals.service;

/** No rental has this reference. */
public class RentalNotFound extends RuntimeException {

    public RentalNotFound(String reference) {
        super("rental not found: " + reference);
    }
}
