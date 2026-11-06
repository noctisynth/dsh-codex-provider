use std::{
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicU16, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use openidconnect::{
    AsyncHttpClient, HttpRequest, HttpResponse, Nonce, NonceVerifier, OAuth2TokenResponse,
    RefreshToken, RequestTokenError, TokenResponse,
    core::{CoreTokenResponse, CoreTokenType},
};

use super::{Session, provider, verify};
use crate::error::{ApiError, Error};

pub(crate) fn now() -> Result<u64, Error> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| Error::Auth("System clock is before the Unix epoch"))
}

pub(crate) fn expiry(tokens: &CoreTokenResponse) -> Result<u64, Error> {
    let lifetime = tokens
        .expires_in()
        .ok_or(Error::Auth("ChatGPT token response omitted expiry"))?;
    now()?
        .checked_add(lifetime.as_secs())
        .ok_or(Error::Auth("Invalid ChatGPT token expiry"))
}

/// The caller must hold DSH's credential transaction through persistence.
pub(crate) async fn renew(http: &reqwest::Client, session: Session) -> Result<Session, Error> {
    if session.refresh_token.is_empty() {
        return Err(Error::Auth(
            "ChatGPT account is signed out; continue with ChatGPT",
        ));
    }
    if session.expires_at.saturating_sub(now()?) > 60 {
        return Ok(session);
    }
    let metadata = provider::discover(http).await?;
    let client = provider::client(metadata, session.client_id.clone())?;
    renew_with_client(
        &client,
        |request| {
            let http = http.clone();
            async move { http.call(request).await }
        },
        session,
    )
    .await
}

async fn renew_with_client<F, Fut, E>(
    client: &provider::Client,
    http: F,
    mut session: Session,
) -> Result<Session, Error>
where
    F: Fn(HttpRequest) -> Fut + Sync,
    Fut: Future<Output = Result<HttpResponse, E>> + Send,
    E: std::error::Error + 'static,
{
    // OAuth errors do not retain the HTTP status; a 5xx must never revoke local tokens.
    let status = Arc::new(AtomicU16::new(0));
    let result = client
        .exchange_refresh_token(&RefreshToken::new(session.refresh_token.clone()))
        .add_extra_param("resource", super::RESOURCE)
        .request_async(&|request| {
            let response = http(request);
            let response_status = status.clone();
            async move {
                let response = response.await?;
                response_status.store(response.status().as_u16(), Ordering::Relaxed);
                Ok::<_, E>(response)
            }
        })
        .await;
    let status = status.load(Ordering::Relaxed);
    if status >= 500 {
        return Err(Error::Api(ApiError {
            status: Some(status),
            ..ApiError::default()
        }));
    }
    let tokens = match result {
        Ok(tokens) => tokens,
        Err(RequestTokenError::ServerResponse(error)) => {
            let code = error.error().to_string();
            if (400..500).contains(&status)
                && matches!(
                    code.as_str(),
                    "invalid_grant"
                        | "invalid_refresh_token"
                        | "token_expired"
                        | "refresh_token_expired"
                        | "refresh_token_invalidated"
                        | "refresh_token_reused"
                )
            {
                session.clear_tokens();
                return Ok(session);
            }
            let message = if code == "invalid_client" {
                "ChatGPT client registration was rejected; check the integration configuration"
            } else {
                "ChatGPT session renewal was rejected; saved credentials were retained"
            };
            return Err(Error::Api(ApiError {
                status: Some(status),
                code: Some(code),
                message: Some(message.into()),
                ..ApiError::default()
            }));
        }
        Err(_) => {
            return Err(Error::Protocol(
                "ChatGPT session renewal could not complete; try again later",
            ));
        }
    };
    if tokens.token_type() != &CoreTokenType::Bearer {
        return Err(Error::Auth("ChatGPT returned an unsupported token type"));
    }
    if tokens.id_token().is_some() {
        let expected = Nonce::new(session.nonce.clone());
        let identity = verify::identity(&tokens, client, |nonce: Option<&Nonce>| {
            if nonce.is_none() {
                Ok(())
            } else {
                (&expected).verify(nonce)
            }
        })?;
        if identity.subject != session.subject {
            return Err(Error::Auth("ChatGPT renewal returned a different account"));
        }
        session.id_token = identity.id_token;
        // An omitted profile field does not erase verified account information.
        if identity.email.is_some() {
            session.email = identity.email;
        }
        if identity.name.is_some() {
            session.name = identity.name;
        }
        if identity.picture.is_some() {
            session.picture = identity.picture;
        }
    }
    apply_tokens(&mut session, &tokens)?;
    Ok(session)
}

