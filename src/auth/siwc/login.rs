use openidconnect::{
    AuthorizationCode, CsrfToken, Nonce, OAuth2TokenResponse, PkceCodeChallenge, PkceCodeVerifier,
    RedirectUrl, RequestTokenError, Scope,
    core::{CoreAuthenticationFlow, CoreErrorResponseType, CoreProviderMetadata, CoreTokenType},
};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

use crate::auth::{
    Session,
    callback::{self, Callback},
    provider, verify,
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
    receiver: Option<oneshot::Receiver<Callback>>,
    cancel: CancellationToken,
    listener_cancel: CancellationToken,
    retry_client_id: Option<String>,
    expected_client_id: Option<String>,
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
    retry_client_id: Option<String>,
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
    let client_id = retry_client_id
        .as_deref()
        .or_else(|| previous.as_ref().map(|session| session.client_id.as_str()))
        .unwrap_or(crate::auth::DYNAMIC_CLIENT);
    let client = provider::client(metadata.clone(), client_id.into())?;
    let expected_client_id =
        (client_id != crate::auth::DYNAMIC_CLIENT).then(|| client_id.to_owned());
    let state = CsrfToken::new_random();
    let nonce = Nonce::new_random();
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let listener_cancel = cancel.child_token();
    let (redirect, receiver) = callback::listen(state.clone(), listener_cancel.clone()).await?;
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
        .add_extra_param("resource", crate::auth::RESOURCE);
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
        if !session.id_token.is_empty() {
            request = request.add_extra_param("id_token_hint", session.id_token.clone());
        }
        if let Some(email) = &session.email {
            request = request.add_extra_param("login_hint", email.clone());
        }
    } else if client_id == crate::auth::DYNAMIC_CLIENT {
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
        receiver: Some(receiver),
        cancel,
        listener_cancel,
        retry_client_id: None,
        expected_client_id,
    })
}

fn issued_client_id(callback: &Callback, expected: Option<&str>) -> Result<String, Error> {
    match (expected, callback.client_id.as_deref()) {
        (Some(id), None) => Ok(id.into()),
        (Some(expected), Some(id)) if expected == id => Ok(id.into()),
        (Some(_), Some(_)) => Err(Error::Auth(
            "ChatGPT callback changed the selected registration",
        )),
        (None, Some(id)) if !id.is_empty() && id != crate::auth::DYNAMIC_CLIENT => Ok(id.into()),
        _ => Err(Error::Auth(
            "ChatGPT registration did not return an issued client ID",
        )),
    }
}

impl PendingLogin {
    pub fn can_retry(&self) -> bool {
        self.retry_client_id.is_some() && !self.cancel.is_cancelled()
    }

    pub async fn restart(self, cancel: CancellationToken) -> Result<Self, Error> {
        if !self.can_retry() {
            return Err(Error::Auth("ChatGPT sign-in cannot be retried"));
        }
        begin_login(
            self.http.clone(),
            self.host_id.clone(),
            self.previous.clone(),
            cancel,
            self.retry_client_id.clone(),
        )
        .await
    }

    pub async fn complete(&mut self) -> Result<Session, Error> {
        let cancel = self.cancel.clone();
        tokio::select! {
            _ = cancel.cancelled() => Err(Error::Auth("ChatGPT sign-in cancelled")),
            result = self.finish() => result,
        }
    }

    async fn finish(&mut self) -> Result<Session, Error> {
        let callback = self
            .receiver
            .take()
            .ok_or(Error::Auth("ChatGPT callback was already consumed"))?
            .await
            .map_err(|_| Error::Auth("ChatGPT callback listener ended"))?;
        self.listener_cancel.cancel();
        if callback.error.is_some() {
            return Err(Error::Auth("ChatGPT authorization was not granted"));
        }
        let client_id = issued_client_id(&callback, self.expected_client_id.as_deref())?;
        let code = callback
            .code
            .ok_or(Error::Auth("ChatGPT callback did not return a code"))?;
        let client = provider::client(self.metadata.clone(), client_id.clone())?
            .set_redirect_uri(self.redirect.clone());
        let verifier = PkceCodeVerifier::new(self.verifier.secret().clone());
        let token_result = client
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(verifier)
            .add_extra_param("resource", crate::auth::RESOURCE)
            .request_async(&self.http)
            .await;
        let tokens = match token_result {
            Ok(tokens) => tokens,
            Err(RequestTokenError::ServerResponse(error))
                if error.error() == &CoreErrorResponseType::InvalidGrant =>
            {
                self.retry_client_id = Some(client_id);
                return Err(Error::Auth(
                    "ChatGPT authorization code expired; retry this sign-in",
                ));
            }
            Err(_) => {
                return Err(Error::Auth(
                    "ChatGPT code exchange failed; start a fresh sign-in",
                ));
            }
        };
        if tokens.token_type() != &CoreTokenType::Bearer {
            return Err(Error::Auth("ChatGPT returned an unsupported token type"));
        }
        let identity = verify::identity(&tokens, &client, &self.nonce)?;
        if self
            .previous
            .as_ref()
            .is_some_and(|session| session.subject != identity.subject)
        {
            return Err(Error::Auth("ChatGPT sign-in returned a different account"));
        }
        let scopes: Vec<String> = tokens
            .scopes()
            .ok_or(Error::Auth("ChatGPT token response omitted granted scopes"))?
            .iter()
            .map(|scope| scope.as_str().to_owned())
            .collect();
        let expires_at = provider::expiry(&tokens)?;
        Ok(Session {
            login_method: Default::default(),
            account_id: None,
            client_id,
            issuer: identity.issuer,
            subject: identity.subject,
            email: identity.email,
            name: identity.name,
            picture: identity.picture,
            host_id: self.host_id.clone(),
            id_token: identity.id_token,
            nonce: self.nonce.secret().clone(),
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
    use super::{Callback, issued_client_id};

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
        let previous = "selected-client";
        assert_eq!(
            issued_client_id(&callback(None), Some(previous))?,
            "selected-client"
        );
        assert!(issued_client_id(&callback(Some("different-client")), Some(previous)).is_err());
        Ok(())
    }
}
