#!/usr/bin/env bash
# Builds app/assets/og.png (1200x630).
# Dev-only: re-run after changing the palette or the tool list.
#
# Nothing here is hand-typed: colours come from the generated palette module and
# the chips from the tool registry, so the social card cannot describe a site
# that no longer exists. (It did, once - that is why this line is here.)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=app/assets/og.png
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
BOLD=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
MONO=/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf

eval "$(node --input-type=module -e '
import { TOKENS, TOOL_ACCENTS } from "./app/js/core/palette.js";
import { TOOLS } from "./app/js/core/tools.js";
const d = TOKENS.dark;
const q = (s) => JSON.stringify(String(s));
const emit = (k, v) => console.log(`${k}=${q(v)}`);
emit("BG", d["--bg"]); emit("PANEL", d["--panel"]); emit("LINE", d["--line"]);
emit("FG", d["--fg"]); emit("FG2", d["--fg-2"]); emit("FG3", d["--fg-3"]); emit("ACC", d["--accent"]);
const us = String.fromCharCode(31);
const chip = TOOLS.map((t) => `${t.name}${us}${TOOL_ACCENTS[t.id].dark}`).join("\n");
console.log(`CHIPS=${q(chip)}`);
console.log(`COUNT=${TOOLS.length}`);
')"

# tools: name + accent, read from the registry. Names may contain spaces, so the
# record separator below is what keeps "Dates & Units" in one piece.
CHIPS=$(printf '%b' "$CHIPS")   # node emitted \n escapes; make them real lines
NAMES=(); HUES=()
while IFS="$(printf '\037')" read -r n h; do NAMES+=("$n"); HUES+=("$h"); done <<< "$CHIPS"

# Three rows of four. A single row of twelve ran off the canvas; two rows of six
# made the longest label ("Shadow & Glass") collide with its neighbour's stroke.
PER_ROW=4
TAG1="Compress images, format JSON, build gradients,"
TAG2="type a scale, check contrast - all in the tab."

args=(-size 1200x630 xc:"$BG")
# faint grid, evokes a workbench surface
GRGB=$(node -e 'const h=process.argv[1].slice(1);console.log([0,2,4].map(i=>parseInt(h.slice(i,i+2),16)).join(","))' "$LINE")
GRID="rgba($GRGB,0.55)"
for ((x=0; x<=1200; x+=60)); do args+=(-draw "stroke $GRID fill none stroke-width 1 line $x,0 $x,630"); done
for ((y=0; y<=630; y+=60)); do args+=(-draw "stroke $GRID fill none stroke-width 1 line 0,$y 1200,$y"); done
# left accent rail
args+=(-fill "$ACC" -draw "rectangle 0,0 14,630")
# kicker
args+=(-font "$MONO" -pointsize 26 -fill "$FG3" -annotate +96+96 "${COUNT^^} TOOLS  /  0 UPLOADS  /  0 SERVERS")
# wordmark
args+=(-font "$BOLD" -pointsize 146 -fill "$FG" -annotate +90+238 "Bench")
# tagline
args+=(-font "$FONT" -pointsize 38 -fill "$FG2" -annotate +96+306 "$TAG1")
args+=(-font "$FONT" -pointsize 38 -fill "$FG2" -annotate +96+354 "$TAG2")
# tool chips
X=96; Y=392
for i in "${!NAMES[@]}"; do
  label="${NAMES[$i]}"
  w=$(( $(printf '%s' "$label" | wc -c) * 15 + 36 ))
  if (( i > 0 && i % PER_ROW == 0 )); then X=96; Y=$((Y + 62)); fi
  args+=(-fill "$PANEL" -stroke "${HUES[$i]}" -strokewidth 3 -draw "roundrectangle $X,$Y,$((X+w)),$((Y+48)),12,12")
  args+=(-stroke none -font "$FONT" -pointsize 25 -fill "$FG" -annotate +$((X+20))+$((Y+31)) "$label")
  X=$((X + w + 14))
done
# footer
args+=(-font "$MONO" -pointsize 23 -fill "$FG3" -annotate +96+612 "pushparaj9749.github.io/portfolio  -  static, dependency-free, works offline")

convert "${args[@]}" -strip -depth 8 -define png:compression-level=9 PNG24:"$OUT"
# 8-bit PNG24 keeps the antialiasing on text but halves the file versus the 16-bit default.
identify -format "og.png %wx%h %[size]\n" "$OUT"
