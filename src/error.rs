#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("OpenAI network request failed")]
    Network(#[source] reqwest::Error),
    #[error("OpenAI returned HTTP {0}")]
    Http(u16),
    #[error("Invalid OpenAI model catalog")]
    Catalog(#[source] serde_json::Error),
}

impl From<Error> for napi::Error {
    fn from(error: Error) -> Self {
        Self::from_reason(error.to_string())
    }
}
