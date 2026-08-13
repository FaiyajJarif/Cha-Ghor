package com.chaghor.chaghor.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

// What someone supplies when ASKING for an account. Distinct from
// RegisterRequest, which is what an ADMIN supplies when creating one.
//
// ============================================================================
// THE ROLE FIELD IS A STRING, AND THERE IS NO Role TYPE HERE. THAT IS THE POINT.
// ============================================================================
//
// RegisterRequest takes `Role role`, which accepts any value the enum has --
// including admin. If this record did the same, the signup form would be an
// admin-account vending machine: post role=admin, wait for someone in the
// office to click approve on a queue full of similar-looking rows, and the
// estate has a second administrator.
//
// So the wire type is a String, the service maps only "worker" and
// "supervisor", and anything else is rejected. Privilege that cannot be
// requested cannot be granted by mistake.
//
// The account is created PENDING regardless. Nothing in this payload can set
// approval_status -- it is not a field here, and the service never reads one.
public record SignupRequest(

        @NotBlank(message = "Please enter your name.")
        @Size(max = 120, message = "Name is too long.")
        String fullName,

        @NotBlank(message = "Please choose a username.")
        @Size(min = 3, max = 60, message = "Username must be between 3 and 60 characters.")
        @Pattern(regexp = "^[A-Za-z0-9._-]+$",
                 message = "Username can use letters, numbers, dot, underscore and hyphen only - no spaces.")
        String username,

        // Optional. A tea plucker may not have one, and an account request must
        // not be blocked on that.
        @Email(message = "That email address does not look right.")
        @Size(max = 160, message = "Email is too long.")
        String email,

        // Bangladeshi mobile, the form the SMS module already uses elsewhere.
        // Optional for the same reason as email.
        @Pattern(regexp = "^$|^\\+?8801[3-9]\\d{8}$",
                 message = "Phone should look like +8801XXXXXXXXX.")
        String phone,

        // LENGTH ALONE IS NOT STRENGTH. "12345678" passed the old rule.
        //
        // Each lookahead asserts one character class is present without
        // consuming anything, then .{8,72} measures the whole string. The
        // maximum is 72 because BCrypt silently ignores every byte past it --
        // without a cap two different long passwords would both authenticate.
        @NotBlank(message = "A password is required.")
        @Pattern(regexp = "^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,72}$",
                 message = "Password must be 8-72 characters and include a capital letter, a small letter, a number and a symbol such as ! # or @.")
        String password,

        // "worker" or "supervisor" only. Validated in the service, not by an
        // enum, precisely so "admin" cannot be deserialised into existence.
        @NotBlank(message = "Choose whether you are a worker or a supervisor.")
        String role
) {
}
