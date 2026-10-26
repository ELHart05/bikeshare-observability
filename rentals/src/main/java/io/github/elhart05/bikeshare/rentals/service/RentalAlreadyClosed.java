package io.github.elhart05.bikeshare.rentals.service;

/** The bike for this rental has already been returned. */
public class RentalAlreadyClosed extends RuntimeException {

    public RentalAlreadyClosed(String reference) {
        super("rental already closed: " + reference);
    }
}
