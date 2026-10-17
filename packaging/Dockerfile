# Build environment for Düzenbaz desktop packages.
# Linux packages are built on Ubuntu 22.04 (glibc 2.35) so the AppImage runs on most current distributions.
# The Windows installer is built on Ubuntu 24.04, whose NSIS (3.09+) is new enough for Tauri's installer script.
ARG UBUNTU=22.04
FROM ubuntu:${UBUNTU}
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl wget file ca-certificates git xz-utils pkg-config \
      libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
      nsis lld llvm clang \
    && rm -rf /var/lib/apt/lists/*
# Node.js
ARG NODE_VERSION=22.22.2
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz | tar -xJ -C /opt \
    && ln -s /opt/node-v${NODE_VERSION}-linux-x64/bin/* /usr/local/bin/
# Rust + Windows cross-compilation (MSVC target via cargo-xwin)
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable \
    && rustup target add x86_64-pc-windows-msvc \
    && cargo install --locked cargo-xwin \
    && chmod -R a+rX /opt/rustup /opt/cargo
