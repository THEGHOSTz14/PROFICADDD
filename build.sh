#!/bin/sh
# Build OpenDraft: typecheck with the bundled TypeScript, bundle with esbuild.
# Neither npm nor a system Node install is required; both tools live in .tools/
# and run on the Node shipped with the editor.
set -e
cd "$(dirname "$0")"

NODE="${NODE:-D:/ZERO/Qoder/Qoder.exe}"
ELECTRON_RUN_AS_NODE=1 "$NODE" .tools/ts5/lib/tsc.js --noEmit -p tsconfig.json
./.tools/esbuild/esbuild.exe src/main.ts \
  --bundle \
  --format=iife \
  --target=es2022 \
  --sourcemap \
  --outfile=dist/bundle.js

echo "built dist/bundle.js"
