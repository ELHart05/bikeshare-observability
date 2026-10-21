package io.github.elhart05.bikeshare.fleet.configuration;

import java.util.List;

import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.github.elhart05.bikeshare.fleet.repository.jpa.BikeJpaRepository;
import io.github.elhart05.bikeshare.fleet.repository.jpa.EntityFactory;
import io.github.elhart05.bikeshare.fleet.repository.jpa.StationJpaRepository;

/**
 * The initial fleet.
 *
 * <p>This data is <b>fixed</b>.
 * The database is in memory and recreated on every start,
 * so two runs start from the same state.
 * That keeps scenarios comparable from one run to the next.</p>
 *
 * <p>The initial fleet has 6 stations and 25 bikes, 21 of them available.
 * One station is out of service, another has no available bike left,
 * and 4 bikes are in maintenance.</p>
 */
@Configuration
public class InitialData {

    /** code, name, capacity, out of service, available bikes, in maintenance. */
    private record Row(String code, String name, int capacity, boolean outOfService,
                       int available, int maintenance) {
    }

    private static final List<Row> FLEET = List.of(
            new Row("ST-ARCEAUX", "Les Arceaux", 12, false, 4, 1),
            new Row("ST-COMEDIE", "Place de la Comédie", 20, false, 7, 0),
            new Row("ST-GARE", "Gare Saint-Roch", 16, false, 0, 2),
            new Row("ST-MOSSON", "Mosson", 10, false, 3, 0),
            new Row("ST-PEYROU", "Promenade du Peyrou", 8, true, 5, 0),
            new Row("ST-TRIOLET", "Campus Triolet", 14, false, 2, 1));

    @Bean
    ApplicationRunner loadFleet(StationJpaRepository stations, BikeJpaRepository bikes) {
        return args -> {
            if (stations.count() > 0) {
                return;
            }
            int number = 1;
            for (Row row : FLEET) {
                stations.save(EntityFactory.station(
                        row.code(), row.name(), row.capacity(), row.outOfService()));
                for (int i = 0; i < row.available(); i++) {
                    bikes.save(EntityFactory.availableBike(
                            bikeId(number++), row.code()));
                }
                for (int i = 0; i < row.maintenance(); i++) {
                    bikes.save(EntityFactory.bikeInMaintenance(
                            bikeId(number++), row.code()));
                }
            }
        };
    }

    private static String bikeId(int number) {
        return String.format("B-%04d", number);
    }
}
