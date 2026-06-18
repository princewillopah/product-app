FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js .

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8000/health || exit 1

CMD ["node", "server.js"]
