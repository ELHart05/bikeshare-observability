package io.github.elhart05.bikeshare.fleet.api;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.elhart05.bikeshare.fleet.api.view.DropOffRequest;
import io.github.elhart05.bikeshare.fleet.api.view.MovementView;
import io.github.elhart05.bikeshare.fleet.api.view.StationView;
import io.github.elhart05.bikeshare.fleet.api.view.TurnoverIndexView;
import io.github.elhart05.bikeshare.fleet.domain.Bike;
import io.github.elhart05.bikeshare.fleet.domain.Station;
import io.github.elhart05.bikeshare.fleet.service.FleetService;
import jakarta.validation.Valid;

/**
 * HTTP layer of the fleet service.
 *
 * <p>Turns a request into a service call and a domain result into a
 * representation.
 * It computes nothing, decides nothing and translates no error (see {@link ErrorHandler}).</p>
 *
 * <p>The browser never calls this service.
 * Only the rentals service talks to it, so no CORS configuration is needed here.</p>
 */
@RestController
@RequestMapping("/stations")
public class FleetController {

    private final FleetService service;

    FleetController(FleetService service) {
        this.service = service;
    }

    @GetMapping
    public List<StationView> list() {
        return service.stations().stream().map(this::view).toList();
    }

    @GetMapping("/{code}")
    public StationView get(@PathVariable String code) {
        return view(service.station(code));
    }

    @PostMapping("/{code}/pickup")
    public MovementView pickup(@PathVariable String code) {
        Bike bike = service.pickUp(code);
        return new MovementView(code, bike.id(), service.available(code));
    }

    @PostMapping("/{code}/drop-off")
    public MovementView dropOff(@PathVariable String code,
                                @Valid @RequestBody DropOffRequest request) {
        Bike bike = service.dropOff(code, request.bikeId());
        return new MovementView(code, bike.id(), service.available(code));
    }

    @GetMapping("/{code}/turnover-index")
    public TurnoverIndexView turnoverIndex(@PathVariable String code) {
        return new TurnoverIndexView(code, service.turnoverIndex(code));
    }

    private StationView view(Station station) {
        return StationView.of(station, service.available(station.code()));
    }
}
