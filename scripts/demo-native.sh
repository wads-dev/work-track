#!/bin/sh
# Only fresh private containers; no published ports or live emulator exports.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
for FILE in scripts/design-demo.mjs scripts/demo-fixture.mjs scripts/demo-firebase.json docker/firebase/Dockerfile; do
  [ -f "$ROOT/$FILE" ] || { echo "Missing checkout file: $FILE" >&2; exit 1; }
done
[ -d "$ROOT/docker/firebase" ] && [ ! -L "$ROOT/docker/firebase" ] && [ ! -L "$ROOT/docker/firebase/demo-data" ] || { echo 'Refusing unexpected fixture directory/symlink' >&2; exit 1; }
MODE=${1:-verify}
case "$MODE" in
  export)
    [ "${2:-}" = '--confirm-synthetic-export' ] && [ "$#" -eq 2 ] || { echo 'Export replaces the repository synthetic fixture; pass export --confirm-synthetic-export' >&2; exit 1; }
    # Inspect the existing small metadata before allowing replacement.
    if [ -f "$ROOT/docker/firebase/demo-data/firebase-export-metadata.json" ]; then
      node -e 'const m=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));if(m.firestore?.path!=="firestore_export"||m.auth?.path!=="auth_export")throw Error("Unexpected existing fixture metadata")' "$ROOT/docker/firebase/demo-data/firebase-export-metadata.json"
    fi
    COMMAND='node /input/scripts/demo-fixture.mjs --seed && firebase emulators:export /output/demo-data --project demo-work-track --force'
    IMPORT=
    MOUNT="$ROOT/docker/firebase:/output"
    ;;
  verify)
    [ "$#" -le 1 ] || { echo 'Unexpected verify arguments' >&2; exit 1; }
    [ -f "$ROOT/docker/firebase/demo-data/firebase-export-metadata.json" ] || { echo 'Fixture metadata missing' >&2; exit 1; }
    COMMAND='node /input/scripts/demo-fixture.mjs'
    IMPORT=--import=/output/demo-data
    MOUNT="$ROOT/docker/firebase:/output:ro"
    ;;
  *) echo 'Use verify or export --confirm-synthetic-export' >&2; exit 1 ;;
esac
node "$ROOT/scripts/design-demo.mjs" --json | docker run --rm -i --entrypoint sh -e DESIGN_FIXTURE_PRIVATE=1 -e "FIXTURE_COMMAND=$COMMAND" -e "FIXTURE_IMPORT=$IMPORT" -v "$ROOT/scripts:/input/scripts:ro" -v "$MOUNT" pointcontextsaver-firebase:latest -c 'cat > /workspace/demo-seed.json; cp /input/scripts/demo-firebase.json /workspace/firebase.json; firebase emulators:exec --project demo-work-track --only auth,firestore ${FIXTURE_IMPORT:+"$FIXTURE_IMPORT"} "$FIXTURE_COMMAND"'
