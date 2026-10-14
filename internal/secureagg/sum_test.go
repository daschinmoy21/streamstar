package secureagg

import "testing"

func TestRingSharesReconstructSignedSum(t *testing.T) {
	s := New(4)
	vectors := [][]int64{{3, -8, 0, 100}, {-4, 2, 7, -100}, {1, -1, -2, 4}}
	for _, v := range vectors {
		if err := s.Add(v); err != nil {
			t.Fatal(err)
		}
	}
	want := []float64{0, -7, 5, 4}
	got := s.Reveal()
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("slot %d: %v != %v", i, got[i], want[i])
		}
	}
	if s.Clients != 3 {
		t.Fatal("client count incorrect")
	}
	if err := s.Add([]int64{1}); err == nil {
		t.Fatal("accepted incompatible share shape")
	}
}
