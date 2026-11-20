#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run JT.pdf. Install Node.js LTS from https://nodejs.org/"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies for the first time..."
  npm install
fi

echo "Starting JT.pdf in your browser..."
npm run dev -- --open
