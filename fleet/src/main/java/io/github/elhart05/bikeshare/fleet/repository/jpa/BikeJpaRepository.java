package io.github.elhart05.bikeshare.fleet.repository.jpa;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import io.github.elhart05.bikeshare.fleet.domain.BikeStatus;

/** Spring Data access to bikes. */
public interface BikeJpaRepository extends JpaRepository<BikeEntity, String> {

    List<BikeEntity> findByStationCodeOrderByIdAsc(String stationCode);

    List<BikeEntity> findByStationCodeAndStatusOrderByIdAsc(
            String stationCode, BikeStatus status);

    int countByStationCode(String stationCode);

    int countByStationCodeAndStatus(String stationCode, BikeStatus status);
}
