package main

import (
	"context"
	"log"
	"os"

	"github.com/Eursukkul/sparkjoy/backend-go/internal/application"
	postgresstore "github.com/Eursukkul/sparkjoy/backend-go/internal/infrastructure/postgres"
	"github.com/Eursukkul/sparkjoy/backend-go/internal/infrastructure/security"
	httptransport "github.com/Eursukkul/sparkjoy/backend-go/internal/transport/http"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	secret := os.Getenv("JWT_SECRET")
	if dsn == "" || secret == "" {
		log.Fatal("DATABASE_URL and JWT_SECRET are required")
	}
	ttl, err := security.ParseTTL(envOr("JWT_EXPIRES_IN", "1d"))
	if err != nil {
		log.Fatal(err)
	}
	store, err := postgresstore.WaitForSeed(context.Background(), dsn)
	if err != nil {
		log.Fatal(err)
	}
	service := application.NewService(store, security.NewJWT(secret, ttl), security.Bcrypt{})
	router, err := httptransport.NewRouter(service, httptransport.Config{
		SecureCookie:   os.Getenv("COOKIE_SECURE") == "true",
		TrustedProxies: os.Getenv("TRUSTED_PROXIES"),
	})
	if err != nil {
		log.Fatal(err)
	}
	port := envOr("PORT", "4001")
	log.Printf("Go API listening on :%s", port)
	log.Fatal(router.Run(":" + port))
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
