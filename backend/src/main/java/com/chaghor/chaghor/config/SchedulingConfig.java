package com.chaghor.chaghor.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

// Turns on @Scheduled across the application.
//
// This is the first scheduled work in the project -- there were no @Scheduled
// methods at all before the weather retention job. Anything annotated
// @Scheduled anywhere in the app now runs, so check this file before adding a
// new one: a job that touches money must not start firing by accident.
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
