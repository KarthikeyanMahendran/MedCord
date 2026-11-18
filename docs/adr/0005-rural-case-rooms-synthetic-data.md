# ADR 0005 – Rural Case Rooms; synthetic data only

Status: accepted (2026-11-18), for the Nexconn Build Challenge 2026 (Humanitarian & Social Good).

## Context
Health workers in rural areas need quick specialist opinions. MedCord already has verified doctors, rooms, threads and search. `CLAUDE.md` says "No PHI/patient data in v1".

## Decision
- A **case** is a chat room (`channels.type = CASE`, participants in `dm_participants`) plus a `cases` row holding a structured SBAR summary, urgency (GREEN/AMBER/RED), red flags and the specialty needed.
- Triage is **deterministic and rule-based** (`red_flag_rules`, vitals thresholds, `specialties`). It flags and escalates; it never diagnoses.
- Routing notifies on-duty verified doctors of the matching specialty; unaccepted cases escalate (on-duty doctors, then admins). A resolved case becomes an anonymised, doctor-verified entry in the Verified Answer Library, and a 24h follow-up asks the health worker how the patient is.
- **All patient data is synthetic.** The deployment is a demo; real patient data must not be entered. The PHI rule in `CLAUDE.md` stays in force for any production use and needs a new ADR (consent, retention, encryption, regulatory review) before real data is handled.
- Supabase row-level security is enabled on every table with no policies so the public REST API exposes nothing; only the backend's own DB role reads and writes.

## Consequences
+ Reuses messaging, access control, search and audit already built.
+ Safe to demo without handling real patient data.
- Rule-based triage is simple; an LLM can later propose structure, but rules keep the safety net deterministic.
