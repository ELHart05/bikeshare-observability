package io.github.elhart05.bikeshare.rentals.configuration;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The service clock.
 *
 * <p>Domain code never reads the time directly; it is given a clock instead.
 * That lets a billing test run without actually waiting ten minutes.</p>
 */
@Configuration
public class ClockConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
