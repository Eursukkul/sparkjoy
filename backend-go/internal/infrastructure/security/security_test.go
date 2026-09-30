package security

import (
	"testing"
	"time"

	"github.com/Eursukkul/sparkjoy/backend-go/internal/domain"
)

func TestJWTSignVerifyAndTampering(t *testing.T) {
	jwt := NewJWT("test-secret", time.Hour)
	want := domain.SessionUser{ID: 7, Email: "admin@example.com", Name: "Admin"}
	token, err := jwt.Sign(want)
	if err != nil {
		t.Fatal(err)
	}
	got, err := jwt.Verify(token)
	if err != nil || got != want {
		t.Fatalf("verify got %+v, err %v", got, err)
	}
	if _, err := NewJWT("other-secret", time.Hour).Verify(token); err == nil {
		t.Fatal("token signed by another secret was accepted")
	}
}

func TestParseTTL(t *testing.T) {
	for input, want := range map[string]time.Duration{"1d": 24 * time.Hour, "30m": 30 * time.Minute} {
		got, err := ParseTTL(input)
		if err != nil || got != want {
			t.Fatalf("%s: got %v, err %v", input, got, err)
		}
	}
}
