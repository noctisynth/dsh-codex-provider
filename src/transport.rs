use crate::{
    error::Error,
    models::{self, Model},
};

pub(crate) struct Transport {
    client: reqwest::Client,
}

impl Transport {
    pub fn new() -> Result<Self, Error> {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(Error::Network)?;
        Ok(Self { client })
    }

    pub async fn models(&self, access_token: &str) -> Result<Vec<Model>, Error> {
        let response = self
            .client
            .get("https://api.openai.com/v1/models")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(Error::Network)?;
        if !response.status().is_success() {
            return Err(Error::Http(response.status().as_u16()));
        }
        let bytes = response.bytes().await.map_err(Error::Network)?;
        models::parse_catalog(&bytes)
    }
}
