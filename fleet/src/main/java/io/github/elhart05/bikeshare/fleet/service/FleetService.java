package io.github.elhart05.bikeshare.fleet.service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.github.elhart05.bikeshare.fleet.domain.Bike;
import io.github.elhart05.bikeshare.fleet.domain.BikeStatus;
import io.github.elhart05.bikeshare.fleet.domain.Station;
import io.github.elhart05.bikeshare.fleet.repository.FleetRepository;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.instrumentation.annotations.SpanAttribute;
import io.opentelemetry.instrumentation.annotations.WithSpan;

/**
 * Fleet rules.
 *
 * <p>This class knows nothing about HTTP.
 * It returns domain objects or throws a domain exception;
 * the API layer picks the status code.</p>
 */
@Service
public class FleetService {

    private static final Logger log = LoggerFactory.getLogger(FleetService.class);

    /** Without the agent, this tracer is a no-op. */
    private static final Tracer tracer =
            GlobalOpenTelemetry.getTracer("io.github.elhart05.bikeshare.fleet", "1.0.0");

    private final FleetRepository repository;
    private final int consolidationMs;

    FleetService(FleetRepository repository, @Value("${fleet.consolidation-ms:500}") int consolidationMs) {
        this.repository = repository;
        this.consolidationMs = consolidationMs;
    }

    public List<Station> stations() {
        return repository.stations();
    }

    public Station station(String code) {
        return repository.byCode(code).orElseThrow(() -> new StationNotFound(code));
    }

    public int available(String code) {
        return repository.available(code);
    }

    /**
     * Picks up a bike from a station.
     *
     * @return the bike picked up
     * @throws StationNotFound     no station has this code
     * @throws StationOutOfService the station is out of service
     * @throws MovementNotAllowed  the station has no available bike left
     */
    public Bike pickUp(String code) {
        Span span = tracer.spanBuilder("fleet.pickup").startSpan();
        try (var scope = span.makeCurrent()) {
            span.setAttribute("bikeshare.station.code", code);
            try {
                Station station = station(code);
                if (station.outOfService()) {
                    throw new StationOutOfService(code);
                }
                Bike bike = repository.firstAvailable(code)
                        .orElseThrow(() -> new MovementNotAllowed(
                                "no bike available at station " + code));
                repository.pickUp(bike.id());
                span.setAttribute("bikeshare.bike.id", bike.id());
                return new Bike(bike.id(), null, BikeStatus.IN_USE);
            } catch (StationNotFound | StationOutOfService | MovementNotAllowed failure) {
                //  WARN, not ERROR: the fleet applied its rule and keeps serving.
                //  The agent records the HTTP status; this line records why.
                String reason = reasonFor(failure);
                span.setStatus(StatusCode.ERROR, failure.getMessage());
                span.recordException(failure);
                span.setAttribute("bikeshare.fleet.rejection.reason", reason);
                log.atWarn()
                   .setMessage("fleet.pickup_rejected")
                   .addKeyValue("bikeshare.station.code", code)
                   .addKeyValue("bikeshare.fleet.rejection.reason", reason)
                   .log();
                throw failure;
            }
        } finally {
            span.end();
        }
    }

    /**
     * Drops off a bike at a station.
     *
     * @return the bike dropped off
     * @throws StationNotFound     no station has this code
     * @throws StationOutOfService the station is out of service
     * @throws MovementNotAllowed  the bike is unknown, not in use,
     *                             or every dock is occupied
     */
    public Bike dropOff(String code, String bikeId) {
        Station station = station(code);
        if (station.outOfService()) {
            throw new StationOutOfService(code);
        }
        Bike bike = repository.bike(bikeId)
                .orElseThrow(() -> new MovementNotAllowed("unknown bike: " + bikeId));
        if (bike.status() != BikeStatus.IN_USE) {
            throw new MovementNotAllowed("bike " + bikeId + " is not in use");
        }
        if (repository.docked(code) >= station.capacity()) {
            throw new MovementNotAllowed("all docks at " + code + " are occupied");
        }
        repository.dropOff(bikeId, code);
        return new Bike(bikeId, code, BikeStatus.AVAILABLE);
    }

    /**
     * Consolidates the turnover index of a station.
     *
     * <p>The index is the percentage of bikes attached to the station that
     * are actually available.
     * Consolidation takes a <b>fixed, deliberately long</b> time.
     * It is the operation operators find slow.</p>
     *
     * @throws StationNotFound no station has this code
     */
    public int turnoverIndex(String code) {
        Station station = station(code);
        List<Bike> bikes = repository.bikesAt(station.code());
        consolidate(station.code(), consolidationMs);
        if (bikes.isEmpty()) {
            return 0;
        }
        long available = bikes.stream().filter(b -> b.status() == BikeStatus.AVAILABLE).count();
        return (int) Math.round(100.0 * available / bikes.size());
    }

    /**
     * The consolidation itself.
     *
     * <p>Without this span the trace has a gap: the request takes 500 ms, its
     * SQL queries a few milliseconds, and nothing shows where the rest went.
     * The annotation is enough, since the goal is only to make the step visible.
     * The agent creates the span, even on a private method; without the
     * agent, the annotation does nothing.</p>
     */
    @WithSpan("fleet.consolidation")
    private static void consolidate(@SpanAttribute("bikeshare.station.code") String code,
                                    @SpanAttribute("bikeshare.fleet.consolidation_ms") int millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String reasonFor(RuntimeException failure) {
        if (failure instanceof StationNotFound) {
            return "station_not_found";
        }
        return failure instanceof StationOutOfService ? "station_out_of_service" : "no_bike_available";
    }
}
