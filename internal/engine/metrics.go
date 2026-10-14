package engine

import (
	"math"
	"sort"
)

type Metrics struct {
	LInf              float64 `json:"linf"`
	MSE               float64 `json:"mse"`
	NCR               float64 `json:"ncr"`
	TopKVariance      float64 `json:"top_k_variance"`
	TopKRecall        float64 `json:"top_k_recall"`
	TopKErrorVariance float64 `json:"top_k_error_variance"`
	TopKIntersection  int     `json:"top_k_intersection"`
}
type Item struct {
	ID       int     `json:"id"`
	Estimate float64 `json:"estimate"`
	Truth    float64 `json:"truth"`
}

func Ranked(v []float64) []int {
	ids := make([]int, len(v))
	for i := range ids {
		ids[i] = i
	}
	sort.Slice(ids, func(i, j int) bool {
		if v[ids[i]] == v[ids[j]] {
			return ids[i] < ids[j]
		}
		return v[ids[i]] > v[ids[j]]
	})
	return ids
}
func Evaluate(estimate, truth []float64, k int, normalizers ...float64) Metrics {
	normalizer := 1.0
	if len(normalizers) > 0 {
		normalizer = normalizers[0]
	}
	m := Metrics{}
	for i, t := range truth {
		e := estimate[i] - t
		m.LInf = max(m.LInf, math.Abs(e))
		m.MSE += e * e
	}
	m.MSE /= float64(len(truth))
	actual, predicted := Ranked(truth), Ranked(estimate)
	k = min(k, len(truth))
	den, num, mean := 0.0, 0.0, 0.0
	ranks := map[int]float64{}
	for i := 0; i < k; i++ {
		ranks[actual[i]] = float64(k - i)
		den += float64(k - i)
		mean += estimate[actual[i]] - truth[actual[i]]
	}
	for i := 0; i < k; i++ {
		num += ranks[predicted[i]]
	}
	if den > 0 {
		m.NCR = num / den
	}
	mean /= float64(k)
	for i := 0; i < k; i++ {
		e := estimate[actual[i]] - truth[actual[i]] - mean
		m.TopKErrorVariance += e * e
		if ranks[predicted[i]] > 0 {
			m.TopKRecall += 1 / float64(k)
			m.TopKIntersection++
			diff := (estimate[predicted[i]] - truth[predicted[i]]) * normalizer
			m.TopKVariance += diff * diff
		}
	}
	m.TopKErrorVariance /= float64(k)
	if m.TopKIntersection > 0 {
		m.TopKVariance /= float64(m.TopKIntersection)
	}
	return m
}
func Top(estimate, truth []float64, k int) []Item {
	out := make([]Item, 0, k)
	for _, id := range Ranked(estimate)[:min(k, len(estimate))] {
		out = append(out, Item{ID: id, Estimate: estimate[id], Truth: truth[id]})
	}
	return out
}
