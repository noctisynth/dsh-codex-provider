use openidconnect::{
    AuthType, AuthUrl, ClientId, EndpointMaybeSet, EndpointNotSet, EndpointSet, IssuerUrl,
    TokenUrl,
    core::{CoreClient, CoreProviderMetadata},
};

use crate::error::Error;

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
