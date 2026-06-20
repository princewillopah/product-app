FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js .
COPY tracing.js .

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8000/health || exit 1

# --require ./tracing.js initializes OpenTelemetry before server.js loads, so
# express/axios get auto-instrumented and the gateway reports traces to Tempo.
CMD ["node", "--require", "./tracing.js", "server.js"]
