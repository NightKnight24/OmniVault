FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend

WORKDIR /app/backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    aria2 \
    p7zip-full \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    fastapi \
    "uvicorn[standard]" \
    httpx \
    pydantic \
    python-multipart \
    beautifulsoup4 \
    certifi

COPY backend/app /app/backend/app
COPY backend/data /app/backend/data
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

EXPOSE 19842

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "19842"]
