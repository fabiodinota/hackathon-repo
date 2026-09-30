FROM rust:1.98-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends cmake clang libclang-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --locked --release
FROM debian:bookworm-slim
COPY --from=build /build/target/release/kbc-privacy-sidecar /usr/local/bin/privacy-sidecar
USER 65532:65532
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/privacy-sidecar"]
