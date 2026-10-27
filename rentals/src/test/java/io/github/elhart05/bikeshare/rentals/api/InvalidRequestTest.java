package io.github.elhart05.bikeshare.rentals.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;

/**
 * Regression test for a real leak.
 *
 * <p>By default, Spring logs the value rejected by validation at WARN. An
 * address followed by a space ended up in the log in full, without a single
 * line of our code putting it there.</p>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ExtendWith(OutputCaptureExtension.class)
class InvalidRequestTest {

    private static final String EMAIL = "camille.rey@example.com";

    @LocalServerPort
    private int port;

    private int post(String body) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/rentals"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        return HttpClient.newHttpClient()
                .send(req, HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    @Test
    void invalid_request_stays_400_and_leaves_nothing_in_logs(CapturedOutput output)
            throws Exception {
        int badEmail = post("""
                {"stationCode":"ST-COMEDIE","email":"%s ","password":"x"}""".formatted(EMAIL));
        int blankSecret = post("""
                {"stationCode":"ST-COMEDIE","email":"%s","password":"  "}""".formatted(EMAIL));

        assertThat(badEmail).isEqualTo(400);
        assertThat(blankSecret).isEqualTo(400);
        assertThat(output.getAll()).doesNotContain(EMAIL, "password");
    }
}
