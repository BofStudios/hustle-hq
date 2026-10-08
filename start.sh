#!/usr/bin/env sh
# Hustle HQ — macOS / Linux başlatıcı
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24+ gerekli / required: https://nodejs.org"; exit 1
fi
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 24 ]; then
  echo "Node.js $MAJOR bulundu; Hustle HQ için Node.js 24+ önerilir / Node.js 24+ recommended: https://nodejs.org"
fi
[ -d node_modules ] || npm install --no-audit --no-fund
( sleep 2; (command -v open >/dev/null && open http://localhost:3777) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3777) ) >/dev/null 2>&1 &
exec node server/index.js
