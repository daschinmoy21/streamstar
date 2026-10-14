// Package secureagg simulates additive secret sharing between two noncolluding
// helpers over Z/(2^64). Only the helper aggregate shares are reconstructed.
// Helpers run in one process here: this is a protocol simulation, NOT deployed
// cryptographic isolation, authenticated transport, or dropout recovery.
package secureagg

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
)

type Sum struct {
	a, b    []uint64
	Clients int
}

func New(size int) *Sum { return &Sum{a: make([]uint64, size), b: make([]uint64, size)} }
func (s *Sum) Add(vector []int64) error {
	if len(vector) != len(s.a) {
		return fmt.Errorf("secure sum shape mismatch")
	}
	pad := make([]byte, 8*len(vector))
	if _, err := rand.Read(pad); err != nil {
		return fmt.Errorf("secure sum entropy: %w", err)
	}
	for i, value := range vector {
		share := binary.LittleEndian.Uint64(pad[8*i:])
		s.a[i] += share
		s.b[i] += uint64(value) - share
	}
	s.Clients++
	return nil
}
func (s *Sum) Reveal() []float64 {
	out := make([]float64, len(s.a))
	for i := range out {
		out[i] = float64(int64(s.a[i] + s.b[i]))
	}
	return out
}
