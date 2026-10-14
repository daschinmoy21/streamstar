.PHONY: run test build experiment kafka-up kafka-down ui ui-dev
run:
	go run ./cmd/streamstar serve
test:
	CGO_ENABLED=1 go test -race ./...
	go vet ./...
build:
	go build -o bin/streamstar ./cmd/streamstar
experiment:
	go run ./cmd/streamstar experiment -rounds 60 -seeds 3 -out results
ui:
	cd ui && npm ci && npm run check && npm test && npm run build
ui-dev:
	cd ui && npm run dev
kafka-up:
	docker compose up -d
kafka-down:
	docker compose down
