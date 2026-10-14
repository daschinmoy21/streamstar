package sketch

import (
	"sort"
	"streamstar/internal/privacy"
)

// SampleCountMin is a strict epsilon-LDP count protocol. Each client pads to
// cap using a public null item, samples ONE data-independent matrix coordinate,
// and applies RR to the stochastic encoding counter/cap. All clients have total
// mass one, permitting count-mean collision correction. This is inspired by
// PrivSketch sampling; it is not that paper's ordering-matrix algorithm.
func SampleCountMin(clients [][]int, p Params, domain, cap int, epsilon float64, rng *privacy.Random) []float64 {
	out := make([]float64, domain)
	decoded := make([]float64, p.Rows*p.Width)
	for _, items := range clients {
		coord := rng.Index(p.Rows * p.Width)
		row, bucket := coord/p.Width, coord%p.Width
		count := 0
		for _, item := range items {
			if p.Bucket(item, row) == bucket {
				count++
			}
		}
		if p.Bucket(domain, row) == bucket {
			count += cap - len(items)
		}
		bit := rng.RandomizedResponse(float64(count)/float64(cap), epsilon)
		value := privacy.Debias(bit, epsilon)
		// Decode the individual report before updating the aggregate. The mean
		// estimator is linear: accumulate its debiased coordinate once instead
		// of iterating through the entire domain for every report.
		decoded[coord] += float64(p.Rows*p.Width) * value
	}
	for item := range out {
		for row := 0; row < p.Rows; row++ {
			out[item] += decoded[row*p.Width+p.Bucket(item, row)] / float64(p.Rows)
		}
		out[item] = (out[item]/float64(len(clients)) - 1/float64(p.Width)) / (1 - 1/float64(p.Width))
	}
	return out
}

// PrivSketch reproduces the paper's boolean sketch + ordering matrix + sampled
// RR + decode-first estimator. Target: client PRESENCE, not event frequency.
// Its data-dependent ordering metadata does NOT satisfy ordinary full-domain
// epsilon-LDP; callers must expose only a conditional privacy label.
func PrivSketch(clients [][]int, p Params, domain int, epsilon float64, rng *privacy.Random) []float64 {
	out := make([]float64, domain)
	// Public query hashes can be precomputed once, but the ordering minimum
	// still must be decoded per client before aggregation.
	queries := make([][]int, domain)
	for item := range queries {
		queries[item] = make([]int, p.Rows)
		for row := 0; row < p.Rows; row++ {
			queries[item][row] = row*p.Width + p.Bucket(item, row)
		}
	}
	for _, items := range clients {
		bits := make([]bool, p.Rows*p.Width)
		for _, item := range items {
			for row := 0; row < p.Rows; row++ {
				bits[row*p.Width+p.Bucket(item, row)] = true
			}
		}
		indices := make([]int, len(bits))
		for i := range indices {
			indices[i] = i
		}
		// Random tie-breaking within the two boolean counter groups.
		for i := len(indices) - 1; i > 0; i-- {
			j := rng.Index(i + 1)
			indices[i], indices[j] = indices[j], indices[i]
		}
		sort.SliceStable(indices, func(i, j int) bool { return !bits[indices[i]] && bits[indices[j]] })
		order := make([]int, len(bits))
		for rank, index := range indices {
			order[index] = rank
		}
		sampled := rng.Index(len(bits))
		x := 0.0
		if bits[sampled] {
			x = 1
		}
		bit := rng.RandomizedResponse(x, epsilon)
		// Algorithm 3's signed RR calibration keeps the +1/2 offset public,
		// outside the sampled Horvitz-Thompson term.
		value := (privacy.Debias(bit, epsilon) - .5) * float64(len(bits))
		for item := range out {
			selected := queries[item][0]
			for row := 1; row < p.Rows; row++ {
				index := queries[item][row]
				if order[index] < order[selected] {
					selected = index
				}
			}
			if selected == sampled {
				out[item] += value
			}
		}
	}
	for item := range out {
		out[item] = out[item]/float64(len(clients)) + .5
	}
	return out
}
