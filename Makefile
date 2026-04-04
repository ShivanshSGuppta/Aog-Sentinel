.PHONY: prod-build prod-backend prod-frontend prod-up dev-backend dev-frontend db-up db-down db-migrate connector-worker

prod-build:
	cd backend && ./.venv/bin/python -m unittest discover -s tests
	cd frontend && npm run build

prod-backend:
	cd backend && ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

prod-frontend:
	cd frontend && npm run start -- --hostname 127.0.0.1 --port 3000

prod-up: prod-build
	@trap 'kill 0' EXIT; \
	(cd backend && ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000) & \
	(cd frontend && npm run start -- --hostname 127.0.0.1 --port 3000) & \
	wait

dev-backend:
	cd backend && ./.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-frontend:
	cd frontend && npm run dev -- --hostname 127.0.0.1 --port 3000

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-migrate:
	cd backend && ./.venv/bin/python -m alembic upgrade head

connector-worker:
	cd backend && ./.venv/bin/python -m app.workers.connector_worker
