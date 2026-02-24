#!/bin/bash
# DeepTrend analyze wrapper for launchd
# Addresses macOS TCC/sandbox issues with claude CLI

export HOME="/Users/christopherbailey"
export PATH="/Users/christopherbailey/.local/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"

PROJECT="/Volumes/OWC drive/Dev/deeptrend"
cd "$PROJECT" || exit 1

# Run analyze + publish pipeline
/usr/local/bin/npx tsx src/cli.ts analyze 2>&1
/usr/local/bin/npx tsx src/cli.ts publish 2>&1

# Commit and push updated public/ to GitHub Pages
git -C "$PROJECT" add public/
git -C "$PROJECT" commit -m "chore: update published insights $(date +%Y-%m-%d)" --allow-empty
git -C "$PROJECT" push
