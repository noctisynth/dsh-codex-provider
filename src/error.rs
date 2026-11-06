#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("OpenAI network request failed")]
    Network(#[source] reqwest::Error),
    #[error("OpenAI returned HTTP {0}")]
    Http(u16),
    #[error("OpenAI returned HTTP {status}: {message}")]
    Api { status: u16, message: String },
    #[error("Invalid OpenAI model catalog")]
    Catalog(#[source] serde_json::Error),
    #[error("{0}")]
    Auth(&'static str),
    #[error("OAuth callback listener failed")]
    Listener(#[source] std::io::Error),
    #[error("{0}")]
    Protocol(&'static str),
    #[error("OpenAI response failed: {0}")]
    ResponseFailed(String),
    #[error("OpenAI response was incomplete: {0}")]
    Incomplete(String),
    #[error("OpenAI stream ended before response.completed")]
    Interrupted,
    #[error("OpenAI request cancelled")]
    Cancelled,
}

impl From<Error> for napi::Error {
    fn from(error: Error) -> Self {
        Self::from_reason(error.to_string())
    }
}
