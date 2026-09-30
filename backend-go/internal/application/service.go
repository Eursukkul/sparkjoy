package application

import (
	"context"
	"errors"
	"time"

	"github.com/Eursukkul/sparkjoy/backend-go/internal/domain"
)

var (
	ErrNotFound           = errors.New("not found")
	ErrInvalidCredentials = errors.New("invalid credentials")
)

type PostFilter struct {
	Page   int
	Limit  int
	Tag    string
	Search string
}

type PostPage struct {
	Items      []domain.Post
	Page       int
	Limit      int
	Total      int64
	TotalPages int
}

// Store is the application boundary. Gin and GORM stay outside this package.
type Store interface {
	ListPosts(context.Context, PostFilter) ([]domain.Post, int64, error)
	GetPost(context.Context, string) (domain.Post, error)
	ListTags(context.Context) ([]domain.Tag, error)
	FindUserByEmail(context.Context, string) (domain.User, error)
	Ping(context.Context) error
}

type Tokens interface {
	Sign(domain.SessionUser) (string, error)
	Verify(string) (domain.SessionUser, error)
	TTL() time.Duration
}

type PasswordChecker interface {
	Check(hash, password string) bool
}

type Service struct {
	store     Store
	tokens    Tokens
	passwords PasswordChecker
}

func NewService(store Store, tokens Tokens, passwords PasswordChecker) *Service {
	return &Service{store: store, tokens: tokens, passwords: passwords}
}

func (s *Service) ListPosts(ctx context.Context, filter PostFilter) (PostPage, error) {
	items, total, err := s.store.ListPosts(ctx, filter)
	if err != nil {
		return PostPage{}, err
	}
	totalPages := int((total + int64(filter.Limit) - 1) / int64(filter.Limit))
	if totalPages < 1 {
		totalPages = 1
	}
	return PostPage{Items: items, Page: filter.Page, Limit: filter.Limit, Total: total, TotalPages: totalPages}, nil
}

func (s *Service) GetPost(ctx context.Context, id string) (domain.Post, error) {
	return s.store.GetPost(ctx, id)
}

func (s *Service) ListTags(ctx context.Context) ([]domain.Tag, error) {
	return s.store.ListTags(ctx)
}

func (s *Service) Login(ctx context.Context, email, password string) (domain.SessionUser, string, error) {
	user, err := s.store.FindUserByEmail(ctx, email)
	if errors.Is(err, ErrNotFound) {
		return domain.SessionUser{}, "", ErrInvalidCredentials
	}
	if err != nil {
		return domain.SessionUser{}, "", err
	}
	if !s.passwords.Check(user.PasswordHash, password) {
		return domain.SessionUser{}, "", ErrInvalidCredentials
	}
	session := domain.SessionUser{ID: user.ID, Email: user.Email, Name: user.Name}
	token, err := s.tokens.Sign(session)
	return session, token, err
}

func (s *Service) VerifyToken(raw string) (domain.SessionUser, error) {
	return s.tokens.Verify(raw)
}

func (s *Service) TokenTTL() time.Duration { return s.tokens.TTL() }

func (s *Service) Ping(ctx context.Context) error { return s.store.Ping(ctx) }
