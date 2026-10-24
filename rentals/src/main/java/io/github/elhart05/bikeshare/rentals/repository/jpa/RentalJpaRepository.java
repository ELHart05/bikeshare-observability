package io.github.elhart05.bikeshare.rentals.repository.jpa;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

/** Spring Data access to rentals. */
public interface RentalJpaRepository extends JpaRepository<RentalEntity, String> {

    List<RentalEntity> findAllByOrderByReferenceDesc();

    int countByStartStation(String startStation);
}
