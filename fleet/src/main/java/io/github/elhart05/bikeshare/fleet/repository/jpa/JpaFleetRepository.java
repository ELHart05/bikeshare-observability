package io.github.elhart05.bikeshare.fleet.repository.jpa;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import io.github.elhart05.bikeshare.fleet.domain.Bike;
import io.github.elhart05.bikeshare.fleet.domain.BikeStatus;
import io.github.elhart05.bikeshare.fleet.domain.Station;
import io.github.elhart05.bikeshare.fleet.repository.FleetRepository;

/**
 * Database storage.
 *
 * <p>The only place in the service that knows JPA.
 * It maps entities to domain objects and never exposes an entity.</p>
 */
@Repository
public class JpaFleetRepository implements FleetRepository {

    private final StationJpaRepository stations;
    private final BikeJpaRepository bikes;

    JpaFleetRepository(StationJpaRepository stations, BikeJpaRepository bikes) {
        this.stations = stations;
        this.bikes = bikes;
    }

    @Override
    public List<Station> stations() {
        return stations.findAllByOrderByCodeAsc().stream().map(JpaFleetRepository::station).toList();
    }

    @Override
    public Optional<Station> byCode(String code) {
        return stations.findById(code).map(JpaFleetRepository::station);
    }

    @Override
    public List<Bike> bikesAt(String code) {
        return bikes.findByStationCodeOrderByIdAsc(code).stream()
                .map(JpaFleetRepository::bike).toList();
    }

    @Override
    public int available(String code) {
        return bikes.countByStationCodeAndStatus(code, BikeStatus.AVAILABLE);
    }

    @Override
    public int docked(String code) {
        return bikes.countByStationCode(code);
    }

    @Override
    public Optional<Bike> firstAvailable(String code) {
        return bikes.findByStationCodeAndStatusOrderByIdAsc(code, BikeStatus.AVAILABLE)
                .stream().findFirst().map(JpaFleetRepository::bike);
    }

    @Override
    public Optional<Bike> bike(String id) {
        return bikes.findById(id).map(JpaFleetRepository::bike);
    }

    @Override
    @Transactional
    public void pickUp(String id) {
        bikes.findById(id).ifPresent(e -> e.place(null, BikeStatus.IN_USE));
    }

    @Override
    @Transactional
    public void dropOff(String id, String code) {
        bikes.findById(id).ifPresent(e -> e.place(code, BikeStatus.AVAILABLE));
    }

    @Override
    public int totalBikes() {
        return (int) bikes.count();
    }

    private static Station station(StationEntity e) {
        return new Station(e.getCode(), e.getName(), e.getCapacity(), e.isOutOfService());
    }

    private static Bike bike(BikeEntity e) {
        return new Bike(e.getId(), e.getStationCode(), e.getStatus());
    }
}
