#!/bin/sh
set -e

# Apply pending migrations, optionally load the demo data, then start the API.
npx prisma migrate deploy
if [ "$SEED_DEMO" = "1" ]; then
  node dist/prisma/seed.js
fi
exec node dist/main
