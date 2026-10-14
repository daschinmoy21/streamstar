package privacy

import (
	"math"
	"testing"
)

func TestGaussianCompositionAndCap(t *testing.T) {
	l := Ledger{Delta: 1e-5, Limit: 5}
	for i := 0; i < 100; i++ {
		before := l
		ok := l.Gaussian(4, i%2 == 0)
		if !ok {
			if l != before {
				t.Fatal("denied query changed ledger")
			}
			break
		}
	}
	if l.Epsilon() > 5 || l.Queries == 0 || l.Queries >= 100 {
		t.Fatalf("invalid cap: %+v", l)
	}
	want := l.Rho + 2*math.Sqrt(l.Rho*math.Log(1e5))
	if math.Abs(l.Epsilon()-want) > 1e-10 {
		t.Fatalf("epsilon=%v want %v", l.Epsilon(), want)
	}
	if l.ProbeQueries+l.ReleaseQueries != l.Queries {
		t.Fatal("query categories do not compose")
	}
}
func TestPureComposition(t *testing.T) {
	l := Ledger{Delta: 1e-5, Limit: 1}
	for i := 0; i < 4; i++ {
		if !l.Local(.25) {
			t.Fatal("valid query denied")
		}
	}
	if l.Local(.25) || l.Epsilon() != 1 {
		t.Fatal("pure-DP cap exceeded")
	}
	l = Ledger{Delta: 1e-5, Limit: 12}
	for i := 0; i < 40; i++ {
		if !l.Local(.3) {
			t.Fatalf("rounding denied report %d", i+1)
		}
	}
	if l.Local(.3) || l.Epsilon() > 12 {
		t.Fatal("rounding exceeded cap")
	}
}
func TestRandomizedResponseLikelihoodRatiosAndUnbiasedness(t *testing.T) {
	epsilon := .7
	p := 1 / (1 + math.Exp(-epsilon))
	for _, x := range []float64{0, .2, .5, 1} {
		for _, y := range []float64{0, .4, 1} {
			qx := (1 - p) + (2*p-1)*x
			qy := (1 - p) + (2*p-1)*y
			if qx/qy > math.Exp(epsilon)+1e-12 || (1-qx)/(1-qy) > math.Exp(epsilon)+1e-12 {
				t.Fatal("RR violated full-domain LDP")
			}
		}
	}
	rng := NewRandom(42, true)
	for _, x := range []float64{0, .25, 1} {
		sum := 0.0
		const n = 100000
		for i := 0; i < n; i++ {
			sum += Debias(rng.RandomizedResponse(x, epsilon), epsilon)
		}
		if math.Abs(sum/n-x) > .025 {
			t.Fatalf("biased RR at %v: %v", x, sum/n)
		}
	}
}
func TestCryptoNormalsFinite(t *testing.T) {
	r := NewRandom(0, false)
	for i := 0; i < 100; i++ {
		v := r.Normal()
		if math.IsNaN(v) || math.IsInf(v, 0) {
			t.Fatal("invalid normal")
		}
	}
}
