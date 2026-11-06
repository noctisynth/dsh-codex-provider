use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use openidconnect::{
    Nonce, OAuth2TokenResponse, TokenResponse,
    core::{CoreTokenResponse, CoreTokenType},
};
use serde_json::{Value, json};

use crate::{
    auth::{LoginMethod, Session, provider, verify},
    error::{ApiError, Error},
};

const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";

pub(super) async fn exchange(
    http: &reqwest::Client,
    code: &str,
    verifier: &str,
    redirect: &str,
    method: LoginMethod,
    previous: Option<&Session>,
) -> Result<Session, Error> {
    let response = http
        .post(TOKEN_URL)
        .json(&json!({
            "grant_type": "authorization_code", "client_id": super::CLIENT_ID,
            "code": code, "code_verifier": verifier, "redirect_uri": redirect,
        }))
        .send()
        .await
        .map_err(Error::Network)?;
    if !response.status().is_success() {
        return Err(Error::Auth(
            "Codex code exchange failed; start a new sign-in",
        ));
    }
    let tokens: CoreTokenResponse = response
        .json()
        .await
        .map_err(|_| Error::Auth("Invalid Codex token response"))?;
    let client = provider::legacy_client(provider::discover(http).await?)?;
    let identity = verify::identity(&tokens, &client, |_: Option<&Nonce>| Ok(()))?;
    // Identity claims are read only after OpenID Connect signature, issuer, audience and expiry validation.
    let account_id = account_id(&identity.id_token)?;
    if previous.is_some_and(|session| {
        session.subject != identity.subject
            || session.account_id.as_deref() != Some(account_id.as_str())
    }) {
        return Err(Error::Auth(
            "Codex sign-in returned a different account or workspace",
        ));
    }
    let mut session = Session {
        login_method: method,
        account_id: Some(account_id),
        client_id: super::CLIENT_ID.into(),
        issuer: identity.issuer,
        subject: identity.subject,
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
        id_token: identity.id_token,
        host_id: String::new(),
        nonce: String::new(),
        access_token: String::new(),
        refresh_token: String::new(),
        expires_at: 0,
        scopes: Vec::new(),
    };
    update(&mut session, &tokens)?;
    if session.refresh_token.is_empty() {
        return Err(Error::Auth("Codex returned no refresh token"));
    }
    Ok(session)
}

fn account_id(id_token: &str) -> Result<String, Error> {
    let payload = id_token
        .split('.')
        .nth(1)
        .ok_or(Error::Auth("Invalid Codex identity token"))?;
    let bytes = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| Error::Auth("Invalid Codex identity claims"))?;
    let claims: Value =
        serde_json::from_slice(&bytes).map_err(|_| Error::Auth("Invalid Codex identity claims"))?;
    claims["https://api.openai.com/auth"]["chatgpt_account_id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .ok_or(Error::Auth(
            "Codex identity did not contain a workspace account",
        ))
}

pub(crate) async fn renew(http: &reqwest::Client, session: Session) -> Result<Session, Error> {
    renew_at(http, session, TOKEN_URL).await
}

