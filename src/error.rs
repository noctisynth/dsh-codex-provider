use serde::Serialize;
use serde_json::{Value, json};

/// Public provider diagnostics only; never retain the full response body.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiError {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub param: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

impl ApiError {
    pub(crate) fn from_value(value: &Value) -> Self {
        fn field(value: &Value, key: &str) -> Option<String> {
            value[key]
                .as_str()
                .filter(|text| !text.trim().is_empty())
                .map(str::to_owned)
        }
        Self {
            code: field(value, "code"),
            param: field(value, "param"),
            message: field(value, "message"),
            ..Self::default()
        }
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(status) = self.status {
            write!(formatter, "OpenAI returned HTTP {status}")?;
        } else {
            formatter.write_str("OpenAI response failed")?;
        }
        if let Some(message) = self.message.as_ref().or(self.code.as_ref()) {
            write!(formatter, ": {message}")?;
        }
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("OpenAI network request failed")]
    Network(#[source] reqwest::Error),
    #[error("{0}")]
    Api(ApiError),
    #[error("Invalid OpenAI model catalog")]
    Catalog(#[source] serde_json::Error),
    #[error("{0}")]
    Auth(&'static str),
    #[error("OAuth callback listener failed")]
    Listener(#[source] std::io::Error),
    #[error("{0}")]
    Protocol(&'static str),
    #[error("OpenAI response was incomplete: {0}")]
    Incomplete(String),
    #[error("OpenAI stream ended before response.completed")]
    Interrupted,
    #[error("OpenAI request cancelled")]
    Cancelled,
}

impl Error {
    /// The existing object stream carries a terminal error without losing provider facts in N-API.
    pub(crate) fn stream_event(&self) -> Value {
        let kind = match self {
            Self::Api(_) => "api",
            Self::Auth(_) => "auth",
            Self::Network(error) if error.is_timeout() => "timeout",
            Self::Network(_) | Self::Interrupted => "transport",
            Self::Cancelled => "cancelled",
            _ => "protocol",
        };
        let mut detail = match self {
            Self::Api(error) => json!(error),
            _ => json!({}),
        };
        detail["kind"] = kind.into();
        detail["message"] = self.to_string().into();
        json!({"type":"provider-error", "error":detail})
    }
}

impl From<eventsource_stream::EventStreamError<reqwest::Error>> for Error {
    fn from(error: eventsource_stream::EventStreamError<reqwest::Error>) -> Self {
        match error {
            eventsource_stream::EventStreamError::Transport(error) => Self::Network(error),
            _ => Self::Protocol("Invalid or interrupted OpenAI event stream"),
        }
    }
}

impl From<Error> for napi::Error {
    fn from(error: Error) -> Self {
        Self::from_reason(error.to_string())
    }
}
