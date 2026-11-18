SHELL := /bin/bash
-include .env
export

.PHONY: help setup db seed dev backend frontend test lint compose-up compose-down

help: ## list targets
	@grep -hE '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "%-14s %s\n", $$1, $$2}'

setup: ## install backend + frontend deps
	@test -f .env || cp .env.example .env
	@if [ -x backend/mvnw ]; then cd backend && ./mvnw -q dependency:go-offline; fi
	@if [ -f frontend/package.json ]; then cd frontend && npm ci || npm install; fi

db: ## create local medcord db + role on localhost:5432 (idempotent, uses DB_PASSWORD)
	@psql -h $(DB_HOST) -p $(DB_PORT) -d postgres -v ON_ERROR_STOP=1 -q -v pw="$(DB_PASSWORD)" -f scripts/create-db.sql

seed: ## load DEV-ONLY mock users (password: Passw0rd!Med)
	@psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) -v ON_ERROR_STOP=1 -q -f scripts/seed-dev.sql

dev: ## run backend (:8080) and frontend (:5173)
	@$(MAKE) -j2 backend frontend

backend: ## run Spring Boot
	@cd backend && ./mvnw spring-boot:run

frontend: ## run Vite dev server
	@cd frontend && npm run dev

test: ## run all tests
	@if [ -x backend/mvnw ]; then cd backend && ./mvnw verify; fi
	@if [ -f frontend/package.json ]; then cd frontend && npm test; fi

lint: ## lint frontend
	@if [ -f frontend/package.json ]; then cd frontend && npm run lint; fi

compose-up: ## start Postgres via docker compose (alternative to local Postgres)
	docker compose up -d

compose-down: ## stop compose services
	docker compose down
