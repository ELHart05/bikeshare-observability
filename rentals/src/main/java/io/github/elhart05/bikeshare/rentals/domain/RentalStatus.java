package io.github.elhart05.bikeshare.rentals.domain;

/** Status of a rental. */
public enum RentalStatus {

    /** The bike is out and has not been returned yet. */
    ACTIVE,

    /** The bike has been returned; duration and amount are known. */
    CLOSED
}
