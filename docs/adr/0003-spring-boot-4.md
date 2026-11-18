# ADR 0003 – Spring Boot 4.x on Java 21

Status: accepted (2026-11-18)

Spring Initializr's current default is Spring Boot 4.1.2; MedCord starts on it (Java 21, Maven wrapper). Starter names differ from 3.x (`spring-boot-starter-webmvc`, `spring-boot-starter-flyway`). Config is env-driven (`application.yml`); `.env` is loaded by `make` and exported to the process. Tests run against a real Postgres (local or CI service), no H2.
