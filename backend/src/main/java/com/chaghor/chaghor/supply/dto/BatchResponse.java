package com.chaghor.chaghor.supply.dto;

import com.chaghor.chaghor.supply.TeaBatch;

import java.math.BigDecimal;

// A batch card in the Dispatch Readiness panel.
public record BatchResponse(
        Long id,
        String batchCode,
        String grade,
        BigDecimal qualityPct,
        String qualityNote,
        String stage,
        BigDecimal weightKg,
        String readiness) {

    public static BatchResponse from(TeaBatch b) {
        return new BatchResponse(
                b.getId(),
                b.getBatchCode(),
                b.getGrade(),
                b.getQualityPct(),
                b.getQualityNote(),
                b.getStage().name(),
                b.getWeightKg(),
                b.getReadiness().name());
    }
}
