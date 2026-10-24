package io.github.elhart05.bikeshare.rentals.repository.jpa;

import java.math.BigDecimal;
import java.time.Instant;

import io.github.elhart05.bikeshare.rentals.domain.RentalStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A rental, as stored. */
@Entity
@Table(name = "rental")
public class RentalEntity {

    @Id
    @Column(length = 32)
    private String reference;

    @Column(name = "bike_id", nullable = false, length = 32)
    private String bikeId;

    @Column(name = "start_station", nullable = false, length = 32)
    private String startStation;

    @Column(name = "end_station", length = 32)
    private String endStation;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Column(name = "duration_minutes", nullable = false)
    private int durationMinutes;

    @Column(precision = 8, scale = 2)
    private BigDecimal amount;

    /**
     * Domain of the subscriber's email address.
     *
     * <p>There is no column for the full address, and none for the
     * password.</p>
     */
    @Column(name = "subscriber_domain", nullable = false, length = 80)
    private String subscriberDomain;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private RentalStatus status;

    protected RentalEntity() {
        //  required by JPA
    }

    RentalEntity(String reference, String bikeId, String startStation,
                 Instant startedAt, String subscriberDomain) {
        this.reference = reference;
        this.bikeId = bikeId;
        this.startStation = startStation;
        this.startedAt = startedAt;
        this.subscriberDomain = subscriberDomain;
        this.durationMinutes = 0;
        this.status = RentalStatus.ACTIVE;
    }

    public String getReference() {
        return reference;
    }

    public String getBikeId() {
        return bikeId;
    }

    public String getStartStation() {
        return startStation;
    }

    public String getEndStation() {
        return endStation;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public Instant getEndedAt() {
        return endedAt;
    }

    public int getDurationMinutes() {
        return durationMinutes;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getSubscriberDomain() {
        return subscriberDomain;
    }

    public RentalStatus getStatus() {
        return status;
    }

    void close(String endStation, Instant endedAt, int durationMinutes, BigDecimal amount) {
        this.endStation = endStation;
        this.endedAt = endedAt;
        this.durationMinutes = durationMinutes;
        this.amount = amount;
        this.status = RentalStatus.CLOSED;
    }
}
