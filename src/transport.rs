use crate::{
    auth::{LoginMethod, Session},
    error::{ApiError, Error},
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
        session: &Session,
        request: &crate::responses::Request,
    ) -> Result<reqwest::Response, Error> {
        let mut body = serde_json::to_value(crate::responses::StreamingRequest {
            request,
            store: false,
            stream: true,
        })
        .map_err(|_| Error::Protocol("Invalid Responses request"))?;
        if session.login_method != LoginMethod::Siwc && body.get("instructions").is_none() {
            body["instructions"] = "".into();
        }
        let response = self
            .authorized(
                session,
                self.client.post(match session.login_method {
                    LoginMethod::Siwc => "https://api.openai.com/v1/responses",
                    _ => "https://chatgpt.com/backend-api/codex/responses",
                }),
            )?
            .json(&body)
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

    fn authorized(
        &self,
        session: &Session,
        request: reqwest::RequestBuilder,
    ) -> Result<reqwest::RequestBuilder, Error> {
        let request = request.bearer_auth(&session.access_token);
        if session.login_method == LoginMethod::Siwc {
            return Ok(request);
        }
        Ok(request
            .header(
                "chatgpt-account-id",
                session
                    .account_id
                    .as_deref()
                    .ok_or(Error::Auth("Codex workspace account is missing"))?,
            )
            .header("originator", "dsh-codex-provider")
            .header("OpenAI-Beta", "responses=experimental"))
    }

    pub async fn models(&self, session: &Session) -> Result<Vec<Model>, Error> {
        let request = match session.login_method {
            LoginMethod::Siwc => self.client.get("https://api.openai.com/v1/models"),
            _ => self
                .client
                .get("https://chatgpt.com/backend-api/codex/models")
                // Catalog compatibility uses the Codex version, not this crate's version.
                .query(&[("client_version", "0.167.0")]),
        };
        let response = self
            .authorized(session, request)?
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

async fn response_error(response: reqwest::Response) -> Error {
    let status = response.status().as_u16();
    let request_id = response
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    match response.bytes().await {
        Ok(body) => parse_api_error(status, &body, request_id),
        Err(_) => Error::Api(ApiError {
            status: Some(status),
            request_id,
            ..ApiError::default()
        }),
    }
}

fn parse_api_error(status: u16, body: &[u8], request_id: Option<String>) -> Error {
    let mut detail = ApiError {
        status: Some(status),
        request_id,
        ..ApiError::default()
    };
    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(body) {
        let parsed = ApiError::from_value(&value["error"]);
        detail.code = parsed.code;
        detail.param = parsed.param;
        detail.message = parsed.message.or_else(|| {
            value["detail"]
                .as_str()
                .filter(|message| !message.trim().is_empty())
                .map(str::to_owned)
        });
    }
    Error::Api(detail)
}

#[cfg(test)]
mod tests {
    use super::parse_api_error;

    #[test]
    fn http_error_explains_rejected_parameter_without_dumping_response() {
        let error = parse_api_error(
            400,
            br#"{"error":{"message":"Invalid reasoning.effort: ultra","type":"invalid_request_error","code":"invalid_value","param":"reasoning.effort"},"extra":"not for display"}"#,
            Some("req-test".into()),
        );
        assert_eq!(
            error.to_string(),
            "OpenAI returned HTTP 400: Invalid reasoning.effort: ultra"
        );
        let event = error.stream_event();
        assert_eq!(event["error"]["status"], 400);
        assert_eq!(event["error"]["code"], "invalid_value");
        assert_eq!(event["error"]["param"], "reasoning.effort");
        assert_eq!(event["error"]["requestId"], "req-test");
        assert!(event["error"].get("extra").is_none());
    }

    #[test]
    fn direct_admission_detail_is_preserved_without_inventing_a_code() {
        let error = parse_api_error(
            400,
            br#"{"detail":"Unsupported service_tier: fast","extra":"private"}"#,
            None,
        );
        assert_eq!(
            error.to_string(),
            "OpenAI returned HTTP 400: Unsupported service_tier: fast"
        );
        assert!(error.stream_event()["error"].get("code").is_none());
    }

    #[test]
    fn nonstandard_error_bodies_keep_http_status() {
        for body in [
            b"<html>Service unavailable</html>".as_slice(),
            br#"{"error":"Service unavailable"}"#,
            br#"{"error":{"message":" "}}"#,
        ] {
            assert_eq!(
                parse_api_error(503, body, None).to_string(),
                "OpenAI returned HTTP 503"
            );
        }
    }
}
