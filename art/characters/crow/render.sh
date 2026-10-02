#!/bin/sh
set -eu

cd "$(dirname "$0")"
blender_binary=${CROW_BLENDER_BINARY:-/Applications/Blender.app/Contents/MacOS/Blender}
"$blender_binary" --background --python-exit-code 1 --python build.py -- --views --turntable

# Camera orbit: 72 views, five degrees apart, played over six seconds.
ffmpeg -hide_banner -loglevel error -y -framerate 12 \
  -i renders/turntable-%03d.png -c:v libx264 -crf 18 -pix_fmt yuv420p \
  -movflags +faststart renders/turntable.mp4

ffmpeg -hide_banner -loglevel error -y \
  -i renders/hero.png -i renders/front.png -i renders/side.png \
  -i renders/back.png -i renders/back-three-quarter.png -i renders/game-camera.png \
  -filter_complex '[0:v]scale=500:500[a];[1:v]scale=500:500[b];[2:v]scale=500:500[c];[3:v]scale=500:500[d];[4:v]scale=500:500[e];[5:v]scale=500:500[f];[a][b][c][d][e][f]xstack=inputs=6:layout=0_0|500_0|1000_0|0_500|500_500|1000_500[out]' \
  -map '[out]' -frames:v 1 -update 1 renders/contact-sheet.png

"$blender_binary" --background --python-exit-code 1 --python verify.py
