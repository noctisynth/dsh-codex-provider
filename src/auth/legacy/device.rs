use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;
use tokio::time::{Instant, sleep, timeout};
use tokio_util::sync::CancellationToken;

use crate::{
    auth::{LoginMethod, Session},
    error::Error,
};

pub(crate) const VERIFICATION_URL: &str = "https://auth.openai.com/codex/device";
const USER_CODE_URL: &str = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const POLL_URL: &str = "https://auth.openai.com/api/accounts/deviceauth/token";
const REDIRECT_URI: &str = "https://auth.openai.com/deviceauth/callback";

#[derive(Deserialize)]
struct DeviceCode {
    device_auth_id: String,
    user_code: String,
    interval: Value,
}

#[derive(Deserialize)]
struct Authorized {
    authorization_code: String,
    code_verifier: String,
}

pub(crate) struct PendingLogin {
    pub user_code: String,
    device_auth_id: String,
    interval: Duration,
    deadline: Instant,
    http: reqwest::Client,
    previous: Option<Session>,
    cancel: CancellationToken,
}

impl Drop for PendingLogin {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}

pub(crate) async fn begin(
    http: reqwest::Client,
    previous: Option<Session>,
    cancel: CancellationToken,
) -> Result<PendingLogin, Error> {
    let response = tokio::select! {
        _ = cancel.cancelled() => return Err(Error::Auth("Codex sign-in cancelled")),
        response = http.post(USER_CODE_URL).json(&json!({"client_id": super::CLIENT_ID})).send() => response.map_err(Error::Network)?,
    };
    if !response.status().is_success() {
        return Err(Error::Auth(
            "Codex device code login is unavailable; check your account settings or use browser login",
        ));
    }
    let code: DeviceCode = response
        .json()
        .await
        .map_err(|_| Error::Auth("Invalid Codex device code response"))?;
    let seconds = match &code.interval {
        Value::String(value) => value.parse::<u64>().ok(),
        value => value.as_u64(),
    }
    .map(|value| value.max(1))
    .ok_or(Error::Auth("Invalid Codex device polling interval"))?;
    if code.device_auth_id.is_empty() || code.user_code.is_empty() {
        return Err(Error::Auth("Codex returned an empty device code"));
    }
    Ok(PendingLogin {
        user_code: code.user_code,
        device_auth_id: code.device_auth_id,
        interval: Duration::from_secs(seconds),
        deadline: Instant::now() + Duration::from_secs(900),
        http,
        previous,
        cancel,
    })
}

impl PendingLogin {
    pub async fn complete(&mut self) -> Result<Session, Error> {
        let cancel = self.cancel.clone();
        let remaining = self.deadline.saturating_duration_since(Instant::now());
        tokio::select! {
            _ = cancel.cancelled() => Err(Error::Auth("Codex sign-in cancelled")),
            result = timeout(remaining, self.poll()) => result.map_err(|_| Error::Auth("Codex device code expired; start a new sign-in"))?,
        }
    }

    async fn poll(&mut self) -> Result<Session, Error> {
        loop {
            sleep(self.interval).await;
            let response = self
                .http
                .post(POLL_URL)
                .json(&json!({"device_auth_id": self.device_auth_id, "user_code": self.user_code}))
                .send()
                .await
                .map_err(Error::Network)?;
            let status = response.status();
            let body = response.bytes().await.map_err(Error::Network)?;
            match poll_result(status.as_u16(), &body)? {
                Poll::Pending => {}
                Poll::SlowDown => self.interval += Duration::from_secs(5),
                Poll::Authorized(auth) => {
                    return super::tokens::exchange(
                        &self.http,
                        &auth.authorization_code,
                        &auth.code_verifier,
                        REDIRECT_URI,
                        LoginMethod::CodexDevice,
                        self.previous.as_ref(),
                    )
                    .await;
                }
            }
        }
    }
}

enum Poll {
    Pending,
    SlowDown,
    Authorized(Authorized),
}

fn poll_result(status: u16, body: &[u8]) -> Result<Poll, Error> {
    if matches!(status, 403 | 404) {
        return Ok(Poll::Pending);
    }
    if (200..300).contains(&status) {
        let auth: Authorized = serde_json::from_slice(body)
            .map_err(|_| Error::Auth("Invalid Codex device authorization response"))?;
        if auth.authorization_code.is_empty() || auth.code_verifier.is_empty() {
            return Err(Error::Auth("Codex returned an empty authorization code"));
        }
        return Ok(Poll::Authorized(auth));
    }
    let value: Value = serde_json::from_slice(body)
        .map_err(|_| Error::Auth("Codex device authorization failed"))?;
    match value["error"]["code"]
        .as_str()
        .or_else(|| value["error"].as_str())
    {
        Some("deviceauth_authorization_pending" | "authorization_pending") => Ok(Poll::Pending),
        Some("slow_down") => Ok(Poll::SlowDown),
        _ => Err(Error::Auth(
            "Codex device authorization was rejected; start a new sign-in",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn polling_obeys_pending_slowdown_and_code_exchange_contracts() -> Result<(), Error> {
        assert!(matches!(poll_result(403, b"")?, Poll::Pending));
        assert!(matches!(poll_result(404, b"")?, Poll::Pending));
        assert!(matches!(
            poll_result(400, br#"{"error":"authorization_pending"}"#)?,
            Poll::Pending
        ));
        assert!(matches!(
            poll_result(429, br#"{"error":{"code":"slow_down"}}"#)?,
            Poll::SlowDown
        ));
        assert!(matches!(
            poll_result(
                200,
                br#"{"authorization_code":"synthetic-code","code_verifier":"synthetic-verifier"}"#
            )?,
            Poll::Authorized(_)
        ));
        assert!(poll_result(200, br#"{"authorization_code":"","code_verifier":""}"#).is_err());
        assert!(poll_result(400, br#"{"error":"access_denied"}"#).is_err());
        Ok(())
    }

    #[tokio::test]
    async fn cancelled_and_expired_device_attempts_do_not_continue_polling() -> Result<(), Error> {
        let mut pending = PendingLogin {
            user_code: "TEST-CODE".into(),
            device_auth_id: "synthetic-device".into(),
            interval: Duration::from_secs(5),
            deadline: Instant::now() + Duration::from_secs(900),
            http: reqwest::Client::new(),
            previous: None,
            cancel: CancellationToken::new(),
        };
        pending.cancel.cancel();
        assert!(matches!(
            pending.complete().await,
            Err(Error::Auth("Codex sign-in cancelled"))
        ));
        pending.cancel = CancellationToken::new();
        pending.deadline = Instant::now();
        assert!(matches!(
            pending.complete().await,
            Err(Error::Auth(
                "Codex device code expired; start a new sign-in"
            ))
        ));
        Ok(())
    }
}
