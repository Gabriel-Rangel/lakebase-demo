# Backend Brickhouse Energia — contexto de build = raiz do repositório (usa dados/equipamentos.csv)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Opcional: índice PyPI alternativo (proxy corporativo)
ARG PIP_INDEX_URL

WORKDIR /app
COPY app/backend/requirements.txt .
RUN pip install --no-cache-dir ${PIP_INDEX_URL:+--index-url "$PIP_INDEX_URL"} -r requirements.txt

COPY app/backend/app ./app
COPY app/backend/migrations ./migrations
COPY app/backend/sql ./sql
COPY dados/equipamentos.csv ./dados/equipamentos.csv

RUN useradd --system --uid 10001 energia
USER energia

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=2)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
