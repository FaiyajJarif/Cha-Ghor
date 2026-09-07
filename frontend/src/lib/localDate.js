// Calendar dates in the ESTATE'S timezone, not UTC.
//
// ============================================================================
// WHY THIS FILE EXISTS
// ============================================================================
//
// `new Date().toISOString().slice(0, 10)` was used in thirteen places to mean
// "today". It does not mean today. `toISOString()` converts to UTC first, so in
// Bangladesh (+06:00) it returns YESTERDAY'S date for the whole window from
// 18:00 to 23:59 local — six hours of every single day.
//
// WHAT THAT ACTUALLY BROKE
//
//   The dashboard. A supervisor weighing leaf in at 7pm had it saved against
//   yesterday, while the admin Overview asked the server for LocalDate.now()
//   (real today) and found nothing. "Leaf today 0.0 kg — no weigh-in recorded"
//   sat on screen next to a Workforce page happily showing the same day's
//   sheet, because Workforce sent the wrong date to BOTH read and write and so
//   was at least self-consistent.
//
//   Payroll, which is worse. monthStartISO() built `new Date(y, m, 1)` — local
//   midnight on the 1st — and then took the UTC date of it, which is the LAST
//   DAY OF THE PREVIOUS MONTH. So a pay run for August covered
//   31 July to 30 August: it pulled in a day that belonged to July's payslip
//   and dropped the 31st of August entirely. Every period, silently, by one day
//   at each end.
//
// THE RULE: never call toISOString() to get a calendar date. Read the local
// date parts. An ISO *timestamp* is fine; an ISO *date* taken from one is not.

// Pad to two digits without pulling in a formatting library.
const p2 = (n) => String(n).padStart(2, "0");

// A Date -> "YYYY-MM-DD" using the LOCAL calendar day.
export function isoDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())}`;
}

// Today, as the person looking at the screen would name it.
export function todayISO() {
  return isoDate(new Date());
}

// First and last day of the month containing `ref` (default: this month).
// Used for payroll period boundaries, so a one-day drift here moves money.
export function monthStartISO(ref = new Date()) {
  return isoDate(new Date(ref.getFullYear(), ref.getMonth(), 1));
}

export function monthEndISO(ref = new Date()) {
  // Day 0 of the next month is the last day of this one.
  return isoDate(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));
}

// `n` days before today, inclusive-friendly for range pickers.
export function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}
