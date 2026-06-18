FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o app main.go

FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache wget ca-certificates
COPY --from=builder /app/app .

EXPOSE 8002
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8002/health || exit 1

CMD ["./app"]
