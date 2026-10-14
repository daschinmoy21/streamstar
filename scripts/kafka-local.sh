#!/usr/bin/env bash
# Run a local single-node KRaft broker without Docker. Enter `nix develop .#kafka` first.
set -euo pipefail
if ! command -v kafka-server-start.sh >/dev/null; then
  echo "Enter the broker environment first: nix develop .#kafka" >&2
  exit 1
fi
task_directory="${1:-.firecrawl/kafka-local}"
mkdir -p "$task_directory"
task_directory="$(cd "$task_directory" && pwd)"
cat > "$task_directory/server.properties" <<EOF
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@127.0.0.1:9093
listeners=PLAINTEXT://127.0.0.1:9092,CONTROLLER://127.0.0.1:9093
advertised.listeners=PLAINTEXT://127.0.0.1:9092
controller.listener.names=CONTROLLER
listener.security.protocol.map=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
inter.broker.listener.name=PLAINTEXT
log.dirs=$task_directory/logs
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
group.initial.rebalance.delay.ms=0
auto.create.topics.enable=true
num.partitions=4
EOF
if [ ! -f "$task_directory/logs/meta.properties" ]; then
  cluster_id="$(kafka-storage.sh random-uuid)"
  kafka-storage.sh format -t "$cluster_id" -c "$task_directory/server.properties"
fi
export KAFKA_HEAP_OPTS="-Xms256m -Xmx512m"
exec kafka-server-start.sh "$task_directory/server.properties"
