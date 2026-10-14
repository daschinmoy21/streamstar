package engine

import "math"

// PageHinkley detects upward changes in the distance between a private probe
// and the last published reference. Inputs MUST already be DP postprocessing.
type PageHinkley struct {
	Count              int
	Mean, Sum, Minimum float64
}

func (p *PageHinkley) Update(value, threshold float64) bool {
	p.Count++
	p.Mean += (value - p.Mean) / float64(p.Count)
	p.Sum += value - p.Mean - 0.002
	p.Minimum = math.Min(p.Minimum, p.Sum)
	return p.Count >= 3 && p.Sum-p.Minimum > threshold
}
func distance(a, b []float64) float64 {
	if len(a) != len(b) {
		return 0
	}
	// Head changes remain visible even when the Zipf exponent does not change.
	d := 0.0
	for i := range a {
		d = max(d, math.Abs(a[i]-b[i]))
	}
	return d
}
