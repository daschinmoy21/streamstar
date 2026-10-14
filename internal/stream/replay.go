package stream

import (
	"bufio"
	"compress/gzip"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// Replay incrementally reads one dataset row at a time. It maps original user
// IDs to a fixed public client-group universe; distinct items receive dense IDs
// with explicit overflow errors instead of silently aliasing the item domain.
type Replay struct {
	Format          string
	Clients, Domain int
	Labels          map[string]int
	file            *os.File
	zip             *gzip.Reader
	scanner         *bufio.Scanner
	csv             *csv.Reader
	queue           []Event
	row             int
}

func OpenReplay(path, format string, clients, domain int) (*Replay, error) {
	if format != "jsonl" && format != "kosarak" && format != "gowalla" && format != "sentiment140" && format != "aol" {
		return nil, fmt.Errorf("unknown format %q", format)
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	r := &Replay{Format: format, Clients: clients, Domain: domain, Labels: map[string]int{}, file: f}
	var reader io.Reader = f
	if strings.HasSuffix(path, ".gz") {
		r.zip, err = gzip.NewReader(f)
		if err != nil {
			f.Close()
			return nil, err
		}
		reader = r.zip
	}
	if format == "sentiment140" {
		r.csv = csv.NewReader(reader)
		r.csv.FieldsPerRecord = -1
	} else {
		r.scanner = bufio.NewScanner(reader)
		r.scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	}
	return r, nil
}
func (r *Replay) Close() error {
	if r.zip != nil {
		r.zip.Close()
	}
	return r.file.Close()
}
func (r *Replay) slot(user string) int {
	h := uint64(14695981039346656037)
	for _, b := range []byte(user) {
		h = (h ^ uint64(b)) * 1099511628211
	}
	return int(h % uint64(r.Clients))
}
func (r *Replay) item(label string) (int, error) {
	if id, ok := r.Labels[label]; ok {
		return id, nil
	}
	if len(r.Labels) >= r.Domain {
		return 0, fmt.Errorf("dataset exceeds domain=%d at item %q; increase domain", r.Domain, label)
	}
	id := len(r.Labels)
	r.Labels[label] = id
	return id, nil
}
func (r *Replay) add(user, label string) error {
	id, err := r.item(label)
	if err != nil {
		return err
	}
	r.queue = append(r.queue, Event{Client: r.slot(user), Item: id})
	return nil
}
func (r *Replay) readRow() error {
	r.row++
	if r.csv != nil {
		row, err := r.csv.Read()
		if err != nil {
			return err
		}
		if len(row) < 6 {
			return fmt.Errorf("sentiment140 row %d: expected 6 fields", r.row)
		}
		for _, word := range strings.FieldsFunc(strings.ToLower(row[5]), func(c rune) bool { return !unicode.IsLetter(c) && !unicode.IsNumber(c) }) {
			if err := r.add(row[4], word); err != nil {
				return err
			}
		}
		return nil
	}
	if !r.scanner.Scan() {
		if err := r.scanner.Err(); err != nil {
			return err
		}
		return io.EOF
	}
	line := strings.TrimSpace(r.scanner.Text())
	if line == "" {
		return nil
	}
	fields := strings.Fields(line)
	switch r.Format {
	case "jsonl":
		var e Event
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			return fmt.Errorf("JSONL row %d: %w", r.row, err)
		}
		r.queue = append(r.queue, e)
	case "kosarak":
		for _, item := range fields {
			if err := r.add(strconv.Itoa(r.row), item); err != nil {
				return err
			}
		}
	case "gowalla":
		if len(fields) < 5 {
			return fmt.Errorf("gowalla row %d: expected user/time/lat/lon/location", r.row)
		}
		return r.add(fields[0], fields[4])
	case "aol":
		columns := strings.Split(line, "\t")
		if len(columns) < 2 {
			return fmt.Errorf("aol row %d: expected tab-separated user/query", r.row)
		}
		if strings.EqualFold(columns[0], "AnonID") {
			return nil
		}
		// Click URL when available, otherwise query text, as documented.
		label := columns[1]
		if len(columns) >= 5 && columns[4] != "" && columns[4] != "-" {
			label = columns[4]
		}
		return r.add(columns[0], label)
	}
	return nil
}
func (r *Replay) Next(events int) (Batch, error) {
	b := Batch{Phase: "Replay · " + r.Format}
	for len(b.Events) < events {
		if len(r.queue) == 0 {
			if err := r.readRow(); err != nil {
				if err == io.EOF && len(b.Events) > 0 {
					break
				}
				return b, err
			}
			if len(r.queue) == 0 {
				continue
			}
		}
		take := min(events-len(b.Events), len(r.queue))
		b.Events = append(b.Events, r.queue[:take]...)
		r.queue = r.queue[take:]
	}
	now := time.Now().UnixMilli()
	for i := range b.Events {
		b.Events[i].Timestamp = now
	}
	return b, nil
}
