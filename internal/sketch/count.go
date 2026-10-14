// Package sketch implements the shared, fresh and hybrid hash constructions
// from Wu et al., arXiv:2306.09396, Algorithms 1 and 2.
package sketch

import (
	"fmt"
	"math"
	"sort"
)

type Params struct {
	Rows       int
	Width      int
	BucketSeed uint64
	SignSeed   uint64
}

// Mix supplies independent reproducible hash families for a public integer
// domain. It is an experimental hash, not a proof of full random independence.
func Mix(x uint64) uint64 {
	x += 0x9e3779b97f4a7c15
	x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9
	x = (x ^ (x >> 27)) * 0x94d049bb133111eb
	return x ^ (x >> 31)
}
func (p Params) Bucket(item, row int) int {
	return int(Mix(uint64(item)^Mix(p.BucketSeed+uint64(row)*0x9e3779b97f4a7c15)) % uint64(p.Width))
}
func (p Params) Sign(item, row int) int64 {
	if Mix(uint64(item)^Mix(p.SignSeed+uint64(row)*0xbf58476d1ce4e5b9))&1 == 0 {
		return -1
	}
	return 1
}
func (p Params) Encode(items []int) []int64 {
	out := make([]int64, p.Rows*p.Width)
	for _, item := range items {
		for row := 0; row < p.Rows; row++ {
			out[row*p.Width+p.Bucket(item, row)] += p.Sign(item, row)
		}
	}
	return out
}
func (p Params) RowValues(values []float64, item int) []float64 {
	out := make([]float64, p.Rows)
	for row := range out {
		out[row] = float64(p.Sign(item, row)) * values[row*p.Width+p.Bucket(item, row)]
	}
	return out
}
func Median(values []float64) float64 {
	v := append([]float64(nil), values...)
	sort.Float64s(v)
	if len(v)%2 == 1 {
		return v[len(v)/2]
	}
	return (v[len(v)/2-1] + v[len(v)/2]) / 2
}

type Block struct {
	Params Params
	Values []float64
}

// Decode sums cohort row estimates BEFORE taking the median for Hybrid/Shared,
// and takes a median per cohort BEFORE summing for Fresh. Normalizer is the
// fixed public number of contribution slots, not a private observed count.
func Decode(blocks []Block, domain int, normalizer float64, fresh bool) []float64 {
	out := make([]float64, domain)
	if len(blocks) == 0 {
		return out
	}
	for item := range out {
		rows := make([]float64, blocks[0].Params.Rows)
		for _, block := range blocks {
			v := block.Params.RowValues(block.Values, item)
			if fresh {
				out[item] += Median(v)
			} else {
				for row := range rows {
					rows[row] += v[row]
				}
			}
		}
		if !fresh {
			out[item] = Median(rows)
		}
		out[item] /= normalizer
	}
	return out
}

type Fit struct {
	Alpha              float64 `json:"alpha"`
	Beta               float64 `json:"beta"`
	Width              int     `json:"width"`
	PredictedCollision float64 `json:"predicted_collision"`
}

// FitWidth fits beta*r^-alpha to the top private probe estimates by ordinary
// least squares in value space, then applies the oracle tail bound heuristic:
// # {f >= tau} + sum_{f < tau} f^2/tau^2. Constants are experimental.
// Low signal falls back to the current width; resizing never reads true counts.
func FitWidth(estimate []float64, noiseFloor, target float64, lo, hi, current int) Fit {
	v := append([]float64(nil), estimate...)
	sort.Sort(sort.Reverse(sort.Float64Slice(v)))
	k := min(20, len(v))
	for k > 0 && v[k-1] <= 2*noiseFloor {
		k--
	}
	if k < 3 {
		return Fit{Alpha: 0, Beta: 0, Width: current}
	}
	best := math.Inf(1)
	f := Fit{Width: current}
	for a := 0.2; a <= 3; a += 0.025 {
		xy, xx := 0.0, 0.0
		for i := 0; i < k; i++ {
			x := math.Pow(float64(i+1), -a)
			xy += x * v[i]
			xx += x * x
		}
		beta := xy / xx
		err := 0.0
		for i := 0; i < k; i++ {
			diff := v[i] - beta*math.Pow(float64(i+1), -a)
			err += diff * diff
		}
		if err < best {
			best = err
			f.Alpha = a
			f.Beta = beta
		}
	}
	head, tail, mass := 0.0, 0.0, 0.0
	for rank := 1; rank <= len(v); rank++ {
		value := f.Beta * math.Pow(float64(rank), -f.Alpha)
		if mass+value > 1 {
			value = max(0, 1-mass)
		}
		mass += value
		if value >= target {
			head++
		} else {
			tail += value * value
		}
	}
	need := max(float64(lo), 2*(head+tail/(target*target)))
	f.Width = lo
	for float64(f.Width) < need && f.Width < hi {
		f.Width *= 2
	}
	f.Width = min(hi, f.Width)
	f.PredictedCollision = math.Sqrt(tail / float64(f.Width))
	return f
}

func Validate(p Params) error {
	if p.Rows < 1 || p.Width < 2 {
		return fmt.Errorf("invalid sketch shape %dx%d", p.Rows, p.Width)
	}
	return nil
}
