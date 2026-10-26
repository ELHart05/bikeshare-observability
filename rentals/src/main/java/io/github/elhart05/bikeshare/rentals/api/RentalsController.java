package io.github.elhart05.bikeshare.rentals.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import io.github.elhart05.bikeshare.rentals.api.view.RentalRequest;
import io.github.elhart05.bikeshare.rentals.api.view.RentalView;
import io.github.elhart05.bikeshare.rentals.api.view.ReportView;
import io.github.elhart05.bikeshare.rentals.api.view.ReturnRequest;
import io.github.elhart05.bikeshare.rentals.api.view.StationView;
import io.github.elhart05.bikeshare.rentals.service.RentalService;
import jakarta.validation.Valid;

/**
 * HTTP edge of the rentals service
 * (the only entry point for the web frontend).
 *
 * <p>It turns a request into a service call and a domain result into a
 * representation.
 * It computes nothing, decides nothing and translates no error (see {@link ErrorHandler}).</p>
 */
@RestController
public class RentalsController {

    private final RentalService service;

    RentalsController(RentalService service) {
        this.service = service;
    }

    @GetMapping("/stations")
    public List<StationView> stations() {
        return service.stations().stream().map(StationView::of).toList();
    }

    @GetMapping("/rentals")
    public List<RentalView> rentals() {
        return service.rentals().stream().map(RentalView::of).toList();
    }

    @GetMapping("/rentals/{reference}")
    public RentalView rental(@PathVariable String reference) {
        return RentalView.of(service.rental(reference));
    }

    @PostMapping("/rentals")
    public ResponseEntity<RentalView> open(@Valid @RequestBody RentalRequest request) {
        var rental = service.open(request.stationCode(), request.email(),
                                  request.password());
        return ResponseEntity.status(HttpStatus.CREATED).body(RentalView.of(rental));
    }

    @PostMapping("/rentals/{reference}/return")
    public RentalView returnRental(@PathVariable String reference,
                                   @Valid @RequestBody ReturnRequest request) {
        return RentalView.of(service.returnRental(reference, request.stationCode()));
    }

    @GetMapping("/rentals/{reference}/report")
    public ReportView report(@PathVariable String reference) {
        return ReportView.of(service.report(reference));
    }
}
