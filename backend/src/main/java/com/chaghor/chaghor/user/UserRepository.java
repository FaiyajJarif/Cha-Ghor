package com.chaghor.chaghor.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    // Used to populate the supervisor dropdown in the Workforce module.
    List<User> findByRole(Role role);
}
