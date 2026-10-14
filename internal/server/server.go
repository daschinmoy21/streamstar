package server

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"streamstar/internal/engine"
	"streamstar/internal/stream"
)

//go:embed web
var assets embed.FS

type Options struct {
	Source, File, Format string
	Interval             time.Duration
	Brokers              []string
	Topic, Group         string
}
type Server struct {
	mu         sync.Mutex
	engine     *engine.Engine
	synthetic  *stream.Synthetic
	replay     *stream.Replay
	options    Options
	running    bool
	history    []engine.Round
	generation int
	lastError  string
}

func New(c engine.Config, o Options) (*Server, error) {
	e, err := engine.New(c)
	if err != nil {
		return nil, err
	}
	if o.Interval <= 0 {
		return nil, fmt.Errorf("interval must be positive")
	}
	if o.Source != "synthetic" && o.Source != "replay" && o.Source != "manual" && o.Source != "kafka" {
		return nil, fmt.Errorf("unknown source %q", o.Source)
	}
	s := &Server{engine: e, options: o, running: o.Source != "manual", generation: 1}
	s.synthetic = stream.NewSynthetic(c.Seed, c.Domain, c.Clients, c.EventsPerRound, c.DriftEvery)
	if o.Source == "replay" {
		s.replay, err = stream.OpenReplay(o.File, o.Format, c.Clients, c.Domain)
		if err != nil {
			return nil, err
		}
	}
	return s, nil
}
func (s *Server) process(batch stream.Batch) error {
	round, err := s.engine.Process(batch)
	if err != nil {
		return err
	}
	s.history = append(s.history, round)
	if len(s.history) > 512 {
		s.history = s.history[len(s.history)-512:]
	}
	return nil
}
func (s *Server) tick() error {
	if s.options.Source == "manual" || s.options.Source == "kafka" {
		return nil
	}
	b := stream.Batch{}
	if s.replay != nil {
		var err error
		b, err = s.replay.Next(s.engine.Config.EventsPerRound)
		if err != nil {
			return err
		}
	} else {
		b = s.synthetic.Next()
	}
	return s.process(b)
}
func (s *Server) Run(ctx context.Context) error {
	if s.replay != nil {
		defer s.replay.Close()
	}
	if s.options.Source == "kafka" {
		setupCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		err := stream.EnsureTopic(setupCtx, s.options.Brokers, s.options.Topic)
		cancel()
		if err != nil {
			s.mu.Lock()
			s.lastError = err.Error()
			s.running = false
			s.mu.Unlock()
			return err
		}
		reader := stream.NewKafkaReader(s.options.Brokers, s.options.Topic, s.options.Group)
		defer reader.Close()
		err = stream.Consume(ctx, reader, s.engine.Config.EventsPerRound, s.options.Interval, func(batch stream.Batch) error { s.mu.Lock(); defer s.mu.Unlock(); return s.process(batch) })
		if err != nil && ctx.Err() == nil {
			s.mu.Lock()
			s.lastError = err.Error()
			s.running = false
			s.mu.Unlock()
		}
		return err
	}
	ticker := time.NewTicker(s.options.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			s.mu.Lock()
			if s.running {
				if err := s.tick(); err != nil {
					s.running = false
					if errors.Is(err, io.EOF) {
						s.lastError = "Replay complete"
					} else {
						s.lastError = err.Error()
					}
				}
			}
			s.mu.Unlock()
		}
	}
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	static, _ := fs.Sub(assets, "web")
	mux.Handle("GET /", http.FileServer(http.FS(static)))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"status":"ok"}`)
	})
	mux.HandleFunc("GET /api/state", s.state)
	mux.HandleFunc("POST /api/control", s.control)
	mux.HandleFunc("POST /api/events", s.ingest)
	mux.HandleFunc("GET /api/export.csv", s.export)
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		defer s.mu.Unlock()
		writeJSON(w, s.engine.Config)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			// Astro content-hashes everything under /assets/.
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-store")
		}
		mux.ServeHTTP(w, r)
	})
}
func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("expected one JSON value")
	}
	return nil
}
func (s *Server) state(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	since, _ := strconv.Atoi(r.URL.Query().Get("since"))
	generation, _ := strconv.Atoi(r.URL.Query().Get("generation"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if generation != s.generation {
		since = 0
	}
	history := make([]engine.Round, 0)
	for _, round := range s.history {
		if round.Number > since {
			history = append(history, round)
		}
	}
	if limit > 0 && len(history) > limit {
		history = history[len(history)-limit:]
	}
	var latest *engine.Round
	if len(s.history) > 0 {
		latest = &s.history[len(s.history)-1]
	}
	writeJSON(w, map[string]any{"config": s.engine.Config, "methods": engine.Methods, "source": s.options.Source, "running": s.running, "generation": s.generation, "error": s.lastError, "latest": latest, "history": history, "research_mode": true})
}
func (s *Server) control(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Action string         `json:"action"`
		Config *engine.Config `json:"config"`
	}
	if err := decode(w, r, &request); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.options.Source == "kafka" || s.options.Source == "manual" {
		http.Error(w, "use the configured ingestion source to control this stream", 409)
		return
	}
	switch request.Action {
	case "play":
		s.running = true
		s.lastError = ""
	case "pause":
		s.running = false
	case "step":
		s.running = false
		if err := s.tick(); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
	case "drift":
		if s.options.Source != "synthetic" {
			http.Error(w, "injected drift requires the synthetic source", 409)
			return
		}
		if s.synthetic.DriftEvery <= 0 {
			s.synthetic.DriftEvery = 15
		}
		s.synthetic.Round = (s.synthetic.Round/s.synthetic.DriftEvery + 1) * s.synthetic.DriftEvery
		if err := s.tick(); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
	case "reset":
		if s.options.Source != "synthetic" {
			http.Error(w, "restart the process to reset a replay", 409)
			return
		}
		c := s.engine.Config
		if request.Config != nil {
			c = *request.Config
		}
		e, err := engine.New(c)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		s.engine = e
		s.synthetic = stream.NewSynthetic(c.Seed, c.Domain, c.Clients, c.EventsPerRound, c.DriftEvery)
		s.history = nil
		s.generation++
		s.lastError = ""
		s.running = true
	default:
		http.Error(w, "unknown action", 400)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}
func (s *Server) ingest(w http.ResponseWriter, r *http.Request) {
	if s.options.Source != "manual" {
		http.Error(w, "POST ingestion requires -source manual", 409)
		return
	}
	var events []stream.Event
	if err := decode(w, r, &events); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	if len(events) == 0 || len(events) > 100000 {
		http.Error(w, "batch must contain 1–100000 events", 400)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.process(stream.Batch{Events: events, Phase: "HTTP · manual ingress"}); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	writeJSON(w, s.history[len(s.history)-1])
}
func (s *Server) export(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="streamstar-rounds.csv"`)
	engine.WriteCSV(w, s.history, s.engine.Config.Seed)
}
