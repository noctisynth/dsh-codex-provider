use openidconnect::{
    AuthType, AuthUrl, ClientId, EndpointMaybeSet, EndpointNotSet, EndpointSet, IssuerUrl,
    TokenUrl,
    core::{CoreClient, CoreProviderMetadata},
};

use crate::error::Error;
use openidconnect::OAuth2TokenResponse;
use openidconnect::core::CoreTokenResponse;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) type Client = CoreClient<
    EndpointSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointSet,
    EndpointMaybeSet,
>;

pub(crate) async fn discover(http: &reqwest::Client) -> Result<CoreProviderMetadata, Error> {
    let issuer = IssuerUrl::new(super::ISSUER.into())
        .map_err(|_| Error::Auth("Invalid OpenAI issuer URL"))?;
    CoreProviderMetadata::discover_async(issuer, http)
        .await
        .map_err(|_| Error::Auth("OpenAI identity discovery failed"))
}

pub(crate) fn client(metadata: CoreProviderMetadata, client_id: String) -> Result<Client, Error> {
    Ok(
        CoreClient::from_provider_metadata(metadata, ClientId::new(client_id), None)
            .set_auth_type(AuthType::RequestBody)
            .set_auth_uri(
                AuthUrl::new("https://auth.openai.com/api/accounts/authorize".into())
                    .map_err(|_| Error::Auth("Invalid OpenAI authorization URL"))?,
            )
            .set_token_uri(
                TokenUrl::new("https://auth.openai.com/api/accounts/oauth/token".into())
                    .map_err(|_| Error::Auth("Invalid OpenAI token URL"))?,
            ),
    )
}

pub(crate) fn legacy_client(metadata: CoreProviderMetadata) -> Result<Client, Error> {
    Ok(client(metadata, super::legacy::CLIENT_ID.into())?
        .set_auth_uri(
            AuthUrl::new("https://auth.openai.com/oauth/authorize".into())
                .map_err(|_| Error::Auth("Invalid Codex authorization URL"))?,
        )
        .set_token_uri(
            TokenUrl::new("https://auth.openai.com/oauth/token".into())
                .map_err(|_| Error::Auth("Invalid Codex token URL"))?,
        ))
}

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
