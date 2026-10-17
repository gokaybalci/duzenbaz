#!/usr/bin/env bash
# Build Dersplan desktop packages inside a container.
#   packaging/build.sh            -> Linux (AppImage, deb, rpm) + Windows (NSIS installer)
#   packaging/build.sh linux      -> Linux only
#   packaging/build.sh windows    -> Windows only
# Output is copied to release/.
set -euo pipefail
cd "$(dirname "$0")/.."
WHAT="${1:-all}"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/dersplan-build"
mkdir -p "$CACHE/cargo" "$CACHE/home" release

run() { # run <image> <command>
  local image=$1; shift
  docker run --rm --user "$(id -u):$(id -g)" \
    -e HOME=/cache/home -e CARGO_HOME=/cache/cargo -e APPIMAGE_EXTRACT_AND_RUN=1 -e NO_STRIP=true \
    -v "$CACHE:/cache" -v "$PWD:/work" -w /work "$image" bash -c "export PATH=/opt/cargo/bin:\$PATH; $1"
}

[[ -d node_modules ]] || npm ci --no-audit --no-fund

if [[ "$WHAT" == all || "$WHAT" == linux ]]; then
  docker build -q -t dersplan-build:linux --build-arg UBUNTU=22.04 packaging
  run dersplan-build:linux "npx tauri build --bundles appimage,deb,rpm"
  cp src-tauri/target/release/bundle/appimage/*.AppImage src-tauri/target/release/bundle/deb/*.deb \
     src-tauri/target/release/bundle/rpm/*.rpm release/
fi
if [[ "$WHAT" == all || "$WHAT" == windows ]]; then
  docker build -q -t dersplan-build:windows --build-arg UBUNTU=24.04 packaging
  run dersplan-build:windows "npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis"
  cp src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe release/
fi
ls -lh release/
