# API image. Build context: innebandy/ (needs api/ and worker/).
#   docker build -f api/Dockerfile -t innebandy-api .
FROM python:3.12-slim

# ffmpeg only matters with WORKER_MODE=inline; production transcodes on Modal.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt
COPY api/app api/app
COPY worker/innebandy_worker worker/innebandy_worker

ENV PYTHONPATH=/app/api:/app/worker PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
