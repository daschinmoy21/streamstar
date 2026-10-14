package sketch

import (
	"math"
	"streamstar/internal/privacy"
	"testing"
)

func TestSingleItemReconstruction(t *testing.T) {
	p := Params{Rows: 5, Width: 64, BucketSeed: 26, SignSeed: 41}
	v := p.Encode([]int{4, 4, 4, 4})
	values := make([]float64, len(v))
	for i := range v {
		values[i] = float64(v[i])
	}
	got := Decode([]Block{{p, values}}, 16, 4, false)
	if got[4] != 1 {
		t.Fatalf("lost sign or normalization: %v", got[4])
	}
}
func TestHybridTakesMedianAfterCohortSum(t *testing.T) {
	p := Params{Rows: 3, Width: 16, BucketSeed: 1, SignSeed: 2}
	makeBlock := func(rowValues []float64) Block {
		values := make([]float64, p.Rows*p.Width)
		for row, v := range rowValues {
			values[row*p.Width+p.Bucket(0, row)] = v * float64(p.Sign(0, row))
		}
		return Block{p, values}
	}
	blocks := []Block{makeBlock([]float64{0, 0, 10}), makeBlock([]float64{0, 10, 0})}
	if got := Decode(blocks, 1, 2, false)[0]; got != 5 {
		t.Fatalf("hybrid median(sum(rows))=%v, want 5", got)
	}
	if got := Decode(blocks, 1, 2, true)[0]; got != 0 {
		t.Fatalf("fresh sum(medians)=%v, want 0", got)
	}
}
func TestPrivateTailFitAndNoiseFallback(t *testing.T) {
	v := make([]float64, 256)
	for i := range v {
		v[i] = .4 * math.Pow(float64(i+1), -1.5)
	}
	f := FitWidth(v, .0001, .01, 16, 256, 64)
	if math.Abs(f.Alpha-1.5) > .05 || f.Width < 16 || f.Width > 256 || f.Width&(f.Width-1) != 0 {
		t.Fatalf("invalid fit %+v", f)
	}
	fallback := FitWidth(v, 1, .01, 16, 256, 64)
	if fallback.Width != 64 || fallback.Alpha != 0 {
		t.Fatal("resized without usable private signal")
	}
}
func TestSampledLocalProtocolsTargetTheirDeclaredQuantity(t *testing.T) {
	const n = 12000
	clients := make([][]int, n)
	for i := range clients {
		clients[i] = []int{0, 0}
	}
	p := Params{Rows: 3, Width: 8, BucketSeed: 28}
	strict := SampleCountMin(clients, p, 8, 4, 12, privacy.NewRandom(5, true))
	// Collision correction is unbiased over the public hash family, while
	// this fixed hash realization retains a known collision residual.
	bucketMass := .5
	for row := 0; row < p.Rows; row++ {
		if p.Bucket(0, row) == p.Bucket(8, row) {
			bucketMass += .5 / float64(p.Rows)
		}
	}
	expected := (bucketMass - 1/float64(p.Width)) / (1 - 1/float64(p.Width))
	if math.Abs(strict[0]-expected) > .035 {
		t.Fatalf("event estimator expected %v got %v", expected, strict[0])
	}
	presence := PrivSketch(clients, p, 8, 12, privacy.NewRandom(5, true))
	if math.Abs(presence[0]-1) > .12 {
		t.Fatalf("client presence expected 1 got %v", presence[0])
	}
}
