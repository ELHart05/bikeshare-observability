package io.github.elhart05.bikeshare.rentals.service;

/**
 * The subscriber was not recognized.
 *
 * <p>The message does <b>not</b> say which of the two credentials is wrong,
 * and repeats neither the address nor the secret supplied.</p>
 */
public class SubscriberRejected extends RuntimeException {

    public SubscriberRejected() {
        super("invalid credentials");
    }
}
