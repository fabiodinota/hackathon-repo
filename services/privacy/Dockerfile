FROM rust:1.94-bookworm AS build
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --locked --release
FROM debian:bookworm-slim
COPY --from=build /build/target/release/kbc-privacy-sidecar /usr/local/bin/privacy-sidecar
USER 65532:65532
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/privacy-sidecar"]
