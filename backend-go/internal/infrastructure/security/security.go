package security

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/Eursukkul/sparkjoy/backend-go/internal/domain"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Bcrypt struct{}

func (Bcrypt) Check(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

type JWT struct {
	secret []byte
	ttl    time.Duration
}

func NewJWT(secret string, ttl time.Duration) *JWT {
	return &JWT{secret: []byte(secret), ttl: ttl}
}

func (j *JWT) TTL() time.Duration { return j.ttl }

func (j *JWT) Sign(user domain.SessionUser) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub": user.ID, "email": user.Email, "name": user.Name,
		"iat": now.Unix(), "exp": now.Add(j.ttl).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(j.secret)
}

func (j *JWT) Verify(raw string) (domain.SessionUser, error) {
	token, err := jwt.Parse(raw, func(token *jwt.Token) (any, error) {
		return j.secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil || !token.Valid {
		return domain.SessionUser{}, errors.New("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return domain.SessionUser{}, errors.New("invalid claims")
	}
	id, ok := claims["sub"].(float64)
	if !ok || id < 1 || id != float64(int(id)) {
		return domain.SessionUser{}, errors.New("invalid subject")
	}
	email, emailOK := claims["email"].(string)
	name, nameOK := claims["name"].(string)
	if !emailOK || !nameOK {
		return domain.SessionUser{}, errors.New("invalid claims")
	}
	return domain.SessionUser{ID: int(id), Email: email, Name: name}, nil
}

func ParseTTL(raw string) (time.Duration, error) {
	if strings.HasSuffix(raw, "d") {
		days, err := strconv.Atoi(strings.TrimSuffix(raw, "d"))
		if err != nil || days < 1 {
			return 0, errors.New("invalid JWT_EXPIRES_IN")
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}
	ttl, err := time.ParseDuration(raw)
	if err != nil || ttl <= 0 {
		return 0, errors.New("invalid JWT_EXPIRES_IN")
	}
	return ttl, nil
}
