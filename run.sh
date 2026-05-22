#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
else
  echo "nvm was not found at $NVM_DIR/nvm.sh"
  exit 1
fi

nvm use v22.12.0

if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@9.15.4
fi

if [ ! -d "node_modules" ]; then
  pnpm install
fi

pnpm dev
