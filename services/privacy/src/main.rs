//! Transport scaffold only: never treat this process as a working redactor.
use axum::{
    Router,
    http::StatusCode,
    routing::{get, post},
};
#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/ready", get(unavailable))
        .route("/v1/sanitize", post(unavailable));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8081")
        .await
        .expect("privacy listener unavailable");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await
        .expect("privacy server stopped unexpectedly");
}
async fn unavailable() -> (StatusCode, &'static str) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "PRIVACY_PIPELINE_NOT_CONNECTED",
    )
}
async fn shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut terminate = signal(SignalKind::terminate()).expect("signal handler unavailable");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
