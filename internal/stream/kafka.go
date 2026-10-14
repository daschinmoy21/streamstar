package stream

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/segmentio/kafka-go"
)

// EnsureTopic creates the research topic before joining a consumer group. This
// avoids an initial empty assignment when the consumer starts before replay.
// Existing topics retain their partition/replication configuration.
func EnsureTopic(ctx context.Context, brokers []string, topic string) error {
	if len(brokers) == 0 {
		return fmt.Errorf("no Kafka brokers configured")
	}
	transport := &kafka.Transport{}
	defer transport.CloseIdleConnections()
	client := &kafka.Client{Addr: kafka.TCP(brokers...), Transport: transport, Timeout: 10 * time.Second}
	response, err := client.CreateTopics(ctx, &kafka.CreateTopicsRequest{Topics: []kafka.TopicConfig{{Topic: topic, NumPartitions: 4, ReplicationFactor: 1}}})
	if err != nil {
		return err
	}
	err = response.Errors[topic]
	if errors.Is(err, kafka.TopicAlreadyExists) {
		return nil
	}
	return err
}

func NewKafkaReader(brokers []string, topic, group string) *kafka.Reader {
	return kafka.NewReader(kafka.ReaderConfig{Brokers: brokers, Topic: topic, GroupID: group, MinBytes: 1, MaxBytes: 10e6, CommitInterval: 0, StartOffset: kafka.FirstOffset, WatchPartitionChanges: true, PartitionWatchInterval: time.Second})
}

// Consume uses Fetch/Commit so offsets advance only after a batch is processed.
// A timed partial batch prevents low-traffic streams from waiting forever.
func Consume(ctx context.Context, reader *kafka.Reader, batchSize int, interval time.Duration, process func(Batch) error) error {
	return consume(ctx, reader, reader.Config().Topic, batchSize, interval, process)
}

type consumer interface {
	FetchMessage(context.Context) (kafka.Message, error)
	CommitMessages(context.Context, ...kafka.Message) error
}

func consume(ctx context.Context, reader consumer, topic string, batchSize int, interval time.Duration, process func(Batch) error) error {
	var events []Event
	var messages []kafka.Message
	deadline := time.Now().Add(interval)
	flush := func() error {
		if len(events) == 0 {
			return nil
		}
		if err := process(Batch{Events: events, Phase: "Kafka · " + topic}); err != nil {
			return err
		}
		if err := reader.CommitMessages(ctx, messages...); err != nil {
			return err
		}
		events = nil
		messages = nil
		deadline = time.Now().Add(interval)
		return nil
	}
	for {
		if len(events) == 0 {
			deadline = time.Now().Add(interval)
		}
		readCtx, cancel := context.WithDeadline(ctx, deadline)
		msg, err := reader.FetchMessage(readCtx)
		cancel()
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if err == context.DeadlineExceeded {
				if err := flush(); err != nil {
					return err
				}
				continue
			}
			return err
		}
		var event Event
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			return fmt.Errorf("partition %d offset %d: %w", msg.Partition, msg.Offset, err)
		}
		if event.Timestamp == 0 {
			event.Timestamp = time.Now().UnixMilli()
		}
		events = append(events, event)
		messages = append(messages, msg)
		if len(events) >= batchSize {
			if err := flush(); err != nil {
				return err
			}
		}
	}
}
func Publish(ctx context.Context, brokers []string, topic string, events []Event) error {
	if err := EnsureTopic(ctx, brokers, topic); err != nil {
		return err
	}
	writer := &kafka.Writer{Addr: kafka.TCP(brokers...), Topic: topic, Balancer: &kafka.Hash{}, RequiredAcks: kafka.RequireAll, WriteTimeout: 10 * time.Second, AllowAutoTopicCreation: true}
	defer writer.Close()
	messages := make([]kafka.Message, 0, len(events))
	for _, e := range events {
		data, err := json.Marshal(e)
		if err != nil {
			return err
		}
		messages = append(messages, kafka.Message{Key: []byte(fmt.Sprintf("%d", e.Client)), Value: data})
	}
	for attempt := 0; attempt < 10; attempt++ {
		err := writer.WriteMessages(ctx, messages...)
		if !errors.Is(err, kafka.UnknownTopicOrPartition) {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
	return fmt.Errorf("Kafka topic metadata did not become available: %s", topic)
}