async fn renew_at(
    http: &reqwest::Client,
    mut session: Session,
    endpoint: &str,
) -> Result<Session, Error> {
    if session.refresh_token.is_empty() {
        return Err(Error::Auth("Codex account is signed out"));
    }
    if session.expires_at.saturating_sub(provider::now()?) > 60 {
        return Ok(session);
    }
    let response = http.post(endpoint).json(&json!({
        "grant_type": "refresh_token", "refresh_token": session.refresh_token, "client_id": super::CLIENT_ID,
    })).send().await.map_err(Error::Network)?;
    let status = response.status();
    if !status.is_success() {
        let body = response.json::<Value>().await.unwrap_or_default();
        let code = body["error"]["code"]
            .as_str()
            .or_else(|| body["error"].as_str());
        if status.is_client_error()
            && code.is_some_and(|code| {
                matches!(
                    code,
                    "invalid_grant"
                        | "invalid_refresh_token"
                        | "token_expired"
                        | "refresh_token_expired"
                        | "refresh_token_invalidated"
                        | "refresh_token_reused"
                )
            })
        {
            session.clear_tokens();
            return Ok(session);
        }
        return Err(Error::Api(ApiError {
            status: Some(status.as_u16()),
            code: code.map(str::to_owned),
            message: Some("Codex session renewal failed; saved credentials were retained".into()),
            ..ApiError::default()
        }));
    }
    let tokens: CoreTokenResponse = response
        .json()
        .await
        .map_err(|_| Error::Auth("Invalid Codex refresh response"))?;
    if tokens.id_token().is_some() {
        let client = provider::legacy_client(provider::discover(http).await?)?;
        let identity = verify::identity(&tokens, &client, |_: Option<&Nonce>| Ok(()))?;
        if identity.subject != session.subject
            || Some(account_id(&identity.id_token)?) != session.account_id
        {
            return Err(Error::Auth(
                "Codex renewal returned a different account or workspace",
            ));
        }
        session.id_token = identity.id_token;
        if identity.name.is_some() {
            session.name = identity.name;
        }
        if identity.email.is_some() {
            session.email = identity.email;
        }
        if identity.picture.is_some() {
            session.picture = identity.picture;
        }
    }
    update(&mut session, &tokens)?;
    Ok(session)
}

fn update(session: &mut Session, tokens: &CoreTokenResponse) -> Result<(), Error> {
    if tokens.token_type() != &CoreTokenType::Bearer {
        return Err(Error::Auth("Unsupported Codex token type"));
    }
    session.expires_at = provider::expiry(tokens)?;
    session.access_token = tokens.access_token().secret().clone();
    if let Some(refresh) = tokens.refresh_token() {
        session.refresh_token = refresh.secret().clone();
    }
    if let Some(scopes) = tokens.scopes() {
        session.scopes = scopes.iter().map(|s| s.as_str().to_owned()).collect();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, routing::post};

    #[tokio::test]
    async fn refresh_rotates_legacy_tokens_and_clears_only_terminal_failures()
    -> Result<(), Box<dyn std::error::Error>> {
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
        let url = format!("http://{}", listener.local_addr()?);
        let app = Router::new().route("/success", post(|body: String| async move {
                let body: Value = serde_json::from_str(&body).unwrap_or_default();
            assert_eq!(body["client_id"], super::super::CLIENT_ID);
            assert_eq!(body["grant_type"], "refresh_token");
            assert_eq!(body["refresh_token"], "old-refresh");
            ([("content-type", "application/json")], json!({"token_type":"Bearer", "access_token":"new-access", "refresh_token":"new-refresh", "expires_in":3600}).to_string())
        })).route("/expired", post(|| async {
            (axum::http::StatusCode::BAD_REQUEST, ([("content-type", "application/json")], json!({"error":"invalid_grant"}).to_string()))
        })).route("/unavailable", post(|| async {
            (axum::http::StatusCode::SERVICE_UNAVAILABLE, ([("content-type", "application/json")], json!({"error":"invalid_grant"}).to_string()))
        }));
        let server = tokio::spawn(async move { axum::serve(listener, app).await });
        let original = Session::decode(&json!({
            "login_method":"codex-device", "account_id":"workspace", "client_id":super::super::CLIENT_ID,
            "issuer":crate::auth::ISSUER, "subject":"subject", "email":null,
            "host_id":"", "id_token":"old-id", "nonce":"", "access_token":"old-access",
            "refresh_token":"old-refresh", "expires_at":0, "scopes":[]
        }).to_string())?;
        let http = reqwest::Client::builder().no_proxy().build()?;
        let renewed = renew_at(&http, original.clone(), &format!("{url}/success")).await?;
        assert_eq!(renewed.key(), original.key());
        assert_eq!(renewed.refresh_token, "new-refresh");
        assert_eq!(renewed.access_token, "new-access");
        let expired = renew_at(&http, original.clone(), &format!("{url}/expired")).await?;
        assert_eq!(expired.key(), original.key());
        assert!(expired.access_token.is_empty());
        assert!(expired.refresh_token.is_empty());
        assert!(
            renew_at(&http, original, &format!("{url}/unavailable"))
                .await
                .is_err()
        );
        server.abort();
        Ok(())
    }
}
