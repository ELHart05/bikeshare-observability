package io.github.elhart05.bikeshare.fleet.api.view;

import jakarta.validation.constraints.NotBlank;

/**
 * What a drop-off needs.
 *
 * @param bikeId id of the bike to dock at the station
 */
public record DropOffRequest(@NotBlank String bikeId) {
}
