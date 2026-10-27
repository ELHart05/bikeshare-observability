package io.github.elhart05.bikeshare.rentals.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import io.github.elhart05.bikeshare.rentals.service.RentalService;

/**
 * The context starts and the service is wired.
 *
 * <p>No fleet call is made here.
 * This test checks the wiring, not the behaviour.
 * The rules are tested without Spring in {@code RentalServiceTest}.</p>
 */
@SpringBootTest
class RentalsApplicationTest {

    @Autowired
    private RentalService service;

    @Test
    void context_starts_with_empty_registry() {
        assertThat(service).isNotNull();
        assertThat(service.rentals()).isEmpty();
    }
}
