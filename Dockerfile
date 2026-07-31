# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python runtime ───────────────────────────────────────────────────
FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-deu \
    libgl1 \
    libglib2.0-0 \
    libffi-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ ./backend/

# React build output (served by FastAPI as static files)
COPY --from=frontend-build /frontend/dist ./frontend/dist

# Data dirs. These must exist *before* the chown below: when Docker first
# populates an empty named volume it copies the image directory's ownership, so
# creating them here is what lets the unprivileged user write to the mounted
# uploads/database volumes.
RUN mkdir -p backend/uploads backend/uploads/sale backend/data backend/tessdata

# Run as an unprivileged user: if anything in the app is ever exploited, it
# can't write outside its own data directory or install packages.
RUN useradd --create-home --uid 10001 cardvault \
    && chown -R cardvault:cardvault /app
USER cardvault

WORKDIR /app/backend

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request,os,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.getenv(\"PORT\",\"8000\")}/health', timeout=4).status==200 else 1)"

# Render passes $PORT; fall back to 8000 for local Docker use.
# --proxy-headers makes uvicorn trust X-Forwarded-For/Proto from the platform's
# load balancer, so rate limiting sees the real client IP and redirect URLs use
# https instead of http.
CMD ["/bin/sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
