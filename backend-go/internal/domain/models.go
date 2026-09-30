package domain

import "time"

type Post struct {
	ID       string
	Title    string
	Content  string
	Excerpt  string
	PostedAt time.Time
	PostedBy string
	Tags     []string
}

type Tag struct {
	Name      string
	PostCount int64
}

type User struct {
	ID           int
	Email        string
	PasswordHash string
	Name         string
}

type SessionUser struct {
	ID    int
	Email string
	Name  string
}
