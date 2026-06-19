# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install deps against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Build the static SPA.
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM nginx:1.27-alpine AS runtime

# Our server config: listens on 8080, serves the SPA, reverse-proxies /api.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:8080/healthz >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
