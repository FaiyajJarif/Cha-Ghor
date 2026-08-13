package com.chaghor.chaghor.settings.dto;

public record EstateSettingsRequest(
        String estateName,
        String logoUrl,
        String currency
) {
}
