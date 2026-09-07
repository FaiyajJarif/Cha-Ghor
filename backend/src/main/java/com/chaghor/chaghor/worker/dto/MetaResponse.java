package com.chaghor.chaghor.worker.dto;

import java.util.List;

// Dropdown data for the worker create/edit form.
public record MetaResponse(List<OptionResponse> supervisors, List<OptionResponse> zones) {
}
