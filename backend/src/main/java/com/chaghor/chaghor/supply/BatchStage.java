package com.chaghor.chaghor.supply;

// Where a tea batch sits in the warehouse pipeline. Backs the Warehouse Stock
// Distribution panel (one bar per stage).
public enum BatchStage {
    READY_FOR_DISPATCH,
    PROCESSING,
    RAW_LEAF
}
