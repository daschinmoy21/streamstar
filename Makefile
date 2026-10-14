.PHONY: run test build experiment kafka-up kafka-down
run:
	go run ./cmd/streamstar serve
test:
	CGO_ENABLED=1 go test -race ./...
	go vet ./...
build:
	go build -o bin/streamstar ./cmd/streamstar
experiment:
	go run ./cmd/streamstar experiment -rounds 60 -seeds 3 -out results
kafka-up:
	docker compose up -d
kafka-down:
	docker compose down
