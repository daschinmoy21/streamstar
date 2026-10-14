package stream

import (
	"fmt"
	"math"
	"math/rand"
	"time"
)

type Event struct {
	Client    int   `json:"client"`
	Item      int   `json:"item"`
	Timestamp int64 `json:"timestamp"`
}
type Batch struct {
	Events []Event
	Drift  bool
	Phase  string
}

// Synthetic produces gradual exponent shifts and abrupt hot-item rotations.
// Only its event generator uses a seeded PRNG; privacy uses independent entropy.
type Synthetic struct {
	rng                                 *rand.Rand
	Domain, Clients, Events, DriftEvery int
	Round                               int
}

func NewSynthetic(seed int64, domain, clients, events, driftEvery int) *Synthetic {
	return &Synthetic{rng: rand.New(rand.NewSource(seed)), Domain: domain, Clients: clients, Events: events, DriftEvery: driftEvery}
}
func (s *Synthetic) Next() Batch {
	s.Round++
	phase := 0
	if s.DriftEvery > 0 {
		phase = (s.Round - 1) / s.DriftEvery
	}
	exponents := []float64{1.6, 0.8, 1.25, 1.9}
	alpha := exponents[phase%len(exponents)]
	// Within each phase the tail gradually changes; every second phase also
	// replaces the popular IDs so concentration-only detectors cannot suffice.
	if s.DriftEvery > 0 {
		alpha += 0.15 * float64((s.Round-1)%s.DriftEvery) / float64(s.DriftEvery)
	}
	offset := (phase / 2) * (s.Domain / 3)
	cdf := make([]float64, s.Domain)
	mass := 0.0
	for i := range cdf {
		mass += math.Pow(float64(i+1), -alpha)
		cdf[i] = mass
	}
	b := Batch{Drift: s.DriftEvery > 0 && s.Round > 1 && (s.Round-1)%s.DriftEvery == 0, Phase: fmt.Sprintf("Zipf %.2f · hot-set %d", alpha, phase/2)}
	now := time.Now().UnixMilli()
	for i := 0; i < s.Events; i++ {
		x := s.rng.Float64() * mass
		lo, hi := 0, s.Domain-1
		for lo < hi {
			mid := (lo + hi) / 2
			if cdf[mid] < x {
				lo = mid + 1
			} else {
				hi = mid
			}
		}
		b.Events = append(b.Events, Event{Client: s.rng.Intn(s.Clients), Item: (lo + offset) % s.Domain, Timestamp: now})
	}
	return b
}

// Clip selects the most recent cap events per public client slot. Each round
// has a public fixed capacity, including zero contributions from absent clients.
func Clip(events []Event, clients, domain, cap int) ([][]int, int, error) {
	out := make([][]int, clients)
	for _, e := range events {
		if e.Client < 0 || e.Client >= clients || e.Item < 0 || e.Item >= domain {
			return nil, 0, fmt.Errorf("event outside public client/domain bounds: client=%d item=%d", e.Client, e.Item)
		}
	}
	kept := 0
	for i := len(events) - 1; i >= 0; i-- {
		e := events[i]
		if len(out[e.Client]) < cap {
			out[e.Client] = append(out[e.Client], e.Item)
			kept++
		}
	}
	return out, len(events) - kept, nil
}

type Window struct {
	Capacity int
	Batches  [][][]int
}

func (w *Window) Push(clients [][]int) {
	w.Batches = append(w.Batches, clients)
	if len(w.Batches) > w.Capacity {
		w.Batches = w.Batches[len(w.Batches)-w.Capacity:]
	}
}
func (w *Window) Flatten(clients int) [][]int {
	out := make([][]int, clients)
	for _, batch := range w.Batches {
		for i, items := range batch {
			out[i] = append(out[i], items...)
		}
	}
	return out
}
