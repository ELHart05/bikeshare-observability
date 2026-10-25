package io.github.elhart05.bikeshare.rentals.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * The HTTP client that talks to the fleet service.
 *
 * <p>The transport is pinned explicitly to the JDK HTTP client.</p>
 */
@Configuration
public class HttpClientConfig {

    @Bean
    RestClient fleetRestClient(@Value("${rentals.fleet-url}") String fleetUrl) {
        return RestClient.builder()
                .requestFactory(new JdkClientHttpRequestFactory())
                .baseUrl(fleetUrl)
                .build();
    }
}
