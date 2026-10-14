package server

import (
	"encoding/csv"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"streamstar/internal/engine"
	"strings"
	"testing"
	"time"
)

func testServer(t *testing.T, source string) *Server {
	t.Helper()
	c := engine.DefaultConfig()
	c.Clients = 4
	c.Domain = 16
	c.EventsPerRound = 8
	c.WindowRounds = 2
	c.ContributionCap = 2
	c.Rows = 3
	c.Width = 16
	c.ProbeWidth = 16
	c.MaxWidth = 32
	c.LocalWidth = 4
	c.DeterministicNoise = true
	c.TopK = 3
	s, err := New(c, Options{Source: source, Interval: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	return s
}
func request(s *Server, method, path, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	s.Handler().ServeHTTP(w, r)
	return w
}
func TestManualIngestionAndCSV(t *testing.T) {
	s := testServer(t, "manual")
	for _, body := range []string{`[]`, `[{"client":100,"item":0}]`, `[{"client":0,"item":0,"unexpected":true}]`, `[{"client":0,"item":0}] {}`} {
		if w := request(s, http.MethodPost, "/api/events", body); w.Code != 400 {
			t.Fatalf("accepted invalid input: %s %d", body, w.Code)
		}
	}
	if len(s.history) != 0 {
		t.Fatal("invalid events altered state")
	}
	w := request(s, http.MethodPost, "/api/events", `[{"client":0,"item":0},{"client":1,"item":1}]`)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = request(s, http.MethodGet, "/api/state", "")
	var state struct {
		History []engine.Round
		Source  string
	}
	if err := json.Unmarshal(w.Body.Bytes(), &state); err != nil {
		t.Fatal(err)
	}
	if len(state.History) != 1 || state.Source != "manual" {
		t.Fatal("wrong state")
	}
	w = request(s, http.MethodGet, "/api/export.csv", "")
	rows, err := csv.NewReader(w.Body).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 8 {
		t.Fatalf("CSV has %d rows", len(rows))
	}
}
func TestStepPauseResetAndIncrementalState(t *testing.T) {
	s := testServer(t, "synthetic")
	if w := request(s, http.MethodPost, "/api/control", `{"action":"step"}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if s.running || len(s.history) != 1 {
		t.Fatal("step did not pause and process exactly one round")
	}
	w := request(s, http.MethodGet, "/api/state?since=1&generation=1", "")
	var state struct{ History []engine.Round }
	json.Unmarshal(w.Body.Bytes(), &state)
	if len(state.History) != 0 {
		t.Fatal("incremental state repeats old rounds")
	}
	if w := request(s, http.MethodPost, "/api/control", `{"action":"reset"}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if s.generation != 2 || len(s.history) != 0 {
		t.Fatal("reset did not clear research run")
	}
	if w := request(s, http.MethodGet, "/protocol.html", ""); w.Code != 200 || !strings.Contains(w.Body.String(), "Neighboring relation") {
		t.Fatal("protocol documentation missing")
	}
}
