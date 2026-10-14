package engine

import (
	"math"
	"reflect"
	"streamstar/internal/stream"
	"testing"
)

func smallConfig() Config {
	c := DefaultConfig()
	c.Domain = 16
	c.Clients = 8
	c.EventsPerRound = 32
	c.WindowRounds = 2
	c.ContributionCap = 2
	c.Width = 16
	c.MinWidth = 16
	c.MaxWidth = 32
	c.ProbeWidth = 16
	c.LocalWidth = 4
	c.TopK = 3
	c.DeterministicNoise = true
	return c
}
func TestWindowAccountingAndPrivacyCap(t *testing.T) {
	c := smallConfig()
	c.EpsilonLimit = 2.5
	c.MaxStaleness = 3
	e, err := New(c)
	if err != nil {
		t.Fatal(err)
	}
	source := stream.NewSynthetic(26, c.Domain, c.Clients, c.EventsPerRound, 0)
	var final Round
	previous := make(map[string]float64)
	for i := 0; i < 30; i++ {
		round, err := e.Process(source.Next())
		if err != nil {
			t.Fatal(err)
		}
		if round.WindowCohorts != min(i+1, 2) {
			t.Fatal("wrong active window")
		}
		for _, r := range round.Results {
			if r.Epsilon > c.EpsilonLimit || r.Epsilon < previous[r.ID] {
				t.Fatalf("invalid epsilon trajectory %s %v", r.ID, r.Epsilon)
			}
			if math.IsNaN(r.Metrics.LInf) || math.IsInf(r.Metrics.MSE, 0) {
				t.Fatal("nonfinite estimator")
			}
			previous[r.ID] = r.Epsilon
		}
		final = round
	}
	for _, r := range final.Results {
		if !r.Exhausted || r.BytesPerClient != 0 {
			t.Fatalf("queried after exhaustion: %+v", r)
		}
	}
}
func TestStableGateChargesProbesAndRetainsEstimate(t *testing.T) {
	c := smallConfig()
	c.EpsilonLimit = 100
	c.ChangeThreshold = 100
	c.MaxStaleness = 5
	e, _ := New(c)
	b := stream.Batch{Events: []stream.Event{{Client: 0, Item: 0}, {Client: 0, Item: 0}, {Client: 1, Item: 1}}, Phase: "stationary"}
	var first Result
	for i := 0; i < 6; i++ {
		round, err := e.Process(b)
		if err != nil {
			t.Fatal(err)
		}
		g := round.Results[4]
		if i == 0 {
			first = g
			if !g.Released {
				t.Fatal("missing initial release")
			}
		}
		if i > 0 && i < 5 {
			if g.Released || g.Releases != 1 || g.Ledger.ProbeQueries != i+1 || g.Ledger.ReleaseQueries != 1 {
				t.Fatalf("stable round not accounted: %+v", g)
			}
			for j, item := range first.Top {
				if g.Top[j].Estimate != item.Estimate {
					t.Fatal("withheld round silently changed estimate")
				}
			}
		}
		if i == 5 && (!g.Released || g.Reason != "maximum staleness") {
			t.Fatal("max-staleness release failed")
		}
	}
}
func TestInvalidBatchHasNoSideEffects(t *testing.T) {
	e, _ := New(smallConfig())
	if _, err := e.Process(stream.Batch{Events: []stream.Event{{Client: 0, Item: 100}}}); err == nil {
		t.Fatal("accepted invalid batch")
	}
	if e.round != 0 || len(e.window.Batches) != 0 {
		t.Fatal("invalid batch changed window")
	}
	for _, m := range e.models {
		if m.ledger.Queries != 0 {
			t.Fatal("invalid batch spent budget")
		}
	}
}
func TestDeterministicResearchModeReproducesEstimates(t *testing.T) {
	c := smallConfig()
	a, _ := New(c)
	b, _ := New(c)
	s := stream.NewSynthetic(1, c.Domain, c.Clients, c.EventsPerRound, 2)
	for i := 0; i < 3; i++ {
		batch := s.Next()
		x, _ := a.Process(batch)
		y, _ := b.Process(batch)
		for j := range x.Results {
			if !reflect.DeepEqual(x.Results[j].Top, y.Results[j].Top) {
				t.Fatal("estimates are not reproducible")
			}
		}
	}
}
func TestPageHinkleyRespondsToControlledShift(t *testing.T) {
	p := PageHinkley{}
	for i := 0; i < 20; i++ {
		if p.Update(.01, .1) {
			t.Fatal("stationary sequence triggered drift")
		}
	}
	found := false
	for i := 0; i < 4; i++ {
		found = found || p.Update(.5, .1)
	}
	if !found {
		t.Fatal("missed controlled shift")
	}
}
func TestMetricsUseEntireDomainAndRankedMass(t *testing.T) {
	truth := []float64{.5, .3, .2, 0}
	estimate := []float64{.5, .3, .2, 1}
	m := Evaluate(estimate, truth, 2)
	if m.LInf != 1 || math.Abs(m.MSE-.25) > 1e-10 || m.TopKRecall != .5 || m.NCR >= 1 {
		t.Fatalf("wrong metrics %+v", m)
	}
	perfect := Evaluate(truth, truth, 2)
	if perfect.LInf != 0 || perfect.NCR != 1 || perfect.TopKRecall != 1 || perfect.TopKVariance != 0 {
		t.Fatal("perfect estimator not scored correctly")
	}
	paper := Evaluate([]float64{.9, 0, .8, 0}, truth, 2, 10)
	if math.Abs(paper.NCR-2.0/3) > 1e-10 || math.Abs(paper.TopKVariance-16) > 1e-10 || paper.TopKIntersection != 1 {
		t.Fatalf("source-paper metrics incorrect: %+v", paper)
	}
}
func TestConfigRejectsUnsafeShapesAndNonfiniteParameters(t *testing.T) {
	for _, mutate := range []func(*Config){func(c *Config) { c.Rows = 4 }, func(c *Config) { c.Width = 17 }, func(c *Config) { c.NoiseMultiplier = math.NaN() }, func(c *Config) { c.Domain = 0 }, func(c *Config) { c.Clients = 100000; c.ContributionCap = 1024; c.WindowRounds = 32 }} {
		c := DefaultConfig()
		mutate(&c)
		if c.Validate() == nil {
			t.Fatal("accepted invalid config")
		}
	}
}
