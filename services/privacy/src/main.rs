use bytes::Bytes;
use http_body_util::{BodyExt, Full, Limited};
use hyper::{Method, Request, Response, StatusCode, body::Incoming, header, service::service_fn};
use hyper_util::rt::TokioIo;
use kernel::policy::patterns::{PatternRegistry, PatternRule};
use kernel::policy::redaction::RedactionEngine;
use kernel::policy::streaming::{ScanResult, StreamingDetector};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{convert::Infallible, sync::Arc, time::Duration};
use tokio::sync::Semaphore;

const MAX_BODY: usize = 262_144;
const MAX_TEXT: usize = 65_536;
fn allowed_origin(origin: &str) -> bool {
    std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://127.0.0.1:5173,http://localhost:5173".into())
        .split(',')
        .any(|allowed| allowed.trim() == origin)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct InspectRequest {
    text: String,
}
#[derive(Serialize)]
struct Match {
    category: String,
    start: usize,
    end: usize,
}
#[derive(Serialize)]
struct InspectResponse {
    status: &'static str,
    matches: Vec<Match>,
}

fn response(status: StatusCode, decision: InspectResponse) -> Response<Full<Bytes>> {
    let body = serde_json::to_vec(&decision).expect("serializable decision");
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::VARY, "Origin")
        .body(Full::new(Bytes::from(body)))
        .expect("constant headers")
}
fn discard(status: StatusCode) -> Response<Full<Bytes>> {
    response(
        status,
        InspectResponse {
            status: "discard",
            matches: vec![],
        },
    )
}

fn detector() -> StreamingDetector {
    let mut registry = PatternRegistry::with_defaults();
    registry.patterns.push(PatternRule {
        category: "CREDENTIAL".into(),
        pattern: Regex::new(
            r"(?i)\b(?:password|passcode|pin|secret|api[_ -]?key|token)\s*[:=]\s*[^\r\n]+",
        )
        .expect("constant credential regex"),
        validator: None,
        base_confidence: 0.98,
        context_boosters: vec![],
    });
    StreamingDetector::new(Arc::new(registry), Arc::new(RedactionEngine::empty()))
}

fn inspect(detector: &StreamingDetector, text: &str) -> InspectResponse {
    if text.trim().is_empty()
        || text.len() > MAX_TEXT
        || text
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
    {
        return InspectResponse {
            status: "discard",
            matches: vec![],
        };
    }
    let mut matches = Vec::new();
    // Scan each complete OCR line with the upstream streaming detector. This also
    // catches a partial-only line when another line contains a full match.
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        match detector.scan(line.trim_end_matches('\n')) {
            ScanResult::FullMatch(found) => matches.extend(found.into_iter().map(|d| Match {
                category: d.category,
                start: offset + d.start,
                end: offset + d.end,
            })),
            ScanResult::PartialMatch => {
                return InspectResponse {
                    status: "discard",
                    matches: vec![],
                };
            }
            ScanResult::NoMatch => {}
        }
        offset += line.len();
    }
    InspectResponse {
        status: "ok",
        matches,
    }
}

async fn handle(
    req: Request<Incoming>,
    detector: Arc<StreamingDetector>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok());
    if !matches!(
        host,
        Some("127.0.0.1:8081" | "localhost:8081" | "privacy:8081")
    ) {
        return Ok(discard(StatusCode::FORBIDDEN));
    }
    if req.method() == Method::GET && matches!(req.uri().path(), "/health" | "/ready") {
        return Ok(response(
            StatusCode::OK,
            InspectResponse {
                status: "ok",
                matches: vec![],
            },
        ));
    }
    let origin = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok());
    if !origin.is_some_and(allowed_origin)
        || req.uri().path() != "/v1/inspect"
        || req.uri().query().is_some()
    {
        return Ok(discard(StatusCode::FORBIDDEN));
    }
    if req.method() == Method::OPTIONS {
        return Ok(response(
            StatusCode::OK,
            InspectResponse {
                status: "ok",
                matches: vec![],
            },
        ));
    }
    if req.method() != Method::POST
        || req
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            != Some("application/json")
    {
        return Ok(discard(StatusCode::BAD_REQUEST));
    }
    let body = match tokio::time::timeout(
        Duration::from_secs(3),
        Limited::new(req.into_body(), MAX_BODY).collect(),
    )
    .await
    {
        Ok(Ok(body)) => body.to_bytes(),
        _ => return Ok(discard(StatusCode::PAYLOAD_TOO_LARGE)),
    };
    let input = match serde_json::from_slice::<InspectRequest>(&body) {
        Ok(input) => input,
        Err(_) => return Ok(discard(StatusCode::BAD_REQUEST)),
    };
    // Text exists only for this bounded local request, never in logs or responses.
    let decision = inspect(&detector, &input.text);
    Ok(response(StatusCode::OK, decision))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let listener = tokio::net::TcpListener::bind((host.as_str(), 8081)).await?;
    let detector = Arc::new(detector());
    let permits = Arc::new(Semaphore::new(8));
    eprintln!("Interdict ready on port 8081 (no request logging)");
    loop {
        let (stream, _) = listener.accept().await?;
        let Ok(permit) = permits.clone().try_acquire_owned() else {
            continue;
        };
        let detector = detector.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let service = service_fn(move |req| handle(req, detector.clone()));
            let _ = tokio::time::timeout(
                Duration::from_secs(10),
                hyper::server::conn::http1::Builder::new()
                    .keep_alive(false)
                    .serve_connection(TokioIo::new(stream), service),
            )
            .await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn covers_required_categories_and_byte_offsets() {
        let input = "€ planning\nEmail: alex@example.test\nPhone: +44 20 1234 5678\nIBAN: BE68 5390 0754 7034\nCard: 4111 1111 1111 1111\nPassword: synthetic-secret";
        let result = inspect(&detector(), input);
        assert_eq!(result.status, "ok");
        for category in ["EMAIL", "PHONE", "IBAN", "CREDIT_CARD", "CREDENTIAL"] {
            assert!(
                result.matches.iter().any(|m| m.category == category),
                "missing {category}"
            );
        }
        let email = result
            .matches
            .iter()
            .find(|m| m.category == "EMAIL")
            .unwrap();
        assert_eq!(&input[email.start..email.end], "alex@example.test");
    }
    #[test]
    fn rejects_partials_and_invalid_input() {
        assert_eq!(
            inspect(&detector(), "contact: foo@\nEmail: a@example.test").status,
            "discard"
        );
        assert_eq!(inspect(&detector(), "").status, "discard");
        assert_eq!(
            inspect(&detector(), &"a".repeat(MAX_TEXT + 1)).status,
            "discard"
        );
        assert_eq!(inspect(&detector(), "null\0byte").status, "discard");
    }
    #[test]
    fn reuses_checksum_validators() {
        use kernel::policy::patterns::validators::{luhn_check, validate_iban};
        assert!(luhn_check("4111 1111 1111 1111"));
        assert!(!luhn_check("4111 1111 1111 1112"));
        assert!(validate_iban("BE68 5390 0754 7034"));
        assert!(!validate_iban("BE68 5390 0754 7035"));
        let result = inspect(
            &detector(),
            "IBAN: BE68 5390 0754 7035\nCard: 4111 1111 1111 1112",
        );
        assert!(
            !result
                .matches
                .iter()
                .any(|m| m.category == "IBAN" || m.category == "CREDIT_CARD")
        );
    }
}
