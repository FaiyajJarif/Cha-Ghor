package com.chaghor.chaghor.weather;

import com.chaghor.chaghor.attendance.AttendanceRepository;
import com.chaghor.chaghor.attendance.AttendanceStatus;
import com.chaghor.chaghor.leaf.LeafCollection;
import com.chaghor.chaghor.leaf.LeafCollectionRepository;
import com.chaghor.chaghor.weather.dto.RainImpact;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

// What rain actually costs this estate.
//
// This is the measurement that retires a magic number. `forecast()` has been
// cutting expectations by a flat 25% on wet days since it was written, on no
// evidence at all. Everything needed to check that was already in the database.
//
// THE WHOLE THING IS ARITHMETIC. There is no model here and there should not
// be: it is a ratio of two means over a date range, and a supervisor with the
// day sheets could reproduce it by hand. That is the point -- a number you can
// re-derive is worth more in a viva than one you cannot.
@Service
@RequiredArgsConstructor
public class RainImpactService {

    // A day counts as wet at or above this. Matched to the threshold already
    // used by forecast(), PluckAdvisorService and ZoneService -- four different
    // definitions of "heavy rain" across one app would be indefensible.
    private static final BigDecimal WET_THRESHOLD_MM = BigDecimal.valueOf(10);

    // The constant this measurement is trying to replace.
    private static final BigDecimal FALLBACK_FACTOR = new BigDecimal("0.75");

    private static final int WINDOW_DAYS = 180;

    // Below this, say nothing. Five wet days is already a thin basis for a
    // claim; fewer is noise wearing a decimal point. Chosen to be honest rather
    // than to make the feature look available on a fresh install -- on a demo
    // database this will correctly refuse to answer.
    private static final int MIN_DAYS_EACH = 5;

    private final WeatherLogRepository weatherRepository;
    private final LeafCollectionRepository leafRepository;
    private final AttendanceRepository attendanceRepository;

    @Transactional(readOnly = true)
    public RainImpact measure() {
        LocalDate today = LocalDate.now();
        LocalDate start = today.minusDays(WINDOW_DAYS);

        // A day is wet if ANY reading that day hit the threshold. Readings are
        // hourly, so summing them would double-count a shower that persisted
        // across two samples -- Open-Meteo's `precipitation` is per-interval,
        // not cumulative for the day.
        Set<LocalDate> wetDays = new HashSet<>();
        Set<LocalDate> observedDays = new HashSet<>();
        for (WeatherLog w : weatherRepository.findByLogDateBetweenOrderByIdAsc(start, today)) {
            if (w.getLogDate() == null) continue;
            observedDays.add(w.getLogDate());
            BigDecimal mm = w.getRainfallMm();
            if (mm != null && mm.compareTo(WET_THRESHOLD_MM) >= 0) {
                wetDays.add(w.getLogDate());
            }
        }

        // Kilos per day.
        Map<LocalDate, BigDecimal> kgByDay = new HashMap<>();
        for (LeafCollection lc : leafRepository.findByCollectDateBetween(start, today)) {
            if (lc.getCollectDate() == null) continue;
            kgByDay.merge(lc.getCollectDate(),
                    lc.getWeightKg() == null ? BigDecimal.ZERO : lc.getWeightKg(),
                    BigDecimal::add);
        }

        // Heads per day. Late counts as present -- they picked.
        Map<LocalDate, Long> headsByDay = new HashMap<>();
        for (var a : attendanceRepository.findByWorkDateBetween(start, today)) {
            if (a.getWorkDate() == null) continue;
            if (a.getStatus() != AttendanceStatus.present
                    && a.getStatus() != AttendanceStatus.late) continue;
            headsByDay.merge(a.getWorkDate(), 1L, Long::sum);
        }

        BigDecimal wetSum = BigDecimal.ZERO;
        int wetN = 0;
        BigDecimal drySum = BigDecimal.ZERO;
        int dryN = 0;

        for (LocalDate d : observedDays) {
            Long heads = headsByDay.get(d);
            BigDecimal kg = kgByDay.get(d);
            // A day with no attendance or no weigh-in is not a zero-yield day,
            // it is a day nobody worked or nobody recorded. Counting it as zero
            // would drag whichever bucket it lands in towards the floor.
            if (heads == null || heads == 0 || kg == null) continue;

            BigDecimal perHead = kg.divide(BigDecimal.valueOf(heads), 3, RoundingMode.HALF_UP);
            if (wetDays.contains(d)) {
                wetSum = wetSum.add(perHead);
                wetN++;
            } else {
                drySum = drySum.add(perHead);
                dryN++;
            }
        }

        BigDecimal wetAvg = wetN == 0 ? null
                : wetSum.divide(BigDecimal.valueOf(wetN), 2, RoundingMode.HALF_UP);
        BigDecimal dryAvg = dryN == 0 ? null
                : drySum.divide(BigDecimal.valueOf(dryN), 2, RoundingMode.HALF_UP);

        boolean enough = wetN >= MIN_DAYS_EACH && dryN >= MIN_DAYS_EACH
                && dryAvg != null && dryAvg.signum() > 0;

        if (!enough) {
            return new RainImpact(
                    null, FALLBACK_FACTOR, false, wetN, dryN, wetAvg, dryAvg,
                    WET_THRESHOLD_MM, WINDOW_DAYS,
                    "Not enough matched days yet — " + wetN + " wet and " + dryN
                            + " dry with both a weigh-in and a register, against "
                            + MIN_DAYS_EACH + " needed of each. The forecast keeps using its "
                            + "documented " + FALLBACK_FACTOR + " estimate until there is "
                            + "something real to replace it with.");
        }

        BigDecimal factor = wetAvg.divide(dryAvg, 2, RoundingMode.HALF_UP);
        int pct = factor.multiply(BigDecimal.valueOf(100)).intValue();
        int drop = 100 - pct;

        String summary;
        if (drop > 0) {
            summary = "Over the last " + WINDOW_DAYS + " days, a wet day brought in "
                    + pct + "% of a dry one per plucker — " + wetAvg + " kg against "
                    + dryAvg + " kg. That is a " + drop + "% drop, measured from "
                    + wetN + " wet and " + dryN + " dry days on this estate.";
        } else {
            // Worth stating plainly rather than hiding. If rain is not costing
            // this estate anything measurable, the 25% cut was wrong and the
            // honest result is the interesting one.
            summary = "Over the last " + WINDOW_DAYS + " days, wet days brought in "
                    + pct + "% of a dry day per plucker — " + wetAvg + " kg against "
                    + dryAvg + " kg. Rain is not measurably reducing this estate's "
                    + "picking, from " + wetN + " wet and " + dryN + " dry days.";
        }

        return new RainImpact(factor, FALLBACK_FACTOR, true, wetN, dryN,
                wetAvg, dryAvg, WET_THRESHOLD_MM, WINDOW_DAYS, summary);
    }
}
