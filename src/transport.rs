use crate::{
    error::Error,
    models::{self, Model},
};

#[derive(Clone)]
pub(crate) struct Transport {
    client: reqwest::Client,
}

impl Transport {
    pub(crate) fn client(&self) -> &reqwest::Client {
        &self.client
    }

    pub async fn response(
        &self,
        access_token: &str,
        request: &crate::responses::Request,
    ) -> Result<reqwest::Response, Error> {
        let response = self
            .client
            .post("https://api.openai.com/v1/responses")
            .bearer_auth(access_token)
            .json(&crate::responses::StreamingRequest {
                request,
                store: false,
                stream: true,
            })
            .send()
            .await
            .map_err(Error::Network)?;
        if !response.status().is_success() {
            return Err(Error::Http(response.status().as_u16()));
        }
        Ok(response)
    }

    pub fn new(headers: std::collections::HashMap<String, String>) -> Result<Self, Error> {
        let mut default_headers = reqwest::header::HeaderMap::new();
        for (name, value) in headers {
            default_headers.insert(
                reqwest::header::HeaderName::from_bytes(name.as_bytes())
                    .map_err(|_| Error::Protocol("Invalid DSH attribution header name"))?,
                reqwest::header::HeaderValue::from_str(&value)
                    .map_err(|_| Error::Protocol("Invalid DSH attribution header value"))?,
            );
        }
        let client = reqwest::Client::builder()
            .default_headers(default_headers)
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
