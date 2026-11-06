use std::time::{SystemTime, UNIX_EPOCH};

use openidconnect::{
    AccessTokenHash, AuthorizationCode, CsrfToken, Nonce, OAuth2TokenResponse, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope, TokenResponse,
    core::{CoreAuthenticationFlow, CoreProviderMetadata, CoreTokenType},
};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

use super::{
    Session,
    callback::{self, Callback},
    provider,
};
use crate::error::Error;

pub(crate) struct PendingLogin {
    pub url: String,
    http: reqwest::Client,
    metadata: CoreProviderMetadata,
    previous: Option<Session>,
    host_id: String,
    redirect: RedirectUrl,
    nonce: Nonce,
    verifier: PkceCodeVerifier,
    receiver: oneshot::Receiver<Callback>,
    cancel: CancellationToken,
}

impl Drop for PendingLogin {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}

pub(crate) async fn begin_login(
    http: reqwest::Client,
    host_id: String,
    previous: Option<Session>,
    cancel: CancellationToken,
) -> Result<PendingLogin, Error> {
    if cancel.is_cancelled() {
        return Err(Error::Auth("ChatGPT sign-in cancelled"));
    }
    let uuid = uuid::Uuid::parse_str(&host_id)
        .map_err(|_| Error::Auth("Invalid persisted ChatGPT host ID"))?;
    if uuid.get_version() != Some(uuid::Version::Random) || !host_id.starts_with("urn:uuid:") {
        return Err(Error::Auth(
            "ChatGPT host ID must be a persisted UUID v4 URN",
        ));
    }
    if previous
        .as_ref()
        .is_some_and(|session| session.host_id != host_id)
    {
        return Err(Error::Auth(
            "Saved ChatGPT registration belongs to a different host",
        ));
    }
    let metadata = tokio::select! {
        _ = cancel.cancelled() => return Err(Error::Auth("ChatGPT sign-in cancelled")),
        result = provider::discover(&http) => result?,
    };
    let client_id = previous
        .as_ref()
        .map(|session| session.client_id.as_str())
        .unwrap_or(super::DYNAMIC_CLIENT);
    let client = provider::client(metadata.clone(), client_id.into())?;
    let state = CsrfToken::new_random();
    let nonce = Nonce::new_random();
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (redirect, receiver) = callback::listen(state.clone(), cancel.clone()).await?;
    let redirect =
        RedirectUrl::new(redirect).map_err(|_| Error::Auth("Invalid ChatGPT callback URL"))?;
    let client = client.set_redirect_uri(redirect.clone());
    let authorization_nonce = nonce.clone();
    let mut request = client
        .authorize_url(
            CoreAuthenticationFlow::AuthorizationCode,
            || state,
            move || authorization_nonce,
        )
        .set_pkce_challenge(challenge)
        .add_extra_param("ext_agent_host_id", host_id.clone())
        .add_extra_param("resource", super::RESOURCE);
    for scope in [
        "profile",
        "email",
        "offline_access",
        "resource.invoke",
        "chatgpt.tokens.use.direct",
    ] {
        request = request.add_scope(Scope::new(scope.into()));
    }
    if let Some(session) = &previous {
        request = request.add_extra_param("id_token_hint", session.id_token.clone());
        if let Some(email) = &session.email {
            request = request.add_extra_param("login_hint", email.clone());
        }
    } else {
        request = request.add_extra_param("agent_name_hint", "DSH Codex Provider");
    }
    let (url, _, _) = request.url();
    Ok(PendingLogin {
        url: url.into(),
        http,
        metadata,
        previous,
        host_id,
        redirect,
        nonce,
        verifier,
        receiver,
        cancel,
    })
}

fn issued_client_id(callback: &Callback, previous: Option<&Session>) -> Result<String, Error> {
    match (previous, callback.client_id.as_deref()) {
        (Some(session), None) => Ok(session.client_id.clone()),
        (Some(session), Some(id)) if session.client_id == id => Ok(id.into()),
        (Some(_), Some(_)) => Err(Error::Auth(
            "ChatGPT callback changed the selected registration",
        )),
        (None, Some(id)) if !id.is_empty() && id != super::DYNAMIC_CLIENT => Ok(id.into()),
        _ => Err(Error::Auth(
            "ChatGPT registration did not return an issued client ID",
        )),
    }
}

impl PendingLogin {
    pub async fn complete(mut self) -> Result<Session, Error> {
        let cancel = self.cancel.clone();
        tokio::select! {
            _ = cancel.cancelled() => Err(Error::Auth("ChatGPT sign-in cancelled")),
            result = self.finish() => result,
        }
    }

