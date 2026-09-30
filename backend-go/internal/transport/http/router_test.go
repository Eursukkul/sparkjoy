package httptransport

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestParsePostsQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, test := range []struct {
		query string
		valid bool
	}{
		{"", true},
		{"page=2&limit=10&tag=go&search=gin", true},
		{"page=abc", false},
		{"page=0", false},
		{"limit=101", false},
	} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodGet, "/posts?"+test.query, nil)
		_, err := parsePostsQuery(c)
		if (err == nil) != test.valid {
			t.Fatalf("query %q: valid=%t, err=%v", test.query, test.valid, err)
		}
	}
}
