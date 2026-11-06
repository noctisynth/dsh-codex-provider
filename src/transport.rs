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
            return Err(response_error(response).await);
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
            return Err(response_error(response).await);
        }
        let bytes = response.bytes().await.map_err(Error::Network)?;
        models::parse_catalog(&bytes)
    }
}

#[derive(serde::Deserialize)]
struct ApiErrorResponse {
    error: ApiErrorDetail,
}

#[derive(serde::Deserialize)]
struct ApiErrorDetail {
    message: String,
}

async fn response_error(response: reqwest::Response) -> Error {
    let status = response.status().as_u16();
    match response.bytes().await {
        Ok(body) => parse_api_error(status, &body),
        Err(_) => Error::Http(status),
    }
}

fn parse_api_error(status: u16, body: &[u8]) -> Error {
    match serde_json::from_slice::<ApiErrorResponse>(body) {
        Ok(response) if !response.error.message.trim().is_empty() => Error::Api {
            status,
            message: response.error.message,
        },
        _ => Error::Http(status),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_api_error;

    #[test]
    fn http_error_explains_rejected_parameter_without_dumping_response() {
        let error = parse_api_error(
            400,
            br#"{"error":{"message":"Invalid reasoning.effort: ultra","type":"invalid_request_error","code":"invalid_value","param":"reasoning.effort"},"extra":"not for display"}"#,
        );
        assert_eq!(
            error.to_string(),
            "OpenAI returned HTTP 400: Invalid reasoning.effort: ultra"
        );
    }

    #[test]
    fn nonstandard_error_bodies_keep_http_status() {
        for body in [
            b"<html>Service unavailable</html>".as_slice(),
            br#"{"error":"Service unavailable"}"#,
            br#"{"error":{"message":" "}}"#,
        ] {
            assert_eq!(
                parse_api_error(503, body).to_string(),
                "OpenAI returned HTTP 503"
            );
        }
    }
}
