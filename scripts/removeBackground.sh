#!/usr/bin/env zsh

# Exit immediately if a command exits with a non-zero status
set -e

# Check if the user provided the input file
if [[ $# -lt 1 || $# -gt 2 ]]; then
    echo "Usage: ./autocrop.sh <input_image> [output_image.png]"
    exit 1
fi

INPUT_FILE="$1"

# If no output file is provided, create one based on the input filename
if [[ -n "$2" ]]; then
    OUTPUT_FILE="$2"
else
    # Strip extension and append _clean.png
    OUTPUT_FILE="${INPUT_FILE%.*}_clean.png"
fi

# Ensure the output file ends with .png to preserve transparency
if [[ "${OUTPUT_FILE:l}" != *.png ]]; then
    OUTPUT_FILE="${OUTPUT_FILE}.png"
fi

# Check if ImageMagick is installed
if ! command -v magick &> /dev/null; then
    echo "⚠️  Error: ImageMagick is not installed."
    echo "Please install it by running: brew install imagemagick"
    exit 1
fi

echo "Processing '${INPUT_FILE}'..."

# The ImageMagick magic:
# 1. -fuzz 2% : Allows for slight color variations in solid backgrounds
# 2. -fill none -draw "color 0,0 floodfill" : Starts at top-left pixel (0,0) and turns connected background colors transparent
# 3. -trim : Crops away the newly transparent outer edges
# 4. +repage : Resets the canvas metadata so the cropped image sits perfectly at 0,0
magick "$INPUT_FILE" \
    -fuzz 2% \
    -fill none -draw "color 0,0 floodfill" \
    -trim +repage \
    "$OUTPUT_FILE"

echo "✅ Success! Saved clean image to: ${OUTPUT_FILE}"