#!/bin/sh
set -e

uv sync --group scripts
uv run alembic upgrade head
