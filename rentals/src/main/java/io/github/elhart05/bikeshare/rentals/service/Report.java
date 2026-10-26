package io.github.elhart05.bikeshare.rentals.service;

/**
 * The operations report for a rental.
 *
 * <p>It combines local data
 * (the number of rentals opened at the start station)
 * with data consolidated by the fleet service.</p>
 *
 * @param reference          rental concerned
 * @param startStation       pickup station
 * @param turnoverIndex      turnover index of that station (percentage)
 * @param rentalsFromStation rentals already opened at that station
 */
public record Report(String reference, String startStation, int turnoverIndex,
                     int rentalsFromStation) {
}
