package postgresstore

import "testing"

func TestEscapeLikePattern(t *testing.T) {
	got := escapeLikePattern(`a%b_c\d`)
	want := `a\%b\_c\\d`
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
