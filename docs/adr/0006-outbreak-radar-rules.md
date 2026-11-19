# ADR 0006: Outbreak Radar is rule-based

## Status
Accepted

## Context
Health workers file cases from many villages. The same symptoms showing up in one area within days can mean an outbreak, but nobody sees it because each case is read alone. We want an early warning that a doctor or district officer can trust and explain.

## Decision
- Detection is plain keyword rules over `chief_complaint` (and a measured temperature of 38 C or more counts as fever). There are five symptom groups, each with a threshold of 3 to 4 cases. No model, no score a person cannot explain.
- Window: 72 hours, per region. A cluster that drops to zero cases fades on its own. While any case remains the alert stays, so it does not flicker.
- Severity: WATCH at the threshold, ALERT at double the threshold or 2 or more urgent cases.
- Alerts hold only counts, region and links to cases. The staff detail shows village, age, sex, urgency and the first 90 characters of the complaint, never the reporter or any contact detail. Health workers see the alert and guidance but not the case list.
- Guidance text is generic public-health action and always carries "Decision support only".
- Detection runs in the same transaction as case submission, wrapped so it can never block a patient case, plus a once-a-minute job for fading and missed events.
- `cases.is_demo` marks admin-run demo cases so "Reset demo" removes only those.
- Flyway `out-of-order` is enabled so a migration added on another branch with a lower version still applies.

## Consequences
Alerts are explainable and testable. Keyword rules miss misspellings and other languages (same limit as red-flag rules, T-029). All data is synthetic (ADR 0005).
