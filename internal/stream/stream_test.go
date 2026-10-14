package stream

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestSlidingClipUsesMostRecentContributions(t *testing.T) {
	events := []Event{{Client: 0, Item: 1}, {Client: 0, Item: 2}, {Client: 0, Item: 3}, {Client: 1, Item: 4}}
	clients, clipped, err := Clip(events, 2, 8, 2)
	if err != nil {
		t.Fatal(err)
	}
	if clipped != 1 || !reflect.DeepEqual(clients[0], []int{3, 2}) {
		t.Fatalf("wrong clipping: %v %d", clients, clipped)
	}
	w := Window{Capacity: 2}
	w.Push(clients)
	w.Push([][]int{{5}, nil})
	w.Push([][]int{{6}, nil})
	if !reflect.DeepEqual(w.Flatten(2)[0], []int{5, 6}) {
		t.Fatal("window failed to expire oldest cohort")
	}
	if _, _, err := Clip([]Event{{Client: 2, Item: 0}}, 2, 8, 2); err == nil {
		t.Fatal("accepted unknown public client slot")
	}
}
func TestSyntheticKnownDriftAndReproducibility(t *testing.T) {
	a, b := NewSynthetic(26, 16, 8, 64, 3), NewSynthetic(26, 16, 8, 64, 3)
	for i := 1; i <= 10; i++ {
		x, y := a.Next(), b.Next()
		if x.Drift != (i > 1 && (i-1)%3 == 0) {
			t.Fatalf("incorrect drift label at %d", i)
		}
		for j := range x.Events {
			if x.Events[j].Client != y.Events[j].Client || x.Events[j].Item != y.Events[j].Item {
				t.Fatal("data source not reproducible")
			}
		}
	}
}
func TestDatasetParsers(t *testing.T) {
	cases := []struct {
		format, content string
		count           int
	}{{"kosarak", "12 13 12\n13 14\n", 5}, {"gowalla", "7\t2010-01-01T00:00:00Z\t1.2\t3.4\t123\n", 1}, {"sentiment140", "0,1,date,flag,user,\"Hello world, HELLO!\"\n", 3}, {"aol", "AnonID\tQuery\tQueryTime\tItemRank\tClickURL\n123\tsearch\tdate\t1\thttps://example.com\n", 1}, {"jsonl", "{\"client\":1,\"item\":2}\n", 1}}
	for _, tc := range cases {
		t.Run(tc.format, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "data")
			os.WriteFile(path, []byte(tc.content), 0600)
			r, err := OpenReplay(path, tc.format, 8, 16)
			if err != nil {
				t.Fatal(err)
			}
			defer r.Close()
			batch, err := r.Next(64)
			if err != nil {
				t.Fatal(err)
			}
			if len(batch.Events) != tc.count {
				t.Fatalf("got %d events want %d", len(batch.Events), tc.count)
			}
		})
	}
}
func TestReplayDomainOverflowIsExplicit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data")
	os.WriteFile(path, []byte("a b c\n"), 0600)
	r, err := OpenReplay(path, "kosarak", 2, 2)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	if _, err := r.Next(4); err == nil {
		t.Fatal("silently aliased the item domain")
	}
}
