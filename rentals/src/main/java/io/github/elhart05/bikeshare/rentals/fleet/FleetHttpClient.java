package io.github.elhart05.bikeshare.rentals.fleet;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * HTTP client for the fleet service.
 *
 * <p>The only place in the rentals service that knows the fleet is reached
 * over the network.
 * It turns fleet status codes into domain failures,
 * so the service layer never has to read an HTTP status.</p>
 *
 * <p>Two situations are kept apart:</p>
 * <ul>
 *   <li>the fleet <b>answered</b>, and said no;</li>
 *   <li>the fleet <b>did not answer</b> (stopped, unreachable, too slow).</li>
 * </ul>
 */
@Component
public class FleetHttpClient implements FleetClient {

    /** Body sent to the fleet to drop off a bike. */
    private record DropOffRequest(String bikeId) {
    }

    /** What the fleet answers when asked for a turnover index. */
    private record TurnoverIndex(String stationCode, int index) {
    }

    private final RestClient client;
    private final String fleetUrl;

    FleetHttpClient(RestClient fleetRestClient,
                    @Value("${rentals.fleet-url}") String fleetUrl) {
        this.client = fleetRestClient;
        this.fleetUrl = fleetUrl;
    }

    @Override
    public List<FleetStation> stations() {
        try {
            FleetStation[] received = client.get().uri("/stations")
                    .retrieve().body(FleetStation[].class);
            return received == null ? List.of() : List.of(received);
        } catch (RestClientResponseException e) {
            throw translate(null, e);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    @Override
    public FleetMovement pickUp(String stationCode) {
        try {
            return require(client.post().uri("/stations/{code}/pickup", stationCode)
                    .retrieve().body(FleetMovement.class));
        } catch (RestClientResponseException e) {
            throw translate(stationCode, e);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    @Override
    public FleetMovement dropOff(String stationCode, String bikeId) {
        try {
            return require(client.post().uri("/stations/{code}/drop-off", stationCode)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new DropOffRequest(bikeId))
                    .retrieve().body(FleetMovement.class));
        } catch (RestClientResponseException e) {
            throw translate(stationCode, e);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    @Override
    public int turnoverIndex(String stationCode) {
        try {
            return require(client.get().uri("/stations/{code}/turnover-index", stationCode)
                    .retrieve().body(TurnoverIndex.class)).index();
        } catch (RestClientResponseException e) {
            throw translate(stationCode, e);
        } catch (ResourceAccessException e) {
            throw unreachable(e);
        }
    }

    private static <T> T require(T body) {
        if (body == null) {
            throw new FleetUnavailable("fleet service returned an empty body");
        }
        return body;
    }

    private FleetUnavailable unreachable(ResourceAccessException cause) {
        return new FleetUnavailable("fleet service unreachable: " + fleetUrl, cause);
    }

    /** Turns a fleet error response into a domain failure. */
    private RuntimeException translate(String stationCode, RestClientResponseException e) {
        String detail = detailOf(e);
        if (e.getStatusCode().isSameCodeAs(HttpStatus.NOT_FOUND)) {
            return new UnknownStation(stationCode == null ? "?" : stationCode);
        }
        if (e.getStatusCode().isSameCodeAs(HttpStatus.CONFLICT)) {
            return new MovementRefused(detail);
        }
        if (e.getStatusCode().isSameCodeAs(HttpStatus.SERVICE_UNAVAILABLE)) {
            return new FleetUnavailable(detail);
        }
        return new FleetUnavailable(
                "fleet service responded " + e.getStatusCode().value() + ": " + detail);
    }

    private static String detailOf(RestClientResponseException e) {
        ProblemDetail problem = e.getResponseBodyAs(ProblemDetail.class);
        String detail = problem == null ? null : problem.getDetail();
        return detail == null ? e.getStatusText() : detail;
    }
}
