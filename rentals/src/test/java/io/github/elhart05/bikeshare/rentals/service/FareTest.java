package io.github.elhart05.bikeshare.rentals.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import io.github.elhart05.bikeshare.rentals.domain.Fare;

/** The two fare rules, one at a time. */
class FareTest {

    private static final Instant START = Instant.parse("2026-11-04T09:00:00Z");

    @Test
    void bills_at_least_one_minute() {
        assertThat(Fare.billedMinutes(START, START)).isEqualTo(1);
        assertThat(Fare.billedMinutes(START, START.plusSeconds(1))).isEqualTo(1);
        assertThat(Fare.billedMinutes(START, START.plusSeconds(60))).isEqualTo(1);
    }

    @Test
    void bills_every_started_minute() {
        assertThat(Fare.billedMinutes(START, START.plusSeconds(61))).isEqualTo(2);
        assertThat(Fare.billedMinutes(START, START.plusSeconds(600))).isEqualTo(10);
        assertThat(Fare.billedMinutes(START, START.plusSeconds(601))).isEqualTo(11);
    }

    @Test
    void never_bills_negative_duration() {
        assertThat(Fare.billedMinutes(START, START.minusSeconds(600))).isEqualTo(1);
    }

    @Test
    void adds_base_fee_to_minute_price() {
        assertThat(Fare.amount(1)).isEqualByComparingTo("1.05");
        assertThat(Fare.amount(10)).isEqualByComparingTo("1.50");
        assertThat(Fare.amount(60)).isEqualByComparingTo("4.00");
    }
}
