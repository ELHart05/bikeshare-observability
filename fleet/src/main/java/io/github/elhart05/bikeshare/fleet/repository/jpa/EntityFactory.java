package io.github.elhart05.bikeshare.fleet.repository.jpa;

import io.github.elhart05.bikeshare.fleet.domain.BikeStatus;

/**
 * Builds persistence entities.
 *
 * <p>Entity constructors are package-private.
 * This factory is the only public entry point, used to load the initial
 * data.</p>
 */
public final class EntityFactory {

    private EntityFactory() {
    }

    public static StationEntity station(String code, String name, int capacity,
                                        boolean outOfService) {
        return new StationEntity(code, name, capacity, outOfService);
    }

    public static BikeEntity availableBike(String id, String stationCode) {
        return new BikeEntity(id, stationCode, BikeStatus.AVAILABLE);
    }

    public static BikeEntity bikeInMaintenance(String id, String stationCode) {
        return new BikeEntity(id, stationCode, BikeStatus.MAINTENANCE);
    }
}
