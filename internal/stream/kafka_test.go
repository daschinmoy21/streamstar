package stream

import (
	"context"
	"errors"
	"github.com/segmentio/kafka-go"
	"testing"
	"time"
)

type fakeConsumer struct {
	messages chan kafka.Message
	commits  int
}

func (r *fakeConsumer) FetchMessage(ctx context.Context) (kafka.Message, error) {
	select {
	case <-ctx.Done():
		return kafka.Message{}, ctx.Err()
	case m := <-r.messages:
		return m, nil
	}
}
func (r *fakeConsumer) CommitMessages(ctx context.Context, messages ...kafka.Message) error {
	r.commits += len(messages)
	return nil
}
func TestKafkaPartialBatchAndCommitAfterProcessing(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r := &fakeConsumer{messages: make(chan kafka.Message, 3)}
	r.messages <- kafka.Message{Value: []byte(`{"client":0,"item":1}`), Offset: 1}
	var batches int
	stop := errors.New("processing failed")
	err := consume(ctx, r, "test", 100, 5*time.Millisecond, func(batch Batch) error {
		batches++
		if len(batch.Events) != 1 {
			t.Fatal("partial batch did not flush")
		}
		return stop
	})
	if !errors.Is(err, stop) || batches != 1 || r.commits != 0 {
		t.Fatalf("committed before successful processing: err=%v batches=%d commits=%d", err, batches, r.commits)
	}
	r.messages <- kafka.Message{Value: []byte(`{"client":0,"item":1}`), Offset: 2}
	err = consume(ctx, r, "test", 1, time.Second, func(batch Batch) error { cancel(); return nil })
	if !errors.Is(err, context.Canceled) || r.commits != 1 {
		t.Fatal("successful batch not committed")
	}
}
