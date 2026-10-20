package io.github.elhart05.bikeshare.fleet.repository.jpa;

import io.github.elhart05.bikeshare.fleet.domain.BikeStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A bike, as stored.
 *
 * <p>Separate from {@link io.github.elhart05.bikeshare.fleet.domain.Bike}:
 * persistence annotations do not cross into the domain.</p>
 */
@Entity
@Table(name = "bike")
public class BikeEntity {

    @Id
    @Column(length = 32)
    private String id;

    @Column(name = "station_code", length = 32)
    private String stationCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private BikeStatus status;

    protected BikeEntity() {
        //  required by JPA
    }

    BikeEntity(String id, String stationCode, BikeStatus status) {
        this.id = id;
        this.stationCode = stationCode;
        this.status = status;
    }

    public String getId() {
        return id;
    }

    public String getStationCode() {
        return stationCode;
    }

    public BikeStatus getStatus() {
        return status;
    }

    void place(String stationCode, BikeStatus status) {
        this.stationCode = stationCode;
        this.status = status;
    }
}
