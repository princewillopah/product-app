FROM python:3.12-alpine
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8004
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8004/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8004"]
