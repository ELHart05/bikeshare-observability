package io.github.elhart05.bikeshare.fleet.repository.jpa;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

/** Spring Data access to stations. */
public interface StationJpaRepository extends JpaRepository<StationEntity, String> {

    List<StationEntity> findAllByOrderByCodeAsc();
}
