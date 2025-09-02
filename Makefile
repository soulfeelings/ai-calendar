# AI Calendar - Docker Compose Commands

.PHONY: help run stop build logs clean dev celery flower redis-cli

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

run: ## Run all services (backend, celery, redis, mongodb)
	docker compose --env-file .env up --build

dev: ## Run in development mode with logs
	docker compose --env-file .env up --build -d
	docker compose logs -f backend celery-worker

stop: ## Stop all services
	docker compose down

build: ## Build all containers
	docker compose build

restart: ## Restart all services
	docker compose restart

logs: ## Show logs from all services
	docker compose logs -f

logs-backend: ## Show backend logs only
	docker compose logs -f backend

logs-celery: ## Show Celery worker logs only
	docker compose logs -f celery-worker

logs-redis: ## Show Redis logs only
	docker compose logs -f redis

flower: ## Open Celery Flower monitoring (after running services)
	@echo "Celery Flower available at: http://localhost:5555"
	@command -v xdg-open >/dev/null && xdg-open http://localhost:5555 || echo "Open http://localhost:5555 manually"

redis-cli: ## Connect to Redis CLI
	docker compose exec redis redis-cli -a $(shell grep REDIS_PASSWORD .env | cut -d '=' -f2)

celery-status: ## Check Celery worker status
	docker compose exec celery-worker celery -A celery_app status

celery-inspect: ## Inspect Celery active tasks
	docker compose exec celery-worker celery -A celery_app inspect active

clean: ## Remove all containers and volumes
	docker compose down -v
	docker system prune -f

scale-celery: ## Scale Celery workers (usage: make scale-celery WORKERS=3)
	docker compose up --scale celery-worker=$(or $(WORKERS),2) -d

test-webhook: ## Test webhook endpoint (requires running services)
	@echo "Testing webhook endpoint..."
	@curl -X POST http://localhost:8000/webhook/google-calendar \
		-H "Content-Type: application/json" \
		-H "X-Goog-Channel-Id: test-channel" \
		-H "X-Goog-Resource-State: exists" \
		-d '{}' || echo "Make sure services are running with 'make run'"
