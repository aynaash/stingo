#!/bin/bash
# Build shareable 720p copies once the full renders are genuinely playable.
cd "$(dirname "$0")/.."
valid() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1" 2>/dev/null | grep -qE '^[0-9]+\.'; }
# existence != playable: -movflags +faststart rewrites the file at the very end,
# so the file is present and growing long before it has a moov atom
until valid out/goroutines-horizontal.mp4 && valid out/goroutines-vertical.mp4; do sleep 15; done
sleep 3
mkdir -p out/720p
echo "=== both full renders valid, transcoding 720p ==="
ffmpeg -y -loglevel error -i out/goroutines-vertical.mp4 -vf scale=720:-2 \
  -c:v libx264 -crf 26 -preset veryfast -c:a aac -b:a 128k -movflags +faststart \
  out/720p/goroutines-vertical-720p.mp4 && echo "  vertical 720p ok"
ffmpeg -y -loglevel error -i out/goroutines-horizontal.mp4 -vf scale=-2:720 \
  -c:v libx264 -crf 26 -preset veryfast -c:a aac -b:a 128k -movflags +faststart \
  out/720p/goroutines-horizontal-720p.mp4 && echo "  horizontal 720p ok"
rm -f out/goroutines-vertical-PREVIEW.mp4
echo "=== ALL READY ==="
for f in out/goroutines-vertical.mp4 out/goroutines-horizontal.mp4 out/720p/*.mp4; do
  printf "%-48s %6.1f MB  %-10s %ss\n" "$f" "$(stat -c%s "$f" | awk '{print $1/1048576}')" \
    "$(ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x "$f" | head -1)" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
done
