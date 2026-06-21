# Jaqyn Services

Backend and service workspace for the Jaqyn local rewards MVP.

## Backend quickstart

```bash
cp .env.example .env
docker compose up --build
```

The API runs at `http://localhost:8000/api/`.

Useful commands:

```bash
make migrate
make test
make shell
```

The task source of truth lives in `tasks/`. Update `tasks/CHECKPOINT.md` after
each task.
