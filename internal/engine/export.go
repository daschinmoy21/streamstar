package engine

import (
	"encoding/csv"
	"fmt"
	"io"
)

func WriteCSV(w io.Writer, rounds []Round, seed int64) error {
	c := csv.NewWriter(w)
	if err := c.Write([]string{"seed", "round", "method", "target", "privacy_model", "injected_drift", "detected", "released", "reason", "width", "epsilon", "probe_queries", "release_queries", "staleness", "linf", "mse", "ncr", "top_k_variance", "top_k_recall", "processing_ms", "round_processing_ms", "events_per_processing_second", "bytes_per_client", "total_bytes", "sketch_payload_bytes", "events", "clipped", "window_cohorts", "end_to_end_p50_ms", "end_to_end_p95_ms", "top_k_error_variance", "top_k_intersection"}); err != nil {
		return err
	}
	for _, round := range rounds {
		for _, r := range round.Results {
			values := []any{seed, round.Number, r.ID, r.Target, r.Privacy, round.InjectedDrift, r.Detected, r.Released, r.Reason, r.Width, r.Epsilon, r.Ledger.ProbeQueries, r.Ledger.ReleaseQueries, r.Staleness, r.Metrics.LInf, r.Metrics.MSE, r.Metrics.NCR, r.Metrics.TopKVariance, r.Metrics.TopKRecall, r.LatencyMS, round.LatencyMS, round.Throughput, r.BytesPerClient, r.TotalBytes, r.MemoryBytes, round.Events, round.Clipped, round.WindowCohorts, round.EndToEndP50MS, round.EndToEndP95MS, r.Metrics.TopKErrorVariance, r.Metrics.TopKIntersection}
			row := make([]string, len(values))
			for i, v := range values {
				row[i] = fmt.Sprint(v)
			}
			if err := c.Write(row); err != nil {
				return err
			}
		}
	}
	c.Flush()
	return c.Error()
}
