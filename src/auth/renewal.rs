use std::time::{SystemTime, UNIX_EPOCH};

use openidconnect::{
    Nonce, NonceVerifier, OAuth2TokenResponse, RefreshToken, TokenResponse,
    core::{CoreTokenResponse, CoreTokenType},
};

use super::{Session, provider, verify};
use crate::error::Error;

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
pub(crate) async fn renew(http: &reqwest::Client, mut session: Session) -> Result<Session, Error> {
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
    let tokens = client
        .exchange_refresh_token(&RefreshToken::new(session.refresh_token.clone()))
        .add_extra_param("resource", super::RESOURCE)
        .request_async(http)
        .await
        .map_err(|_| Error::Auth("ChatGPT session renewal failed; continue with ChatGPT"))?;
    if tokens.token_type() != &CoreTokenType::Bearer {
        return Err(Error::Auth("ChatGPT returned an unsupported token type"));
    }
    if tokens.id_token().is_some() {
        let expected = Nonce::new(session.nonce.clone());
        let identity = verify::identity(&tokens, &client, |nonce: Option<&Nonce>| {
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

    #[test]
    fn rotation_retains_identity_and_omitted_grant_fields() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut session = Session {
            client_id: "issued-client".into(),
            issuer: super::super::ISSUER.into(),
            subject: "test-subject".into(),
            email: Some("test@example.invalid".into()),
            host_id: "test-host".into(),
            id_token: "previous-id-token".into(),
            nonce: "test-nonce".into(),
            access_token: "old-access".into(),
            refresh_token: "old-refresh".into(),
            expires_at: 0,
            scopes: vec!["chatgpt.tokens.use.direct".into()],
        };
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