    async fn finish(&mut self) -> Result<Session, Error> {
        let callback = (&mut self.receiver)
            .await
            .map_err(|_| Error::Auth("ChatGPT callback listener ended"))?;
        if callback.error.is_some() {
            return Err(Error::Auth("ChatGPT authorization was not granted"));
        }
        let client_id = issued_client_id(&callback, self.previous.as_ref())?;
        let code = callback
            .code
            .ok_or(Error::Auth("ChatGPT callback did not return a code"))?;
        let client = provider::client(self.metadata.clone(), client_id.clone())?
            .set_redirect_uri(self.redirect.clone());
        let verifier = PkceCodeVerifier::new(self.verifier.secret().clone());
        let tokens = client
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(verifier)
            .add_extra_param("resource", super::RESOURCE)
            .request_async(&self.http)
            .await
            .map_err(|_| Error::Auth("ChatGPT code exchange failed; start a fresh sign-in"))?;
        if tokens.token_type() != &CoreTokenType::Bearer {
            return Err(Error::Auth("ChatGPT returned an unsupported token type"));
        }
        let id_token = tokens
            .id_token()
            .ok_or(Error::Auth("ChatGPT returned no ID token"))?;
        let token_verifier = client.id_token_verifier();
        let claims = id_token
            .claims(&token_verifier, &self.nonce)
            .map_err(|_| Error::Auth("ChatGPT ID token validation failed"))?;
        if let Some(expected) = claims.access_token_hash() {
            let actual = AccessTokenHash::from_token(
                tokens.access_token(),
                id_token
                    .signing_alg()
                    .map_err(|_| Error::Auth("Unsupported ChatGPT token signing algorithm"))?,
                id_token
                    .signing_key(&token_verifier)
                    .map_err(|_| Error::Auth("ChatGPT token signing key is unavailable"))?,
            )
            .map_err(|_| Error::Auth("ChatGPT access token hash validation failed"))?;
            if actual != *expected {
                return Err(Error::Auth("ChatGPT access token hash did not match"));
            }
        }
        if self
            .previous
            .as_ref()
            .is_some_and(|session| session.subject != claims.subject().as_str())
        {
            return Err(Error::Auth("ChatGPT sign-in returned a different account"));
        }
        let scopes: Vec<String> = tokens
            .scopes()
            .ok_or(Error::Auth("ChatGPT token response omitted granted scopes"))?
            .iter()
            .map(|scope| scope.as_str().to_owned())
            .collect();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| Error::Auth("System clock is before the Unix epoch"))?
            .as_secs();
        let lifetime = tokens
            .expires_in()
            .ok_or(Error::Auth("ChatGPT token response omitted expiry"))?;
        let expires_at = now
            .checked_add(lifetime.as_secs())
            .ok_or(Error::Auth("Invalid ChatGPT token expiry"))?;
        Ok(Session {
            client_id,
            issuer: claims.issuer().as_str().into(),
            subject: claims.subject().as_str().into(),
            email: claims.email().map(|email| email.as_str().into()),
            host_id: self.host_id.clone(),
            id_token: id_token.to_string(),
            access_token: tokens.access_token().secret().clone(),
            refresh_token: tokens
                .refresh_token()
                .ok_or(Error::Auth("ChatGPT returned no refresh token"))?
                .secret()
                .clone(),
            expires_at,
            scopes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{Callback, Session, issued_client_id};

    fn callback(id: Option<&str>) -> Callback {
        Callback {
            state: "test-state".into(),
            code: Some("test-code".into()),
            client_id: id.map(str::to_owned),
            error: None,
        }
    }

    #[test]
    fn new_registration_requires_an_issued_client_id() -> Result<(), crate::error::Error> {
        assert!(issued_client_id(&callback(None), None).is_err());
        assert!(issued_client_id(&callback(Some("dynamic_agent_client")), None).is_err());
        assert_eq!(
            issued_client_id(&callback(Some("issued-client")), None)?,
            "issued-client"
        );
        Ok(())
    }

    #[test]
    fn reauthorization_retains_the_selected_registration() -> Result<(), crate::error::Error> {
        let previous = Session {
            client_id: "selected-client".into(),
            issuer: super::super::ISSUER.into(),
            subject: "test-subject".into(),
            email: None,
            host_id: String::new(),
            id_token: String::new(),
            access_token: String::new(),
            refresh_token: String::new(),
            expires_at: 0,
            scopes: vec![],
        };
        assert_eq!(
            issued_client_id(&callback(None), Some(&previous))?,
            "selected-client"
        );
        assert!(issued_client_id(&callback(Some("different-client")), Some(&previous)).is_err());
        Ok(())
    }
}
