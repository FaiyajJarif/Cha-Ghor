package com.chaghor.chaghor.attendance;

import com.chaghor.chaghor.attendance.dto.AttendanceBulkRequest;
import com.chaghor.chaghor.attendance.dto.AttendanceEntryRequest;
import com.chaghor.chaghor.attendance.dto.AttendanceResponse;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AttendanceService {

    private final AttendanceRepository attendanceRepository;
    private final WorkerRepository workerRepository;
    private final UserRepository userRepository;

    // Existing marks for a day, so the sheet can prefill what was already saved.
    @Transactional(readOnly = true)
    public List<AttendanceResponse> listByDate(LocalDate date) {
        LocalDate d = (date != null) ? date : LocalDate.now();
        List<AttendanceResponse> out = new ArrayList<>();
        for (Attendance a : attendanceRepository.findByWorkDate(d)) {
            out.add(new AttendanceResponse(a.getWorkerId(), a.getWorkDate(), a.getStatus().name(), a.getZoneId()));
        }
        return out;
    }

    // Upsert every entry for the given date. Because of UNIQUE(worker_id,
    // work_date) we update the existing row when there is one, else insert.
    @Transactional
    public List<AttendanceResponse> bulkUpsert(AttendanceBulkRequest req, String markedByUsername) {
        if (req == null || req.date() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A date is required");
        }
        if (req.entries() == null || req.entries().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No attendance entries were provided");
        }
        Long markedBy = (markedByUsername == null)
                ? null
                : userRepository.findByUsername(markedByUsername).map(u -> u.getId()).orElse(null);

        List<AttendanceResponse> out = new ArrayList<>();
        for (AttendanceEntryRequest e : req.entries()) {
            if (e.workerId() == null) {
                continue;
            }
            Worker worker = workerRepository.findById(e.workerId()).orElse(null);
            if (worker == null) {
                continue; // skip unknown workers instead of failing the whole batch
            }
            AttendanceStatus status = parseStatus(e.status());
            Attendance a = attendanceRepository.findByWorkerIdAndWorkDate(e.workerId(), req.date())
                    .orElseGet(Attendance::new);
            a.setWorkerId(e.workerId());
            a.setWorkDate(req.date());
            a.setStatus(status);
            a.setZoneId(worker.getZoneId());
            a.setMarkedBy(markedBy);
            attendanceRepository.save(a);
            out.add(new AttendanceResponse(a.getWorkerId(), a.getWorkDate(), a.getStatus().name(), a.getZoneId()));
        }
        return out;
    }

    private AttendanceStatus parseStatus(String s) {
        if (s == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing status");
        }
        try {
            return AttendanceStatus.valueOf(s.trim().toLowerCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + s);
        }
    }
}
