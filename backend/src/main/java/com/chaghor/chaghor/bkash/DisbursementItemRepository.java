package com.chaghor.chaghor.bkash;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DisbursementItemRepository extends JpaRepository<DisbursementItem, Long> {

    List<DisbursementItem> findByBatchIdOrderByIdAsc(Long batchId);

    // Guards the picker: a withdrawal already in a draft batch must not be
    // offered again. The UNIQUE index on withdrawal_id is the real defence;
    // this is so the screen never shows an impossible choice.
    boolean existsByWithdrawalId(Long withdrawalId);

    // Every withdrawal that is sitting on a slip, drafted or sent.
    //
    // The Withdrawals panel needs to tell "already approved onto a slip" apart
    // from "cannot be paid at all", and it CANNOT do that by subtracting
    // /bkash/payable from the pending list: payable also drops a worker with no
    // phone on file, so that worker would be badged as though he had been
    // approved when in fact nobody can pay him. Two different situations, one
    // of which needs fixing on the Workforce page.
    @Query("select i.withdrawalId from DisbursementItem i")
    List<Long> allWithdrawalIds();

    // The item holding a given withdrawal, so an import can tell a row that is
    // merely PROPOSED for payment (draft batch) from one already PAID (sent).
    java.util.Optional<DisbursementItem> findByWithdrawalId(Long withdrawalId);

    // Whether a batch still has anything in it, used to clear away a draft that
    // an import emptied.
    long countByBatchId(Long batchId);
}
