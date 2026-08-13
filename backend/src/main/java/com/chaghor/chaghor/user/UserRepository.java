package com.chaghor.chaghor.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);

    // CASE-INSENSITIVE LOOKUP, for the login path only.
    //
    // The unique index on users.username is case-SENSITIVE, so "Rahim" and
    // "rahim" could become two accounts for one person. Registration now
    // lower-cases before storing, which closes that -- but it would also have
    // meant somebody who registered as "Rahim" could never sign in as "Rahim"
    // again, because this lookup matched exactly.
    //
    // Everything downstream keeps using findByUsername with the JWT subject,
    // which is the canonical stored value, so only these two entry points need
    // to be forgiving.
    Optional<User> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);

    // users.email is UNIQUE (V1) but nullable, so this is checked before the
    // insert to produce a readable message rather than a constraint violation.
    boolean existsByEmailIgnoreCase(String email);

    // The approval queue. Oldest first, so nobody waits behind a later arrival.
    java.util.List<User> findByApprovalStatusOrderByRequestedAtAsc(String approvalStatus);

    long countByApprovalStatus(String approvalStatus);

    // Uniqueness check before issuing a PIN. The unique index is the real
    // guarantee; this is what turns a constraint violation into a retry.
    boolean existsByPinLookup(String pinLookup);

    // PIN login resolves by phone. Returns a LIST, not an Optional: a shared
    // handset means two accounts can carry one number, and Optional would throw
    // rather than let the PIN disambiguate them.
    java.util.List<User> findByPhone(String phone);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    // Used to populate the supervisor dropdown in the Workforce module.
    List<User> findByRole(Role role);
}
