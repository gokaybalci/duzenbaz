ARG UBUNTU=22.04
FROM ubuntu:${UBUNTU}
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl wget file ca-certificates git xz-utils pkg-config \
      libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
      nsis lld llvm clang \
    && rm -rf /var/lib/apt/lists/*
ARG NODE_VERSION=22.22.2
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz | tar -xJ -C /opt \
    && ln -s /opt/node-v${NODE_VERSION}-linux-x64/bin/* /usr/local/bin/
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable \
    && rustup target add x86_64-pc-windows-msvc \
    && cargo install --locked cargo-xwin \
    && chmod -R a+rX /opt/rustup /opt/cargo
