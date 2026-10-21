package io.github.elhart05.bikeshare.fleet.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import io.github.elhart05.bikeshare.fleet.service.MovementNotAllowed;
import io.github.elhart05.bikeshare.fleet.service.StationNotFound;
import io.github.elhart05.bikeshare.fleet.service.StationOutOfService;

/**
 * The only place in the service that turns a domain failure into an HTTP
 * response, as an RFC 9457 {@code ProblemDetail}.
 */
@RestControllerAdvice
public class ErrorHandler {

    @ExceptionHandler(StationNotFound.class)
    public ProblemDetail notFound(StationNotFound failure) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, failure.getMessage());
    }

    @ExceptionHandler(MovementNotAllowed.class)
    public ProblemDetail conflict(MovementNotAllowed failure) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, failure.getMessage());
    }

    @ExceptionHandler(StationOutOfService.class)
    public ProblemDetail unavailable(StationOutOfService failure) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, failure.getMessage());
    }
}
