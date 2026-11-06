use openidconnect::{
    AccessTokenHash, NonceVerifier, OAuth2TokenResponse, TokenResponse, core::CoreTokenResponse,
};

use super::provider;
use crate::error::Error;

pub(crate) struct Identity {
    pub issuer: String,
    pub subject: String,
    pub email: Option<String>,
    pub id_token: String,
}

pub(crate) fn identity(
    tokens: &CoreTokenResponse,
    client: &provider::Client,
    nonce: impl NonceVerifier,
) -> Result<Identity, Error> {
    let id_token = tokens
        .id_token()
        .ok_or(Error::Auth("ChatGPT returned no ID token"))?;
    let verifier = client.id_token_verifier();
    let claims = id_token
        .claims(&verifier, nonce)
        .map_err(|_| Error::Auth("ChatGPT ID token validation failed"))?;
    if let Some(expected) = claims.access_token_hash() {
        let actual = AccessTokenHash::from_token(
            tokens.access_token(),
            id_token
                .signing_alg()
                .map_err(|_| Error::Auth("Unsupported ChatGPT token signing algorithm"))?,
            id_token
                .signing_key(&verifier)
                .map_err(|_| Error::Auth("ChatGPT token signing key is unavailable"))?,
        )
        .map_err(|_| Error::Auth("ChatGPT access token hash validation failed"))?;
        if actual != *expected {
            return Err(Error::Auth("ChatGPT access token hash did not match"));
        }
    }
    Ok(Identity {
        issuer: claims.issuer().as_str().into(),
        subject: claims.subject().as_str().into(),
        email: claims.email().map(|email| email.as_str().into()),
        id_token: id_token.to_string(),
    })
}
