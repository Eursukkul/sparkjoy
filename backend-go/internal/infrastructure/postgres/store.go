package postgresstore

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Eursukkul/sparkjoy/backend-go/internal/application"
	"github.com/Eursukkul/sparkjoy/backend-go/internal/domain"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// These GORM models mirror the existing Prisma schema; Go does not migrate it.
type userRow struct {
	ID           int    `gorm:"column:id;primaryKey"`
	Email        string `gorm:"column:email"`
	PasswordHash string `gorm:"column:passwordHash"`
	Name         string `gorm:"column:name"`
}

func (userRow) TableName() string { return "User" }

type postRow struct {
	ID       string       `gorm:"column:id;primaryKey"`
	Title    string       `gorm:"column:title"`
	Content  string       `gorm:"column:content"`
	Excerpt  string       `gorm:"column:excerpt"`
	PostedAt time.Time    `gorm:"column:postedAt"`
	PostedBy string       `gorm:"column:postedBy"`
	Tags     []postTagRow `gorm:"foreignKey:PostID;references:ID"`
}

func (postRow) TableName() string { return "Post" }

type tagRow struct {
	ID   int    `gorm:"column:id;primaryKey"`
	Name string `gorm:"column:name"`
}

func (tagRow) TableName() string { return "Tag" }

type postTagRow struct {
	PostID string `gorm:"column:postId;primaryKey"`
	TagID  int    `gorm:"column:tagId;primaryKey"`
	Tag    tagRow `gorm:"foreignKey:TagID;references:ID"`
}

func (postTagRow) TableName() string { return "PostTag" }

type Store struct{ db *gorm.DB }

func New(db *gorm.DB) *Store { return &Store{db: db} }

// WaitForSeed lets the unchanged NestJS service apply migrations and seed data.
func WaitForSeed(ctx context.Context, dsn string) (*Store, error) {
	deadline := time.Now().Add(2 * time.Minute)
	for {
		db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			var count int64
			err = db.Model(&postRow{}).Count(&count).Error
			if err == nil && count > 0 {
				return New(db), nil
			}
			if err == nil {
				err = errors.New("waiting for NestJS seed to insert posts")
			}
			if pool, poolErr := db.DB(); poolErr == nil {
				_ = pool.Close()
			}
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("database not ready: %w", err)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}

func (s *Store) Ping(ctx context.Context) error {
	pool, err := s.db.DB()
	if err != nil {
		return err
	}
	return pool.PingContext(ctx)
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func escapeLikePattern(value string) string { return likeEscaper.Replace(value) }

func filteredPosts(db *gorm.DB, filter application.PostFilter) *gorm.DB {
	query := db.Model(&postRow{})
	if filter.Tag != "" {
		query = query.Where(`EXISTS (
			SELECT 1 FROM "PostTag" pt JOIN "Tag" t ON t.id = pt."tagId"
			WHERE pt."postId" = "Post".id AND t.name = ?
		)`, filter.Tag)
	}
	if filter.Search != "" {
		query = query.Where(`"Post".title ILIKE ? ESCAPE '\'`, "%"+escapeLikePattern(filter.Search)+"%")
	}
	return query
}

func toPost(row postRow) domain.Post {
	tags := make([]string, 0, len(row.Tags))
	for _, link := range row.Tags {
		tags = append(tags, link.Tag.Name)
	}
	return domain.Post{
		ID: row.ID, Title: row.Title, Content: row.Content, Excerpt: row.Excerpt,
		PostedAt: row.PostedAt, PostedBy: row.PostedBy, Tags: tags,
	}
}

func (s *Store) ListPosts(ctx context.Context, filter application.PostFilter) ([]domain.Post, int64, error) {
	var rows []postRow
	var total int64
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := filteredPosts(tx, filter).Count(&total).Error; err != nil {
			return err
		}
		return filteredPosts(tx, filter).
			Select("id", "title", "excerpt", "postedAt", "postedBy").
			Preload("Tags.Tag").
			Order(`"postedAt" DESC`).
			Offset((filter.Page - 1) * filter.Limit).Limit(filter.Limit).
			Find(&rows).Error
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, 0, err
	}
	posts := make([]domain.Post, 0, len(rows))
	for _, row := range rows {
		posts = append(posts, toPost(row))
	}
	return posts, total, nil
}

func (s *Store) GetPost(ctx context.Context, id string) (domain.Post, error) {
	var row postRow
	err := s.db.WithContext(ctx).Preload("Tags.Tag").First(&row, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.Post{}, application.ErrNotFound
	}
	if err != nil {
		return domain.Post{}, err
	}
	return toPost(row), nil
}

func (s *Store) ListTags(ctx context.Context) ([]domain.Tag, error) {
	var rows []struct {
		Name      string `gorm:"column:name"`
		PostCount int64  `gorm:"column:postCount"`
	}
	err := s.db.WithContext(ctx).
		Table(`"Tag" AS t`).
		Select(`t.name, COUNT(pt."postId") AS "postCount"`).
		Joins(`LEFT JOIN "PostTag" AS pt ON pt."tagId" = t.id`).
		Group("t.id").Order("t.name ASC").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	tags := make([]domain.Tag, 0, len(rows))
	for _, row := range rows {
		tags = append(tags, domain.Tag{Name: row.Name, PostCount: row.PostCount})
	}
	return tags, nil
}

func (s *Store) FindUserByEmail(ctx context.Context, email string) (domain.User, error) {
	var row userRow
	err := s.db.WithContext(ctx).Where("email = ?", email).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.User{}, application.ErrNotFound
	}
	if err != nil {
		return domain.User{}, err
	}
	return domain.User{ID: row.ID, Email: row.Email, PasswordHash: row.PasswordHash, Name: row.Name}, nil
}
