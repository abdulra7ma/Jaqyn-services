# Restore Procedure

1. Stop web, worker, and beat.
2. Restore Postgres:

```bash
psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" "$POSTGRES_DB" < jaqyn-YYYYMMDDTHHMMSSZ.sql
```

3. Restore media:

```bash
mkdir -p /app/media
tar -xzf media-YYYYMMDDTHHMMSSZ.tar.gz -C /app/media
```

4. Run migrations and checks:

```bash
python manage.py migrate
python manage.py check
pytest
```

Restore test result for this build: documented dry-run commands and the full
backend test suite pass locally; production restore should be rehearsed against a
fresh Postgres volume before launch.
