#!/bin/sh
set -eu
# /input contains only explicitly mounted sources, never host credentials or .env.
mkdir -p /workspace/apps/backend /workspace/apps/frontend
cp /input/package.json /input/package-lock.json /workspace/
cp /input/apps/backend/package.json /input/apps/backend/tsconfig*.json /workspace/apps/backend/
cp /input/apps/frontend/package.json /input/apps/frontend/tsconfig.json /input/apps/frontend/index.html /workspace/apps/frontend/
# Replace only container-private source trees; host input is read-only.
rm -rf /workspace/apps/backend/src /workspace/apps/frontend/src /workspace/apps/frontend/public
cp -R /input/apps/backend/src /workspace/apps/backend/src
cp -R /input/apps/frontend/src /workspace/apps/frontend/src
cp -R /input/apps/frontend/public /workspace/apps/frontend/public
cp /input/firebase.emulators.json /input/firestore.rules /input/firestore.indexes.json /workspace/
cd /workspace
# No hooks, lockfile rewrites or generated artifacts on the host checkout.
npm ci --ignore-scripts --no-audit --no-fund
npm run build
mkdir -p /data
if [ -f /data/firebase-export-metadata.json ]; then
  echo "[firebase] Restoring private local data from /data"
  set -- --import=/data
elif [ -f /input/docker/firebase/demo-data/firebase-export-metadata.json ]; then
  echo "[firebase] Importing the repository synthetic demo fixture"
  set -- --import=/input/docker/firebase/demo-data
else
  echo "[firebase] No local export or repository fixture; starting empty"
  set --
fi
exec firebase emulators:start --config firebase.emulators.json \
  --project demo-work-track --only auth,firestore,functions,hosting \
  --export-on-exit=/data "$@"
