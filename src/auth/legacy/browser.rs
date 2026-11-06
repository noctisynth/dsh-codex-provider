use openidconnect::{CsrfToken, PkceCodeChallenge, PkceCodeVerifier};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

use crate::{
    auth::{
        LoginMethod, Session,
        callback::{self, Callback},
    },
    error::Error,
};

const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";

pub(crate) struct PendingLogin {
    pub url: String,
    http: reqwest::Client,
    previous: Option<Session>,
    verifier: PkceCodeVerifier,
    receiver: Option<oneshot::Receiver<Callback>>,
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
    let state = CsrfToken::new_random();
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (_, receiver) = callback::listen_on(state.clone(), cancel.clone(), 1455).await
        .map_err(|_| Error::Auth("Codex browser callback port 1455 is unavailable; close the other sign-in or use device code"))?;
    let mut url = reqwest::Url::parse("https://auth.openai.com/oauth/authorize")
        .map_err(|_| Error::Auth("Invalid Codex authorization URL"))?;
    url.query_pairs_mut().extend_pairs([
        ("response_type", "code"),
        ("client_id", super::CLIENT_ID),
        ("redirect_uri", REDIRECT_URI),
        ("scope", "openid profile email offline_access"),
        ("code_challenge", challenge.as_str()),
        ("code_challenge_method", "S256"),
        ("state", state.secret()),
        ("id_token_add_organizations", "true"),
        ("codex_cli_simplified_flow", "true"),
        ("originator", "dsh-codex-provider"),
    ]);
    Ok(PendingLogin {
        url: url.into(),
        http,
        previous,
        verifier,
        receiver: Some(receiver),
        cancel,
    })
}

impl PendingLogin {
    pub async fn complete(&mut self) -> Result<Session, Error> {
        let receiver = self
            .receiver
            .take()
            .ok_or(Error::Auth("Codex callback was already consumed"))?;
        let cancel = self.cancel.clone();
        tokio::select! {
            _ = cancel.cancelled() => Err(Error::Auth("Codex sign-in cancelled")),
            result = async {
                let callback = receiver.await.map_err(|_| Error::Auth("Codex callback listener ended"))?;
                if callback.error.is_some() { return Err(Error::Auth("Codex authorization was not granted")); }
                let code = callback.code.filter(|code| !code.is_empty()).ok_or(Error::Auth("Codex callback did not return a code"))?;
                super::tokens::exchange(&self.http, &code, self.verifier.secret(), REDIRECT_URI, LoginMethod::CodexBrowser, self.previous.as_ref()).await
            } => result,
        }
    }
}
