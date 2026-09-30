package httptransport

import (
	"errors"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/Eursukkul/sparkjoy/backend-go/internal/application"
	"github.com/Eursukkul/sparkjoy/backend-go/internal/domain"
	"github.com/gin-gonic/gin"
)

const accessTokenCookie = "access_token"

type Config struct {
	SecureCookie   bool
	TrustedProxies string
}

type handler struct {
	service *application.Service
	config  Config
}

func NewRouter(service *application.Service, config Config) (*gin.Engine, error) {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	var proxies []string
	if config.TrustedProxies != "" {
		proxies = strings.Split(config.TrustedProxies, ",")
	}
	if err := router.SetTrustedProxies(proxies); err != nil {
		return nil, err
	}
	h := &handler{service: service, config: config}
	limiter := &rateLimiter{}
	router.Use(limitRequests(limiter, "global", 100))
	router.GET("/health", h.health)
	router.POST("/auth/login", limitRequests(limiter, "login", 5), h.login)
	router.POST("/auth/logout", h.logout)
	authed := router.Group("")
	authed.Use(h.requireAuth)
	authed.GET("/auth/me", h.me)
	authed.GET("/posts", h.findAll)
	authed.GET("/posts/:id", h.findOne)
	authed.GET("/tags", h.tags)
	return router, nil
}

func apiError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"statusCode": status, "message": message, "error": http.StatusText(status)})
}

func internalError(c *gin.Context, err error) {
	log.Printf("request failed: %v", err)
	apiError(c, http.StatusInternalServerError, "Internal server error")
}

func (h *handler) health(c *gin.Context) {
	if err := h.service.Ping(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "error", "database": "down"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "database": "up"})
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func userJSON(user domain.SessionUser) gin.H {
	return gin.H{"id": user.ID, "email": user.Email, "name": user.Name}
}

func (h *handler) login(c *gin.Context) {
	var input loginRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		apiError(c, http.StatusBadRequest, "Invalid login request")
		return
	}
	user, token, err := h.service.Login(c.Request.Context(), input.Email, input.Password)
	if errors.Is(err, application.ErrInvalidCredentials) {
		apiError(c, http.StatusUnauthorized, "Invalid credentials")
		return
	}
	if err != nil {
		internalError(c, err)
		return
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(accessTokenCookie, token, int(h.service.TokenTTL().Seconds()), "/", "", h.config.SecureCookie, true)
	c.JSON(http.StatusOK, gin.H{"user": userJSON(user)})
}

func (h *handler) logout(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(accessTokenCookie, "", -1, "/", "", h.config.SecureCookie, true)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *handler) requireAuth(c *gin.Context) {
	cookie, err := c.Cookie(accessTokenCookie)
	if err != nil || cookie == "" {
		apiError(c, http.StatusUnauthorized, "Missing access token")
		c.Abort()
		return
	}
	user, err := h.service.VerifyToken(cookie)
	if err != nil {
		apiError(c, http.StatusUnauthorized, "Invalid or expired token")
		c.Abort()
		return
	}
	c.Set("user", user)
	c.Next()
}

func (h *handler) me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"user": userJSON(c.MustGet("user").(domain.SessionUser))})
}

func parsePostsQuery(c *gin.Context) (application.PostFilter, error) {
	q := application.PostFilter{Page: 1, Limit: 20, Tag: c.Query("tag"), Search: c.Query("search")}
	if raw, exists := c.GetQuery("page"); exists {
		page, err := strconv.Atoi(raw)
		if err != nil || page < 1 {
			return q, errors.New("page must be a positive integer")
		}
		q.Page = page
	}
	if raw, exists := c.GetQuery("limit"); exists {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			return q, errors.New("limit must be an integer from 1 to 100")
		}
		q.Limit = limit
	}
	if utf8.RuneCountInString(q.Tag) > 100 || utf8.RuneCountInString(q.Search) > 200 {
		return q, errors.New("tag or search is too long")
	}
	if q.Page > math.MaxInt/q.Limit {
		return q, errors.New("page is too large")
	}
	return q, nil
}

func listItemJSON(post domain.Post) gin.H {
	return gin.H{
		"id": post.ID, "title": post.Title, "excerpt": post.Excerpt,
		"postedAt": post.PostedAt, "postedBy": post.PostedBy, "tags": post.Tags,
	}
}

func (h *handler) findAll(c *gin.Context) {
	filter, err := parsePostsQuery(c)
	if err != nil {
		apiError(c, http.StatusBadRequest, err.Error())
		return
	}
	page, err := h.service.ListPosts(c.Request.Context(), filter)
	if err != nil {
		internalError(c, err)
		return
	}
	items := make([]gin.H, 0, len(page.Items))
	for _, post := range page.Items {
		items = append(items, listItemJSON(post))
	}
	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"meta":  gin.H{"page": page.Page, "limit": page.Limit, "total": page.Total, "totalPages": page.TotalPages},
	})
}

func (h *handler) findOne(c *gin.Context) {
	post, err := h.service.GetPost(c.Request.Context(), c.Param("id"))
	if errors.Is(err, application.ErrNotFound) {
		apiError(c, http.StatusNotFound, "Post "+c.Param("id")+" not found")
		return
	}
	if err != nil {
		internalError(c, err)
		return
	}
	item := listItemJSON(post)
	item["content"] = post.Content
	c.JSON(http.StatusOK, item)
}

func (h *handler) tags(c *gin.Context) {
	tags, err := h.service.ListTags(c.Request.Context())
	if err != nil {
		internalError(c, err)
		return
	}
	items := make([]gin.H, 0, len(tags))
	for _, tag := range tags {
		items = append(items, gin.H{"name": tag.Name, "postCount": tag.PostCount})
	}
	c.JSON(http.StatusOK, items)
}

type rateWindow struct {
	start time.Time
	count int
}

type rateLimiter struct {
	mu      sync.Mutex
	windows map[string]rateWindow
}

func (l *rateLimiter) allow(key string, limit int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.windows == nil {
		l.windows = make(map[string]rateWindow)
	}
	now := time.Now()
	if len(l.windows) > 1000 {
		for key, window := range l.windows {
			if now.Sub(window.start) >= time.Minute {
				delete(l.windows, key)
			}
		}
	}
	window := l.windows[key]
	if now.Sub(window.start) >= time.Minute {
		window = rateWindow{start: now}
	}
	window.count++
	l.windows[key] = window
	return window.count <= limit
}

func limitRequests(l *rateLimiter, group string, limit int) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !l.allow(group+":"+c.ClientIP(), limit) {
			apiError(c, http.StatusTooManyRequests, "Too many requests")
			c.Abort()
			return
		}
		c.Next()
	}
}
