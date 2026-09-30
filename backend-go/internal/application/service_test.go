package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Eursukkul/sparkjoy/backend-go/internal/domain"
)

type fakeStore struct {
	posts []domain.Post
	total int64
	user  domain.User
	err   error
}

func (f fakeStore) ListPosts(context.Context, PostFilter) ([]domain.Post, int64, error) {
	return f.posts, f.total, f.err
}
func (f fakeStore) GetPost(context.Context, string) (domain.Post, error) {
	return domain.Post{}, f.err
}
func (f fakeStore) ListTags(context.Context) ([]domain.Tag, error) { return nil, f.err }
func (f fakeStore) FindUserByEmail(context.Context, string) (domain.User, error) {
	return f.user, f.err
}
func (f fakeStore) Ping(context.Context) error { return f.err }

type fakeTokens struct{}

func (fakeTokens) Sign(domain.SessionUser) (string, error) { return "token", nil }
func (fakeTokens) Verify(string) (domain.SessionUser, error) {
	return domain.SessionUser{}, nil
}
func (fakeTokens) TTL() time.Duration { return time.Hour }

type fakePasswords bool

func (f fakePasswords) Check(string, string) bool { return bool(f) }

func TestListPostsMetadata(t *testing.T) {
	service := NewService(fakeStore{total: 21}, fakeTokens{}, fakePasswords(true))
	page, err := service.ListPosts(context.Background(), PostFilter{Page: 2, Limit: 10})
	if err != nil || page.TotalPages != 3 || page.Total != 21 || page.Page != 2 {
		t.Fatalf("unexpected page: %+v, err: %v", page, err)
	}

	service = NewService(fakeStore{}, fakeTokens{}, fakePasswords(true))
	page, err = service.ListPosts(context.Background(), PostFilter{Page: 1, Limit: 20})
	if err != nil || page.TotalPages != 1 {
		t.Fatalf("empty result should report one page: %+v, err: %v", page, err)
	}
}

func TestLoginDoesNotRevealUnknownEmail(t *testing.T) {
	for _, store := range []fakeStore{
		{err: ErrNotFound},
		{user: domain.User{ID: 1, PasswordHash: "hash"}},
	} {
		service := NewService(store, fakeTokens{}, fakePasswords(false))
		_, _, err := service.Login(context.Background(), "admin@example.com", "wrong")
		if !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("expected same login error, got %v", err)
		}
	}
}
