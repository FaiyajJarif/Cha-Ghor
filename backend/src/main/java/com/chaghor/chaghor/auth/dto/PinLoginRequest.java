package com.chaghor.chaghor.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

// Sign in with a mobile number and a 4-digit PIN.
//
// BOTH FIELDS ARE REQUIRED, and that is the security property, not a form
// convention. A PIN on its own is 10,000 possibilities shared across the whole
// estate: guessing at random would land on somebody's account roughly once
// every 10,000/N attempts. Requiring the phone number first means an attacker
// must pick a target and then beat 1-in-10,000 against the rate limiter.
public record PinLoginRequest(

        @NotBlank(message = "Enter your mobile number.")
        @Pattern(regexp = "^\\+?8801[3-9]\\d{8}$",
                 message = "Enter the mobile number registered with the estate.")
        String phone,

        @NotBlank(message = "Enter your 4-digit PIN.")
        @Pattern(regexp = "^\\d{4}$", message = "The PIN is 4 digits.")
        String pin
) {
}
