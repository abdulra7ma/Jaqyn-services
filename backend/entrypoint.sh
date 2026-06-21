#!/usr/bin/env sh
set -e

if [ "${DB_ENGINE}" = "postgres" ]; then
  until nc -z "${POSTGRES_HOST:-db}" "${POSTGRES_PORT:-5432}"; do
    echo "Waiting for Postgres..."
    sleep 1
  done
fi

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  python manage.py migrate --noinput
fi

if [ "${SEED_TEST_USERS:-false}" = "true" ]; then
  python manage.py seed_test_users
fi

if [ "${DJANGO_COLLECTSTATIC:-false}" = "true" ]; then
  python manage.py collectstatic --noinput
fi

exec "$@"
