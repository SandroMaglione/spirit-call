#!/bin/sh
# Regenerates review/ from the running dev server (pnpm dev --host --port 5207):
# inspector stills and videos, the live game on desktop and phone, and the menu.
#   sh art/characters/abigail/tools/review.sh [port]
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
PORT=${1:-5207}
HOST=$(ipconfig getifaddr en0 2>/dev/null || echo localhost)
GAME="http://$HOST:$PORT"
INSPECT="$GAME/art/characters/abigail/inspector/"
TMP=$(mktemp -d)
cd "$ROOT"
pnpm -s shot "$INSPECT?level&scale=420&spacing=0.55&poses=Rest@0@0,Rest@0@90,Rest@0@180" "$HERE/review/turnaround.png" --size 1100x760 --dpr 1 --wait 3000
pnpm -s shot "$INSPECT?scale=260" "$HERE/review/poses.png" --size 2400x620 --dpr 1 --wait 3000
pnpm -s shot "$INSPECT?scale=1300&focus=0.86&spacing=0.32&poses=Idle@0@0,Idle@0@-30,Idle@0@60" "$HERE/review/face.png" --size 1500x560 --dpr 1 --wait 3000
pnpm -s shot "$INSPECT?scale=game&zoom=0.8&compare&poses=Idle@0,Run@0.1,AttackCombo@0.033,AttackCombo@0.1,AttackCombo@0.533,AttackCombo@0.97,Dash@0.1" "$TMP/game.png" --size 600x120 --dpr 3 --wait 3000
pnpm -s shot "$GAME/" "$TMP/menu.png" --size 1280x800 --dpr 2 --wait 5000
mkdir -p "$TMP/live" "$TMP/phone" "$TMP/close" "$TMP/small"
node "$HERE/tools/play.mjs" "$GAME/?play&team=swordsman" "$TMP/live" desktop
node "$HERE/tools/play.mjs" "$GAME/?play&team=swordsman" "$TMP/phone" phone
node "$HERE/tools/record.mjs" "$INSPECT?scale=300&spacing=0.62&poses=Idle@0,Run@0,AttackCombo@0,Power@0,Dash@0" "$TMP/close" 3 1700x620 1
node "$HERE/tools/record.mjs" "$INSPECT?scale=game&zoom=0.8&compare&poses=Idle@0,Run@0,AttackCombo@0,Dash@0" "$TMP/small" 3 480x150 3
ffmpeg -loglevel error -y -framerate 30 -i "$TMP/close/f%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 20 "$HERE/review/moves-close.mp4"
ffmpeg -loglevel error -y -framerate 30 -i "$TMP/small/f%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 18 -vf "scale=1440:-2:flags=neighbor" "$HERE/review/moves-game-size.mp4"
uv run -q --with pillow "$HERE/tools/compose.py" "$TMP" "$HERE/review"
echo "review written to $HERE/review"