fn apply_tokens(session: &mut Session, tokens: &CoreTokenResponse) -> Result<(), Error> {
    session.expires_at = expiry(tokens)?;
    session.access_token = tokens.access_token().secret().clone();
    if let Some(refresh) = tokens.refresh_token() {
        session.refresh_token = refresh.secret().clone();
    }
    if let Some(scopes) = tokens.scopes() {
        session.scopes = scopes.iter().map(|scope| scope.as_str().into()).collect();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registration() -> Session {
        Session {
            client_id: "issued-client".into(),
            issuer: super::super::ISSUER.into(),
            subject: "test-subject".into(),
            email: Some("test@example.invalid".into()),
            name: Some("Example User".into()),
            picture: Some("https://example.invalid/avatar.png".into()),
            host_id: "test-host".into(),
            id_token: "previous-id-token".into(),
            nonce: "test-nonce".into(),
            access_token: "old-access".into(),
            refresh_token: "old-refresh".into(),
            expires_at: 0,
            scopes: vec!["chatgpt.tokens.use.direct".into()],
        }
    }

    fn client() -> Result<provider::Client, Box<dyn std::error::Error>> {
        let metadata = serde_json::from_value(serde_json::json!({
            "issuer": super::super::ISSUER,
            "authorization_endpoint": "https://auth.openai.com/authorize",
            "jwks_uri": "https://auth.openai.com/jwks",
            "response_types_supported": ["code"],
            "subject_types_supported": ["public"],
            "id_token_signing_alg_values_supported": ["RS256"]
        }))?;
        Ok(provider::client(metadata, "issued-client".into())?)
    }

    #[tokio::test]
    async fn terminal_refresh_codes_clear_tokens_but_keep_the_registration()
    -> Result<(), Box<dyn std::error::Error>> {
        let client = client()?;
        for code in [
            "invalid_grant",
            "invalid_refresh_token",
            "token_expired",
            "refresh_token_expired",
            "refresh_token_invalidated",
            "refresh_token_reused",
        ] {
            let http = |request: openidconnect::HttpRequest| {
                let body = String::from_utf8_lossy(request.body());
                assert!(body.contains("client_id=issued-client"));
                assert!(body.contains("grant_type=refresh_token"));
                std::future::ready(
                    openidconnect::http::Response::builder()
                        .status(400)
                        .header("content-type", "application/json")
                        .body(serde_json::json!({"error":code}).to_string().into_bytes()),
                )
            };
            let session = renew_with_client(&client, http, registration()).await?;
            assert!(session.access_token.is_empty());
            assert!(session.refresh_token.is_empty());
            assert!(session.id_token.is_empty());
            assert!(session.nonce.is_empty());
            assert!(session.scopes.is_empty());
            assert_eq!(session.client_id, "issued-client");
            assert_eq!(session.subject, "test-subject");
            assert_eq!(session.email.as_deref(), Some("test@example.invalid"));
            assert_eq!(session.expires_at, 0);
        }
        Ok(())
    }

    #[tokio::test]
    async fn refresh_transport_and_client_failures_never_return_a_cleared_record()
    -> Result<(), Box<dyn std::error::Error>> {
        let client = client()?;
        for (status, body) in [
            (503, r#"{"error":"invalid_grant"}"#),
            (400, r#"{"error":"invalid_client"}"#),
            (400, r#"{"error":"temporarily_unavailable"}"#),
            (200, "invalid json"),
        ] {
            let http = |_request| {
                std::future::ready(
                    openidconnect::http::Response::builder()
                        .status(status)
                        .header("content-type", "application/json")
                        .body(body.as_bytes().to_vec()),
                )
            };
            let result = renew_with_client(&client, http, registration()).await;
            assert!(
                result.is_err(),
                "unexpected saved record for status {status}"
            );
            if status == 503 {
                assert!(matches!(
                    result,
                    Err(Error::Api(ApiError {
                        status: Some(503),
                        ..
                    }))
                ));
            }
        }
        let offline = |_request| {
            std::future::ready(Err::<openidconnect::HttpResponse, _>(std::io::Error::new(
                std::io::ErrorKind::ConnectionReset,
                "synthetic network failure",
            )))
        };
        assert!(
            renew_with_client(&client, offline, registration())
                .await
                .is_err()
        );
        Ok(())
    }

    #[tokio::test]
    async fn oauth_refresh_exchange_rotates_tokens_without_changing_the_account()
    -> Result<(), Box<dyn std::error::Error>> {
        let client = client()?;
        let http = |_request| {
            std::future::ready(
                openidconnect::http::Response::builder()
                    .status(200)
                    .header("content-type", "application/json")
                    .body(br#"{"access_token":"new-access","refresh_token":"new-refresh","token_type":"Bearer","expires_in":3600}"#.to_vec()),
            )
        };
        let session = renew_with_client(&client, http, registration()).await?;
        assert_eq!(session.access_token, "new-access");
        assert_eq!(session.refresh_token, "new-refresh");
        assert_eq!(session.subject, "test-subject");
        assert_eq!(session.client_id, "issued-client");
        assert!(session.expires_at > now()?);
        Ok(())
    }

    #[test]
    fn rotation_retains_identity_and_omitted_grant_fields() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut session = registration();
        let replacement: CoreTokenResponse = serde_json::from_str(
            r#"{"access_token":"new-access","refresh_token":"new-refresh","token_type":"Bearer","expires_in":3600}"#,
        )?;
        apply_tokens(&mut session, &replacement)?;
        assert_eq!(session.access_token, "new-access");
        assert_eq!(session.refresh_token, "new-refresh");
        assert_eq!(session.subject, "test-subject");
        assert_eq!(session.id_token, "previous-id-token");
        assert_eq!(session.email.as_deref(), Some("test@example.invalid"));
        assert_eq!(session.scopes, vec!["chatgpt.tokens.use.direct"]);
        let no_rotation: CoreTokenResponse = serde_json::from_str(
            r#"{"access_token":"next-access","token_type":"Bearer","expires_in":3600}"#,
        )?;
        apply_tokens(&mut session, &no_rotation)?;
        assert_eq!(session.refresh_token, "new-refresh");
        Ok(())
    }
}
