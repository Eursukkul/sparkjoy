FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /sparkjoy-go ./cmd/api

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=build /sparkjoy-go /usr/local/bin/sparkjoy-go
EXPOSE 4001
CMD ["sparkjoy-go"]
