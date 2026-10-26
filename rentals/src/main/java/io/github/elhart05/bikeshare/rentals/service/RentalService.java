package io.github.elhart05.bikeshare.rentals.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.event.Level;
import org.springframework.stereotype.Service;

import io.github.elhart05.bikeshare.rentals.domain.Fare;
import io.github.elhart05.bikeshare.rentals.domain.Rental;
import io.github.elhart05.bikeshare.rentals.fleet.FleetClient;
import io.github.elhart05.bikeshare.rentals.fleet.FleetMovement;
import io.github.elhart05.bikeshare.rentals.fleet.FleetStation;
import io.github.elhart05.bikeshare.rentals.fleet.FleetUnavailable;
import io.github.elhart05.bikeshare.rentals.fleet.MovementRefused;
import io.github.elhart05.bikeshare.rentals.fleet.UnknownStation;
import io.github.elhart05.bikeshare.rentals.repository.RentalRepository;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.metrics.DoubleHistogram;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;

/**
 * Rental rules.
 *
 * <p>This layer makes the domain decisions:
 * who may rent, which bike goes out, what a trip costs.
 * It relies on three collaborators:
 * the rental registry,
 * the fleet (behind a port, {@link FleetClient})
 * and a clock.</p>
 *
 * <p>It does not know HTTP exists.
 * It returns domain objects or throws a domain failure.</p>
 *
 * <p>It is also the only class in the service that logs and creates spans:
 * the agent sees the request, the fleet call and the SQL, but it does not know
 * that a rental is being opened, nor at which step it failed.
 * The report has no span here: its three steps are already agent spans.</p>
 */
@Service
public class RentalService {

    private static final Logger log = LoggerFactory.getLogger(RentalService.class);

    /** Without the agent this tracer is a no-op: the domain code needs no branch for it. */
    private static final Tracer tracer =
            GlobalOpenTelemetry.getTracer("io.github.elhart05.bikeshare.rentals", "1.0.0");

    private static final Meter meter =
            GlobalOpenTelemetry.getMeter("io.github.elhart05.bikeshare.rentals");

    /**
     * The only dimension of both metrics: six values.
     *
     * <p>It is set only once the fleet has accepted: the code sent by the
     * caller is unbounded, the code of an opened rental is not. The reference
     * and the domain are never dimensions; they would create one series per
     * rental or per subscriber.</p>
     */
    private static final AttributeKey<String> START_STATION =
            AttributeKey.stringKey("bikeshare.rental.start_station");

    private static final LongCounter opened = meter
            .counterBuilder("bikeshare.rentals.opened")
            .setDescription("Rentals opened, by start station")
            .build();

    private static final DoubleHistogram amounts = meter
            .histogramBuilder("bikeshare.rentals.amount")
            .setUnit("EUR")
            .setDescription("Amounts billed, by start station")
            .setExplicitBucketBoundariesAdvice(List.of(1.1, 1.25, 1.5, 2.0, 3.0, 5.0, 10.0))
            .build();

    /** Reasons that are not a rejection: someone has to look. */
    private static final Set<String> OUTAGE_REASONS =
            Set.of("fleet_unavailable", "fleet_unreachable", "internal_error");

    private final RentalRepository repository;
    private final FleetClient fleet;
    private final Subscribers subscribers;
    private final Clock clock;

    RentalService(RentalRepository repository, FleetClient fleet, Subscribers subscribers,
                  Clock clock) {
        this.repository = repository;
        this.fleet = fleet;
        this.subscribers = subscribers;
        this.clock = clock;
    }

    /** Stations, as the fleet describes them. */
    public List<FleetStation> stations() {
        return fleet.stations();
    }

    public List<Rental> rentals() {
        return repository.all();
    }

    public Rental rental(String reference) {
        return repository.byReference(reference)
                .orElseThrow(() -> new RentalNotFound(reference));
    }

    /**
     * Opens a rental.
     * Checks the subscriber, has the fleet release a bike,
     * and records the start.
     *
     * <p>The secret goes to {@link Subscribers#verify} and stops there.
     * Of the address, only the domain is kept.</p>
     *
     * @throws SubscriberRejected the subscriber was not recognized
     */
    public Rental open(String stationCode, String email, String secret) {
        Span span = tracer.spanBuilder("rental.open").startSpan();
        try (var scope = span.makeCurrent()) {
            span.setAttribute("bikeshare.rental.start_station", stationCode);
            String step = "subscriber_check";
            //  This catch stays inside the scope: a try-with-resources catch
            //  runs after the scope is closed, and the line would have no trace_id.
            try {
                String domain = subscribers.verify(email, secret);
                span.setAttribute("bikeshare.subscriber.domain", domain);

                step = "fleet_pickup";
                FleetMovement movement = fleet.pickUp(stationCode);
                span.addEvent("bike.picked_up");

                step = "save";
                Rental rental = repository.open(movement.bikeId(), stationCode,
                                                clock.instant(), domain);
                span.setAttribute("bikeshare.rental.reference", rental.reference());
                span.setAttribute("bikeshare.bike.id", rental.bikeId());
                log.atInfo()
                   .setMessage("rental.opened")
                   .addKeyValue("bikeshare.rental.reference", rental.reference())
                   .addKeyValue("bikeshare.bike.id", rental.bikeId())
                   .addKeyValue("bikeshare.rental.start_station", stationCode)
                   .addKeyValue("bikeshare.subscriber.domain", domain)
                   .log();
                opened.add(1, Attributes.of(START_STATION, stationCode));
                return rental;
            } catch (RuntimeException failure) {
                recordFailure(span, "rental.open_failed", step, failure);
                throw failure;
            }
        } finally {
            span.end();
        }
    }

