package io.github.elhart05.bikeshare.rentals.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import io.github.elhart05.bikeshare.rentals.fleet.FleetUnavailable;
import io.github.elhart05.bikeshare.rentals.fleet.MovementRefused;
import io.github.elhart05.bikeshare.rentals.fleet.UnknownStation;
import io.github.elhart05.bikeshare.rentals.service.RentalAlreadyClosed;
import io.github.elhart05.bikeshare.rentals.service.RentalNotFound;
import io.github.elhart05.bikeshare.rentals.service.SubscriberRejected;

/**
 * The only place in the service that turns a domain failure into an HTTP
 * response, as an RFC 9457 {@code ProblemDetail}.
 *
 * <p>A fleet rejection stays a conflict (409), while fleet unavailability
 * becomes unavailability of this service (503).
 * A caller that only saw a 500 could not tell which of the two services
 * is at fault.</p>
 */
@RestControllerAdvice
public class ErrorHandler {

    @ExceptionHandler({RentalNotFound.class, UnknownStation.class})
    public ProblemDetail notFound(RuntimeException failure) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, failure.getMessage());
    }

    @ExceptionHandler({RentalAlreadyClosed.class, MovementRefused.class})
    public ProblemDetail conflict(RuntimeException failure) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, failure.getMessage());
    }

    @ExceptionHandler(SubscriberRejected.class)
    public ProblemDetail unauthorized(SubscriberRejected failure) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, failure.getMessage());
    }

    @ExceptionHandler(FleetUnavailable.class)
    public ProblemDetail unavailable(FleetUnavailable failure) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                                                failure.getMessage());
    }
}
