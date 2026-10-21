package io.github.elhart05.bikeshare.fleet.api.view;

/**
 * The consolidated turnover index of a station.
 *
 * @param stationCode station concerned
 * @param index       share of available bikes, as a percentage
 */
public record TurnoverIndexView(String stationCode, int index) {
}
