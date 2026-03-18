$ErrorActionPreference = "Stop"

Write-Host "Running Alembic migrations..."
alembic upgrade head

Write-Host "Starting uvicorn..."
uvicorn app.main:app --host 0.0.0.0 --port 8000
