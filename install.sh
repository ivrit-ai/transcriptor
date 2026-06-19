#!/bin/sh
set -e

uv run alembic upgrade head

# Seed demo data (idempotent)
# uv run python scripts/seed_demo.py
