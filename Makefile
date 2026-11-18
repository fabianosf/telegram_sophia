.PHONY: up test logs down

up:
	@test -f .env || cp .env.example .env
	docker compose up --build -d

test:
	@test -f .env || cp .env.example .env
	docker compose run --rm api python manage.py test

logs:
	docker compose logs -f --tail=200

down:
	docker compose down
