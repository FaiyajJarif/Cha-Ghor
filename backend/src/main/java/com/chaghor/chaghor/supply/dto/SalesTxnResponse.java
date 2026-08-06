package com.chaghor.chaghor.supply.dto;

import com.chaghor.chaghor.supply.SalesTransaction;

import java.math.BigDecimal;
import java.time.LocalDate;

// One row of the Sales Transaction Ledger.
public record SalesTxnResponse(
        Long id,
        String trxId,
        LocalDate txnDate,
        String grade,
        String batchCode,
        String buyer,
        BigDecimal volumeKg,
        BigDecimal ratePerKg,
        BigDecimal netRevenue,
        String payStatus,
        String shipStatus) {

    public static SalesTxnResponse from(SalesTransaction t) {
        return new SalesTxnResponse(
                t.getId(),
                t.getTrxId(),
                t.getTxnDate(),
                t.getGrade(),
                t.getBatchCode(),
                t.getBuyer(),
                t.getVolumeKg(),
                t.getRatePerKg(),
                t.getNetRevenue(),
                t.getPayStatus().name(),
                t.getShipStatus().name());
    }
}
