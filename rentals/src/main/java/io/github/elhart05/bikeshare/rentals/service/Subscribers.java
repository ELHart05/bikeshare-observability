package io.github.elhart05.bikeshare.rentals.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;

import org.springframework.stereotype.Component;

/**
 * The service's subscribers, and the check of their credentials.
 *
 * <p>Secrets are not stored, only their hash, and the comparison runs in
 * constant time.
 * A real authentication component would use a slow key derivation function
 * rather than a plain digest; that is out of scope here.</p>
 *
 * <p><b>The secret supplied never leaves this class</b>,
 * and it appears in no error message.</p>
 */
@Component
public class Subscribers {

    /** Subscriber address to hex SHA-256 hash of their secret. */
    private static final Map<String, String> SECRET_HASHES = Map.of(
            "camille.rey@example.com",
            "cf2225169d39e4d734df27959f58db4803d00228a0a8825d3e60994a0dfd5eec",
            "noam.ferrand@example.com",
            "b32c6cc94f2620a59a0b61fa4e314efa841a2f79a20690c5861c309d89b2153f");

    /**
     * Checks the subscriber.
     *
     * @return the address domain (the only information kept afterwards)
     * @throws SubscriberRejected the address is unknown or the secret is wrong
     */
    public String verify(String email, String secret) {
        String expected = email == null ? null : SECRET_HASHES.get(email);
        String actual = hash(secret);
        if (expected == null || !MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8))) {
            throw new SubscriberRejected();
        }
        return domainOf(email);
    }

    /** Keeps only the domain: "a.b@example.com" becomes "example.com". */
    public static String domainOf(String email) {
        if (email == null) {
            return "unknown";
        }
        int at = email.lastIndexOf('@');
        return at < 0 ? "invalid" : email.substring(at + 1);
    }

    private static String hash(String secret) {
        if (secret == null) {
            return "";
        }
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    sha.digest(secret.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
