#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
WHAT="${1:-all}"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/duzenbaz-build"
mkdir -p "$CACHE/cargo" "$CACHE/home" release

run() {
  local image=$1; shift
  docker run --rm --user "$(id -u):$(id -g)" \
    -e HOME=/cache/home -e CARGO_HOME=/cache/cargo -e APPIMAGE_EXTRACT_AND_RUN=1 -e NO_STRIP=true \
    -v "$CACHE:/cache" -v "$PWD:/work" -w /work "$image" bash -c "export PATH=/opt/cargo/bin:\$PATH; $1"
}

[[ -d node_modules ]] || npm ci --no-audit --no-fund
# check before building; set -e stops on the first failure (check:dprg needs the samples in /ssdy/rea/dagit)
npm run -s typecheck
npm run -s lint
for c in duty subjects solver dprg; do npm run -s check:$c; done

if [[ "$WHAT" == all || "$WHAT" == linux ]]; then
  docker build -q -t duzenbaz-build:linux --build-arg UBUNTU=22.04 packaging
  rm -rf src-tauri/target/release/bundle
  run duzenbaz-build:linux "npx tauri build --bundles appimage,deb,rpm"
  cp --remove-destination src-tauri/target/release/bundle/appimage/*.AppImage src-tauri/target/release/bundle/deb/*.deb \
     src-tauri/target/release/bundle/rpm/*.rpm release/
fi
if [[ "$WHAT" == all || "$WHAT" == windows ]]; then
  docker build -q -t duzenbaz-build:windows --build-arg UBUNTU=24.04 packaging
  rm -rf src-tauri/target/x86_64-pc-windows-msvc/release/bundle
  run duzenbaz-build:windows "npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis"
  cp --remove-destination src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe release/
fi
for f in release/*Düzenbaz*; do [[ -e "$f" ]] && mv -f "$f" "${f//Düzenbaz/Duzenbaz}"; done
ls -lh release/
