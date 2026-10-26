package io.github.elhart05.bikeshare.rentals.api.view;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * What it takes to open a rental.
 *
 * <p>The request carries a full email address and a password, because the
 * service has to recognize the subscriber.
 * Both are real sensitive data and must be handled as such.</p>
 *
 * @param stationCode station to pick the bike up from
 * @param email       subscriber's email address
 * @param password    subscriber's password
 */
public record RentalRequest(@NotBlank String stationCode,
                            @NotBlank @Email String email,
                            @NotBlank String password) {
}
