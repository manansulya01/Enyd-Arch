set -e

# ── Enyd Arch · local Postgres ──────────────────────────────────────────────
# Isolated from any other Postgres on the machine.
#   docker compose -f infra/compose.postgres.yml up -d
#   pnpm db:push
#   pnpm db:seed
#   pnpm dev
#
# Game sandbox origin (origin isolation) runs on :3001
#   pnpm dev:sandbox

CONTAINER=enyd-arch-postgres
PORT=5499
DB=enyd_arch
USER=enyd
PW=enyd_arch_dev_pw

case "$1" in
  up)
    docker run -d --name $CONTAINER \
      -e POSTGRES_PASSWORD=$PW -e POSTGRES_DB=$DB -e POSTGRES_USER=$USER \
      -p $PORT:5432 --restart unless-stopped postgres:17-alpine
    sleep 4
    echo "postgres ready on 127.0.0.1:$PORT"
    ;;
  down)
    docker rm -f $CONTAINER
    ;;
  reset)
    docker rm -f $CONTAINER 2>/dev/null || true
    "$0" up
    pnpm db:push --force
    pnpm db:seed
    ;;
  *)
    echo "usage: $0 {up|down|reset}"
    ;;
esac