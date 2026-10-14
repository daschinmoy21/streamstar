package engine

import (
	"streamstar/internal/stream"
	"testing"
)

func BenchmarkStreamingWindow(b *testing.B) {
	c := DefaultConfig()
	c.EpsilonLimit = 1e9
	e, _ := New(c)
	source := stream.NewSynthetic(c.Seed, c.Domain, c.Clients, c.EventsPerRound, 0)
	batch := source.Next()
	for i := 0; i < c.WindowRounds; i++ {
		e.Process(batch)
	}
	b.ReportAllocs()
	b.SetBytes(int64(c.EventsPerRound))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := e.Process(batch); err != nil {
			b.Fatal(err)
		}
	}
}