    /**
     * Closes a rental.
     * Has the fleet take the bike back,
     * then computes duration and amount.
     *
     * @throws RentalNotFound      the reference is unknown
     * @throws RentalAlreadyClosed the bike has already been returned
     */
    public Rental returnRental(String reference, String stationCode) {
        Span span = tracer.spanBuilder("rental.return").startSpan();
        try (var scope = span.makeCurrent()) {
            span.setAttribute("bikeshare.rental.reference", reference);
            span.setAttribute("bikeshare.rental.end_station", stationCode);
            String step = "lookup";
            try {
                Rental rental = rental(reference);
                span.setAttribute("bikeshare.rental.start_station", rental.startStation());
                if (!rental.isActive()) {
                    throw new RentalAlreadyClosed(reference);
                }

                step = "fleet_drop_off";
                fleet.dropOff(stationCode, rental.bikeId());
                span.addEvent("bike.dropped_off");

                step = "billing";
                Instant endedAt = clock.instant();
                int minutes = Fare.billedMinutes(rental.startedAt(), endedAt);
                BigDecimal amount = Fare.amount(minutes);
                Rental closed = repository.close(reference, stationCode, endedAt, minutes,
                                                 amount);
                span.setAttribute("bikeshare.rental.duration_minutes", minutes);
                span.setAttribute("bikeshare.rental.amount_eur", amount.doubleValue());
                //  The amount only exists once the rental is closed. The start station
                //  is repeated here so that revenue per station reads from a single
                //  event, without joining with rental.opened.
                log.atInfo()
                   .setMessage("rental.closed")
                   .addKeyValue("bikeshare.rental.reference", reference)
                   .addKeyValue("bikeshare.rental.start_station", rental.startStation())
                   .addKeyValue("bikeshare.rental.end_station", stationCode)
                   .addKeyValue("bikeshare.rental.duration_minutes", minutes)
                   .addKeyValue("bikeshare.rental.amount_eur", amount)
                   .log();
                amounts.record(amount.doubleValue(),
                               Attributes.of(START_STATION, rental.startStation()));
                return closed;
            } catch (RuntimeException failure) {
                recordFailure(span, "rental.return_failed", step, failure);
                throw failure;
            }
        } finally {
            span.end();
        }
    }

    /**
     * Builds the operations report for a rental.
     *
     * <p>It needs a figure only the fleet can compute,
     * and computing it takes time.
     * This is the operation users complain about.</p>
     *
     * @throws RentalNotFound the reference is unknown
     */
    public Report report(String reference) {
        Rental rental = rental(reference);
        int index = fleet.turnoverIndex(rental.startStation());
        int rentalsFromStation = repository.countByStartStation(rental.startStation());
        return new Report(reference, rental.startStation(), index, rentalsFromStation);
    }

    /**
     * A failure: the span goes to error, and a single log line says why.
     *
     * <p>A domain rejection is a WARN: the service did its job and the next
     * request will go through. An outage is an ERROR: nobody can rent here
     * until someone has looked.
     * Only the ERROR carries the exception; a rejection needs no stack trace.</p>
     */
    private static void recordFailure(Span span, String event, String step,
                                      RuntimeException failure) {
        String reason = reasonFor(failure);
        boolean rejection = !OUTAGE_REASONS.contains(reason);

        span.setStatus(StatusCode.ERROR, failure.getMessage());
        span.recordException(failure);
        span.setAttribute("bikeshare.rental.failure.step", step);
        span.setAttribute("bikeshare.rental.failure.reason", reason);

        var line = log.atLevel(rejection ? Level.WARN : Level.ERROR)
                      .setMessage(event)
                      .addKeyValue("bikeshare.rental.failure.step", step)
                      .addKeyValue("bikeshare.rental.failure.reason", reason)
                      .addKeyValue("bikeshare.rental.failure.detail", failure.getMessage());
        if (!rejection) {
            line = line.setCause(failure);
        }
        line.log();
    }

    /** A closed set of values, so they can be counted. */
    private static String reasonFor(RuntimeException failure) {
        if (failure instanceof SubscriberRejected) {
            return "subscriber_rejected";
        }
        if (failure instanceof UnknownStation) {
            return "unknown_station";
        }
        if (failure instanceof MovementRefused) {
            return "movement_refused";
        }
        if (failure instanceof RentalNotFound) {
            return "rental_not_found";
        }
        if (failure instanceof RentalAlreadyClosed) {
            return "rental_already_closed";
        }
        if (failure instanceof FleetUnavailable) {
            //  Both give the same 503. Only the cause tells them apart: the fleet
            //  answered that it could not serve, or it did not answer at all.
            return failure.getCause() == null ? "fleet_unavailable" : "fleet_unreachable";
        }
        return "internal_error";
    }
}
