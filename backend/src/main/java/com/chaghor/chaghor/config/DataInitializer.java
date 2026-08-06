package com.chaghor.chaghor.config;

import com.chaghor.chaghor.user.Locale;
import com.chaghor.chaghor.user.Role;
import com.chaghor.chaghor.user.User;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.chaghor.chaghor.zone.Zone;
import com.chaghor.chaghor.zone.ZoneRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final ZoneRepository zoneRepository;
    private final WorkerRepository workerRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        // Seed one account per role so RBAC can be tested for all three immediately.
        seed("admin", "admin@chaghor.local", "admin123", Role.admin);
        seed("supervisor", "supervisor@chaghor.local", "super123", Role.supervisor);
        seed("worker", "worker@chaghor.local", "worker123", Role.worker);

        seedWorkforce();
    }

    private void seed(String username, String email, String rawPassword, Role role) {
        if (userRepository.existsByUsername(username)) return;
        User user = User.builder()
                .username(username)
                .email(email)
                .passwordHash(passwordEncoder.encode(rawPassword))
                .role(role)
                .locale(Locale.en)
                .isActive(true)
                .build();
        userRepository.save(user);
        log.warn("Seeded {} -> username: {}  password: {}  (CHANGE THIS)", role, username, rawPassword);
    }

    // Seeds a few zones + 5 demo workers so the Workforce table isn't empty on a
    // fresh database. Only runs when there are no workers yet, so it never
    // duplicates real data.
    private void seedWorkforce() {
        if (workerRepository.count() > 0) return;

        if (zoneRepository.count() == 0) {
            zoneRepository.save(Zone.builder().name("Zone A-1").code("A1")
                    .areaHectare(new BigDecimal("12.50")).targetKgPerDay(new BigDecimal("480")).build());
            zoneRepository.save(Zone.builder().name("Zone B-1").code("B1")
                    .areaHectare(new BigDecimal("10.00")).targetKgPerDay(new BigDecimal("400")).build());
            zoneRepository.save(Zone.builder().name("Zone B-2").code("B2")
                    .areaHectare(new BigDecimal("8.50")).targetKgPerDay(new BigDecimal("350")).build());
            zoneRepository.save(Zone.builder().name("Zone C-1").code("C1")
                    .areaHectare(new BigDecimal("15.00")).targetKgPerDay(new BigDecimal("520")).build());
        }
        List<Zone> zones = zoneRepository.findAll();
        Long supervisorId = userRepository.findByUsername("supervisor").map(User::getId).orElse(null);

        // fullName, nameBn, phone, jobRole, dailyWage
        String[][] people = {
                {"Abdul Karim", "আব্দুল করিম", "+8801710000001", "plucker", "175"},
                {"Rahima Begum", "রহিমা বেগম", "+8801710000002", "plucker", "170"},
                {"Jamal Uddin", "জামাল উদ্দিন", "+8801710000003", "sprayer", "185"},
                {"Fatema Khatun", "ফাতেমা খাতুন", "+8801710000004", "maintenance", "190"},
                {"Nurul Islam", "নুরুল ইসলাম", "+8801710000005", "factory", "180"},
        };

        for (int i = 0; i < people.length; i++) {
            String[] p = people[i];
            Long zoneId = zones.isEmpty() ? null : zones.get(i % zones.size()).getId();
            workerRepository.save(Worker.builder()
                    .fullName(p[0])
                    .nameBn(p[1])
                    .phone(p[2])
                    .jobRole(p[3])
                    .dailyWage(new BigDecimal(p[4]))
                    .status("active")
                    .zoneId(zoneId)
                    .supervisorId(supervisorId)
                    .joinDate(LocalDate.now().minusMonths(i + 2L))
                    .build());
        }
        log.warn("Seeded {} demo workers across {} zones", people.length, zones.size());
    }
}
