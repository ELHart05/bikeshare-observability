package io.github.elhart05.bikeshare.rentals.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * The web frontend is served from another origin than this service,
 * so the browser requires explicit permission.
 *
 * <p>The list of allowed headers stays explicit. {@code traceparent} and
 * {@code tracestate} are there for propagation: without them, Spring answers 403
 * to the preflight and the frontend can no longer reach the service.</p>
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final String frontendOrigin;

    CorsConfig(@Value("${rentals.frontend-origin}") String frontendOrigin) {
        this.frontendOrigin = frontendOrigin;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins(frontendOrigin)
                .allowedMethods("GET", "POST")
                .allowedHeaders("Content-Type", "traceparent", "tracestate");
    }
}
