use std::sync::Mutex;

use napi_derive::napi;
use tokio_util::sync::CancellationToken;

use crate::{auth, error::Error, models, transport::Transport};

/// Connect a DSH AbortSignal or plugin disposal to this backend operation.
#[napi]
#[derive(Default)]
pub struct Cancellation {
    token: CancellationToken,
}

#[napi]
impl Cancellation {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    #[napi]
    pub fn cancel(&self) {
        self.token.cancel();
    }
}

#[napi(object)]
pub struct AccountInfo {
    pub client_id: String,
    pub subject: String,
    pub email: Option<String>,
    pub plan_usage_authorized: bool,
}

#[napi(object)]
pub struct LoginResult {
    /// Opaque backend credential payload for the DSH credential service.
    pub record: String,
    /// Safe account facts for the account picker.
    pub account: AccountInfo,
}

#[napi]
pub struct LoginAttempt {
    url: String,
    pending: Mutex<Option<auth::PendingLogin>>,
    cancel: CancellationToken,
}

impl Drop for LoginAttempt {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}

#[napi]
impl LoginAttempt {
    /// Open with the system browser; do not log URLs containing an ID token hint.
    #[napi(getter)]
    pub fn authorization_url(&self) -> String {
        self.url.clone()
    }

    #[napi]
    pub fn cancel(&self) {
        self.cancel.cancel();
    }

    #[napi]
    pub async fn complete(&self) -> napi::Result<LoginResult> {
        let pending = self
            .pending
            .lock()
            .map_err(|_| Error::Auth("ChatGPT sign-in attempt is unavailable"))?
            .take()
            .ok_or(Error::Auth("ChatGPT sign-in attempt was already consumed"))?;
        let session = pending.complete().await?;
        Ok(LoginResult {
            record: session.encode()?,
            account: AccountInfo {
                plan_usage_authorized: session
                    .scopes
                    .iter()
                    .any(|scope| scope == "chatgpt.tokens.use.direct"),
                client_id: session.client_id,
                subject: session.subject,
                email: session.email,
            },
        })
    }
}

/// Persist once per host before starting its first authorization attempt.
#[napi]
pub fn create_host_id() -> String {
    uuid::Uuid::new_v4().urn().to_string()
}

#[napi(object)]
pub struct Model {
    pub id: String,
    pub name: String,
}

impl From<models::Model> for Model {
    fn from(value: models::Model) -> Self {
        Self {
            id: value.id,
            name: value.name,
        }
    }
}

#[napi]
pub struct ChatGptClient {
    transport: Transport,
}

#[napi]
impl ChatGptClient {
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        Ok(Self {
            transport: Transport::new()?,
        })
    }

    /// Pass only the selected account's saved record for reauthorization.
    #[napi]
    pub async fn begin_login(
        &self,
        host_id: String,
        previous_record: Option<String>,
        cancellation: &Cancellation,
    ) -> napi::Result<LoginAttempt> {
        let previous = previous_record
            .as_deref()
            .map(auth::Session::decode)
            .transpose()?;
        let cancel = cancellation.token.child_token();
        let pending = auth::begin_login(
            self.transport.client().clone(),
            host_id,
            previous,
            cancel.clone(),
        )
        .await?;
        Ok(LoginAttempt {
            url: pending.url.clone(),
            pending: Mutex::new(Some(pending)),
            cancel,
        })
    }

    /// Backend-only interface. Tokens must never be forwarded to browser UI.
    #[napi]
    pub async fn list_models(&self, access_token: String) -> napi::Result<Vec<Model>> {
        Ok(self
            .transport
            .models(&access_token)
            .await?
            .into_iter()
            .map(Model::from)
            .collect())
    }
}
