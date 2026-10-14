package engine

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
)

type Config struct {
	Domain             int     `json:"domain"`
	Clients            int     `json:"clients"`
	EventsPerRound     int     `json:"events_per_round"`
	WindowRounds       int     `json:"window_rounds"`
	ContributionCap    int     `json:"contribution_cap"`
	Rows               int     `json:"rows"`
	Width              int     `json:"width"`
	MinWidth           int     `json:"min_width"`
	MaxWidth           int     `json:"max_width"`
	ProbeWidth         int     `json:"probe_width"`
	NoiseMultiplier    float64 `json:"noise_multiplier"`
	ProbeMultiplier    float64 `json:"probe_multiplier"`
	EpsilonLimit       float64 `json:"epsilon_limit"`
	Delta              float64 `json:"delta"`
	LocalEpsilon       float64 `json:"local_epsilon"`
	LocalWidth         int     `json:"local_width"`
	TargetError        float64 `json:"target_error"`
	ChangeThreshold    float64 `json:"change_threshold"`
	MaxStaleness       int     `json:"max_staleness"`
	DriftEvery         int     `json:"drift_every"`
	TopK               int     `json:"top_k"`
	Seed               int64   `json:"seed"`
	DeterministicNoise bool    `json:"deterministic_noise"`
}

func DefaultConfig() Config {
	return Config{Domain: 256, Clients: 512, EventsPerRound: 4096, WindowRounds: 4, ContributionCap: 8, Rows: 5, Width: 64, MinWidth: 16, MaxWidth: 256, ProbeWidth: 32, NoiseMultiplier: 4, ProbeMultiplier: 8, EpsilonLimit: 12, Delta: 1e-5, LocalEpsilon: 0.3, LocalWidth: 16, TargetError: 0.025, ChangeThreshold: 0.08, MaxStaleness: 12, DriftEvery: 15, TopK: 10, Seed: 26}
}
func (c Config) Validate() error {
	for name, value := range map[string]float64{"noise_multiplier": c.NoiseMultiplier, "probe_multiplier": c.ProbeMultiplier, "epsilon_limit": c.EpsilonLimit, "delta": c.Delta, "local_epsilon": c.LocalEpsilon, "target_error": c.TargetError, "change_threshold": c.ChangeThreshold} {
		if math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 {
			return fmt.Errorf("%s must be finite and positive", name)
		}
	}
	if c.Domain < 8 || c.Domain > 1000000 || c.Clients < 2 || c.Clients > 100000 || c.EventsPerRound < 1 || c.EventsPerRound > 1000000 {
		return fmt.Errorf("domain/clients/events outside supported bounds")
	}
	if c.WindowRounds < 1 || c.WindowRounds > 32 || c.ContributionCap < 1 || c.ContributionCap > 1024 {
		return fmt.Errorf("invalid window or contribution cap")
	}
	if c.Rows < 1 || c.Rows > 15 || c.Rows%2 == 0 {
		return fmt.Errorf("rows must be odd, between 1 and 15")
	}
	for _, width := range []int{c.Width, c.MinWidth, c.MaxWidth, c.ProbeWidth, c.LocalWidth} {
		if width < 2 || width > 4096 || width&(width-1) != 0 {
			return fmt.Errorf("widths must be powers of two between 2 and 4096")
		}
	}
	if c.MinWidth > c.Width || c.Width > c.MaxWidth {
		return fmt.Errorf("initial width must be between min_width and max_width")
	}
	if c.Delta >= 1 || c.LocalEpsilon > 16 || c.MaxStaleness < 1 || c.DriftEvery < 0 || c.TopK < 1 || c.TopK > c.Domain {
		return fmt.Errorf("invalid privacy, drift, staleness, or top-k settings")
	}
	if c.NoiseMultiplier > 1e6 || c.ProbeMultiplier > 1e6 || c.TargetError > 1 {
		return fmt.Errorf("noise multiplier or target error outside supported numerical range")
	}
	if int64(c.Clients)*int64(c.WindowRounds)*int64(c.ContributionCap) > 20000000 {
		return fmt.Errorf("window exceeds 20 million contribution slots")
	}
	return nil
}
func LoadConfig(path string) (Config, error) {
	c := DefaultConfig()
	if path != "" {
		f, err := os.Open(path)
		if err != nil {
			return c, err
		}
		defer f.Close()
		d := json.NewDecoder(f)
		d.DisallowUnknownFields()
		if err = d.Decode(&c); err != nil {
			return c, err
		}
	}
	return c, c.Validate()
}
