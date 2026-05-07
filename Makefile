REGISTRY  ?= ghcr.io/trieuluan
API_IMAGE  = $(REGISTRY)/codemap-api
WEB_IMAGE  = $(REGISTRY)/codemap-web
TAG       ?= $(shell git describe --tags --abbrev=0 2>/dev/null || echo "0.0.1")

.PHONY: help \
        build build-api build-web \
        push push-api push-web release \
        dev dev-down dev-logs \
        prod-up prod-down prod-logs \
        db-generate db-migrate db-seed \
        test

# ── Help ──────────────────────────────────────────────────────────────────────

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── Build ─────────────────────────────────────────────────────────────────────

build: build-api build-web ## Build all images

build-api: ## Build API image (Dockerfile.api)
	docker compose -f compose.build.yml build api

build-web: ## Build web image (Dockerfile.web)
	docker compose -f compose.build.yml build web

# ── Push ──────────────────────────────────────────────────────────────────────

push: push-api push-web ## Push all images to registry

push-api: ## Push API image (versioned + latest)
	docker tag codemap/api:latest $(API_IMAGE):$(TAG)
	docker tag codemap/api:latest $(API_IMAGE):latest
	docker push $(API_IMAGE):$(TAG)
	docker push $(API_IMAGE):latest

push-web: ## Push web image (versioned + latest)
	docker tag codemap/web:latest $(WEB_IMAGE):$(TAG)
	docker tag codemap/web:latest $(WEB_IMAGE):latest
	docker push $(WEB_IMAGE):$(TAG)
	docker push $(WEB_IMAGE):latest

release: build push ## Build and push all images (usage: make release TAG=v1.2.0)

# ── Dev ───────────────────────────────────────────────────────────────────────

dev: ## Start dev environment
	docker compose -f compose.dev.yml up -d

dev-down: ## Stop dev environment
	docker compose -f compose.dev.yml down

dev-logs: ## Stream dev logs
	docker compose -f compose.dev.yml logs -f

# ── Production ────────────────────────────────────────────────────────────────

prod-up: ## Pull latest images and start production
	docker compose -f compose.prod.yml pull
	docker compose -f compose.prod.yml up -d

prod-down: ## Stop production
	docker compose -f compose.prod.yml down

prod-logs: ## Stream production logs
	docker compose -f compose.prod.yml logs -f

# ── Database ──────────────────────────────────────────────────────────────────

db-generate: ## Generate migrations from schema changes
	npm --workspace=@codemap/api run db:generate

db-migrate: ## Apply pending migrations
	npm --workspace=@codemap/api run db:migrate

db-seed: ## Seed initial admin user
	npm --workspace=@codemap/api run db:seed

# ── Test ──────────────────────────────────────────────────────────────────────

test: ## Run API test suite
	npm run test:api
