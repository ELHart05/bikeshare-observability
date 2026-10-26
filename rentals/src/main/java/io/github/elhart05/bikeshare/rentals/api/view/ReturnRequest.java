package io.github.elhart05.bikeshare.rentals.api.view;

import jakarta.validation.constraints.NotBlank;

/**
 * What it takes to return a bike.
 *
 * @param stationCode station to drop the bike off at
 */
public record ReturnRequest(@NotBlank String stationCode) {
}
