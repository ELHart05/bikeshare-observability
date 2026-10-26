package io.github.elhart05.bikeshare.rentals.api.view;

import io.github.elhart05.bikeshare.rentals.service.Report;

/**
 * The operations report for a rental, as the web frontend receives it.
 *
 * @param reference          rental concerned
 * @param startStation       pickup station
 * @param turnoverIndex      turnover index of that station, as a percentage
 * @param rentalsFromStation rentals already opened at that station
 */
public record ReportView(String reference, String startStation, int turnoverIndex,
                         int rentalsFromStation) {

    public static ReportView of(Report report) {
        return new ReportView(report.reference(), report.startStation(),
                              report.turnoverIndex(), report.rentalsFromStation());
    }
}
