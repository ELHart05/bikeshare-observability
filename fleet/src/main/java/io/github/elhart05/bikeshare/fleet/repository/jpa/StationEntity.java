package io.github.elhart05.bikeshare.fleet.repository.jpa;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A station, as stored.
 *
 * <p>Separate from {@link io.github.elhart05.bikeshare.fleet.domain.Station}:
 * persistence annotations do not cross into the domain.</p>
 */
@Entity
@Table(name = "station")
public class StationEntity {

    @Id
    @Column(length = 32)
    private String code;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false)
    private int capacity;

    @Column(name = "out_of_service", nullable = false)
    private boolean outOfService;

    protected StationEntity() {
        //  required by JPA
    }

    StationEntity(String code, String name, int capacity, boolean outOfService) {
        this.code = code;
        this.name = name;
        this.capacity = capacity;
        this.outOfService = outOfService;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public int getCapacity() {
        return capacity;
    }

    public boolean isOutOfService() {
        return outOfService;
    }
}
