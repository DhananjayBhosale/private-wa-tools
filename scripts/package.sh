#!/bin/sh
# Builds dist/private-wa-tools.zip with only the files the browser needs.
set -eu
cd "$(dirname "$0")/.."
rm -rf dist
mkdir dist
zip -r -q dist/private-wa-tools.zip manifest.json icons src LICENSE -x "*.DS_Store" -x "icons/icon.svg"
echo "dist/private-wa-tools.zip"
