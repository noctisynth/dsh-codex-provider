use std::time::Duration;

use serde::Deserialize;
use tokio_util::sync::CancellationToken;

use super::Session;

#[derive(Deserialize)]
struct RevocationMetadata {
    issuer: String,
    revocation_endpoint: reqwest::Url,
}

/// False means local sign-out may proceed, with remote revocation unconfirmed.
pub(crate) async fn revoke(
    http: &reqwest::Client,
    session: &Session,
    cancel: &CancellationToken,
) -> bool {
    if cancel.is_cancelled() {
        return false;
    }
    if session.refresh_token.is_empty() {
        return true;
    }
    tokio::select! {
        _ = cancel.cancelled() => false,
        result = revoke_inner(http, session) => result,
    }
}

async fn revoke_inner(http: &reqwest::Client, session: &Session) -> bool {
    let Ok(response) = http
        .get("https://auth.openai.com/.well-known/openid-configuration")
        .send()
        .await
    else {
        return false;
    };
    if !response.status().is_success() {
        return false;
    }
    let Ok(metadata) = response.json::<RevocationMetadata>().await else {
        return false;
    };
    if metadata.issuer != super::ISSUER || metadata.revocation_endpoint.scheme() != "https" {
        return false;
    }
    // Protocol-required retry for a network error or a 5xx; never retry a 4xx.
    for delay in [0, 1, 2] {
        if delay != 0 {
            tokio::time::sleep(Duration::from_secs(delay)).await;
        }
        match http
            .post(metadata.revocation_endpoint.clone())
            .form(&[
                ("token", session.refresh_token.as_str()),
                ("token_type_hint", "refresh_token"),
                ("client_id", session.client_id.as_str()),
            ])
            .send()
            .await
        {
            Ok(response) if response.status() == reqwest::StatusCode::OK => return true,
            Ok(response) if !response.status().is_server_error() => return false,
            _ => {}
        }
    }
    false
}
