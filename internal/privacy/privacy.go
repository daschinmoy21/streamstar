// Package privacy implements Gaussian zCDP composition and pure-DP composition.
// This deliberately uses no subsampling amplification or disjoint-window assumption.
package privacy

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"math"
	mrand "math/rand"
)

type Ledger struct {
	Rho            float64 `json:"rho"`
	PureEpsilon    float64 `json:"pure_epsilon"`
	Delta          float64 `json:"delta"`
	Limit          float64 `json:"limit"`
	Queries        int     `json:"queries"`
	ProbeQueries   int     `json:"probe_queries"`
	ReleaseQueries int     `json:"release_queries"`
}

func Epsilon(rho, pure, delta float64) float64 {
	return pure + rho + 2*math.Sqrt(rho*(-math.Log(delta)))
}
func (l Ledger) Epsilon() float64 { return Epsilon(l.Rho, l.PureEpsilon, l.Delta) }
func (l Ledger) CanGaussian(multiplier float64) bool {
	return multiplier > 0 && Epsilon(l.Rho+1/(2*multiplier*multiplier), l.PureEpsilon, l.Delta) <= l.Limit
}
func (l *Ledger) Gaussian(multiplier float64, probe bool) bool {
	if !l.CanGaussian(multiplier) {
		return false
	}
	l.Rho += 1 / (2 * multiplier * multiplier)
	l.Queries++
	if probe {
		l.ProbeQueries++
	} else {
		l.ReleaseQueries++
	}
	return true
}
func (l *Ledger) Local(epsilon float64) bool {
	if epsilon <= 0 || l.Epsilon()+epsilon > l.Limit+1e-12 {
		return false
	}
	// Clamp only machine rounding at the cap (e.g. 40 reports × 0.3).
	l.PureEpsilon = min(l.PureEpsilon+epsilon, l.Limit-Epsilon(l.Rho, 0, l.Delta))
	l.Queries++
	l.ReleaseQueries++
	return true
}

// Random uses crypto entropy for privacy mechanisms by default. Deterministic
// mode is ONLY for reproducible research and carries no deployment DP claim.
type Random struct{ deterministic *mrand.Rand }

func NewRandom(seed int64, deterministic bool) *Random {
	r := &Random{}
	if deterministic {
		r.deterministic = mrand.New(mrand.NewSource(seed))
	}
	return r
}
func (r *Random) Uniform() float64 {
	if r.deterministic != nil {
		return (float64(r.deterministic.Int63()>>10) + 0.5) / (1 << 53)
	}
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Errorf("privacy entropy: %w", err))
	}
	return (float64(binary.LittleEndian.Uint64(b[:])>>11) + 0.5) / (1 << 53)
}
func (r *Random) Index(n int) int { return min(n-1, int(r.Uniform()*float64(n))) }
func (r *Random) Normal() float64 {
	return math.Sqrt(-2*math.Log(r.Uniform())) * math.Cos(2*math.Pi*r.Uniform())
}
func (r *Random) Noise(values []float64, sigma float64) {
	for i := range values {
		values[i] += sigma * r.Normal()
	}
}

// RandomizedResponse privately reports a bounded scalar in [0,1]. A Bernoulli
// encoding followed by binary RR has likelihood ratio at most exp(epsilon)
// for ANY two scalar inputs. Coordinates must be sampled independently of data.
func (r *Random) RandomizedResponse(value, epsilon float64) bool {
	p := 1 / (1 + math.Exp(-epsilon))
	return r.Uniform() < (1-p)+(2*p-1)*value
}
func Debias(bit bool, epsilon float64) float64 {
	b := 0.0
	if bit {
		b = 1
	}
	p := 1 / (1 + math.Exp(-epsilon))
	return (b - (1 - p)) / (2*p - 1)
}
