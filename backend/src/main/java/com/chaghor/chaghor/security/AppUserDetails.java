package com.chaghor.chaghor.security;

import com.chaghor.chaghor.user.ApprovalStatus;
import com.chaghor.chaghor.user.User;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

public class AppUserDetails implements UserDetails {

    private final User user;

    public AppUserDetails(User user) {
        this.user = user;
    }

    public User getUser() {
        return user;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // Spring roles are prefixed with ROLE_ ; hasRole('ADMIN') checks ROLE_ADMIN
        return List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name().toUpperCase()));
    }

    @Override
    public String getPassword() {
        return user.getPasswordHash();
    }

    @Override
    public String getUsername() {
        return user.getUsername();
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    // BOTH CONDITIONS, NOT JUST isActive.
    //
    // A pending signup is created with isActive=false, so isActive alone would
    // already block it today. Requiring approval explicitly means the guarantee
    // survives anything that flips isActive on later -- a bulk reactivation, a
    // hand-written UPDATE, a future admin screen -- without also approving the
    // person. The two flags answer different questions and both must say yes.
    @Override
    public boolean isEnabled() {
        return user.isActive()
                && ApprovalStatus.APPROVED.equals(user.getApprovalStatus());
    }
}
