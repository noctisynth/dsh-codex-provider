use std::sync::Mutex;

use napi_derive::napi;
use tokio_util::sync::CancellationToken;

use crate::{auth, error::Error, models, responses, transport::Transport};
use futures_util::StreamExt;
use napi::{Env, bindgen_prelude::ReadableStream};

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
    pub has_credentials: bool,
}

impl From<&auth::Session> for AccountInfo {
    fn from(session: &auth::Session) -> Self {
        Self {
            client_id: session.client_id.clone(),
            subject: session.subject.clone(),
            email: session.email.clone(),
            plan_usage_authorized: session
                .scopes
                .iter()
                .any(|scope| scope == "chatgpt.tokens.use.direct"),
            has_credentials: !session.access_token.is_empty() && !session.refresh_token.is_empty(),
        }
    }
}

#[napi(object)]
pub struct LoginResult {
    /// Opaque backend credential payload for the DSH credential service.
    pub record: String,
    /// Safe account facts for the account picker.
    pub account: AccountInfo,
}

impl TryFrom<auth::Session> for LoginResult {
    type Error = Error;

    fn try_from(session: auth::Session) -> Result<Self, Self::Error> {
        Ok(Self {
            record: session.encode()?,
            account: (&session).into(),
        })
    }
}

#[napi(object)]
pub struct LogoutResult {
    pub record: String,
    pub revocation_confirmed: bool,
}

#[napi]
pub struct LoginAttempt {
    url: Mutex<String>,
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
    #[napi(getter)]
    pub fn can_retry(&self) -> napi::Result<bool> {
        Ok(self
            .pending
            .lock()
            .map_err(|_| Error::Auth("ChatGPT sign-in attempt is unavailable"))?
            .as_ref()
            .is_some_and(auth::PendingLogin::can_retry))
    }

    /// Open with the system browser; do not log URLs containing an ID token hint.
    #[napi(getter)]
    pub fn authorization_url(&self) -> napi::Result<String> {
        Ok(self
            .url
            .lock()
            .map_err(|_| Error::Auth("ChatGPT sign-in attempt is unavailable"))?
            .clone())
    }

    #[napi]
    pub fn cancel(&self) {
        self.cancel.cancel();
    }

    #[napi]
    pub async fn complete(&self) -> napi::Result<LoginResult> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| Error::Auth("ChatGPT sign-in attempt is unavailable"))?
            .take()
            .ok_or(Error::Auth("ChatGPT sign-in attempt was already consumed"))?;
        match pending.complete().await {
            Ok(session) => Ok(LoginResult::try_from(session)?),
            Err(error) => {
                if pending.can_retry() {
                    *self
                        .pending
                        .lock()
                        .map_err(|_| Error::Auth("ChatGPT sign-in attempt is unavailable"))? =
                        Some(pending);
                }
                Err(error.into())
            }
        }
    }

    /// After invalid_grant, open the returned URL for a fresh attempt using the issued client ID.
    #[napi]
    pub async fn retry(&self) -> napi::Result<String> {
        let pending = self
            .pending
            .lock()
            .map_err(|_| Error::Auth("ChatGPT sign-in attempt is unavailable"))?
            .take()
            .ok_or(Error::Auth("ChatGPT sign-in cannot be retried"))?;
        let pending = pending.restart(self.cancel.child_token()).await?;
        let url = pending.url.clone();
        *self
            .url
            .lock()
            .map_err(|_| Error::Auth("ChatGPT sign-in attempt is unavailable"))? = url.clone();
        *self
            .pending
            .lock()
            .map_err(|_| Error::Auth("ChatGPT sign-in attempt is unavailable"))? = Some(pending);
        Ok(url)
    }
}

/// Persist once per host before starting its first authorization attempt.
#[napi]
pub fn create_host_id() -> String {
    uuid::Uuid::new_v4().urn().to_string()
}

#[napi]
pub fn describe_session(record: String) -> napi::Result<AccountInfo> {
    Ok((&auth::Session::decode(&record)?).into())
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
    /// Backend-only stream. Always cancel the native handle before cancelling a pending JS reader.
    #[napi]
    pub fn stream_response<'env>(
        &self,
        env: &'env Env,
        record: String,
        request_json: String,
        cancellation: &Cancellation,
    ) -> napi::Result<ReadableStream<'env, serde_json::Value>> {
        let session = auth::Session::decode(&record)?;
        if !session
            .scopes
            .iter()
            .any(|scope| scope == "chatgpt.tokens.use.direct")
        {
            return Err(Error::Auth("ChatGPT plan usage was not authorized").into());
        }
        let request = responses::Request::decode(&request_json)?;
        let events = responses::stream(
            self.transport.clone(),
            session,
            request,
            cancellation.token.child_token(),
        )
        .map(|event| event.map_err(napi::Error::from));
        ReadableStream::new(env, Box::pin(events))
    }

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
            cancel.child_token(),
            None,
        )
        .await?;
        Ok(LoginAttempt {
            url: Mutex::new(pending.url.clone()),
            pending: Mutex::new(Some(pending)),
            cancel,
        })
    }

    /// Call inside DSH modifyRecord; persist the returned record before using it.
    #[napi]
    pub async fn renew_session(
        &self,
        record: String,
        cancellation: &Cancellation,
    ) -> napi::Result<LoginResult> {
        if cancellation.token.is_cancelled() {
            return Err(Error::Auth("ChatGPT renewal cancelled").into());
        }
        let session = auth::Session::decode(&record)?;
        let renewed = tokio::select! {
            _ = cancellation.token.cancelled() => return Err(Error::Auth("ChatGPT renewal cancelled").into()),
            result = tokio::time::timeout(std::time::Duration::from_secs(25), auth::renew(self.transport.client(), session)) => {
                result.map_err(|_| Error::Auth("ChatGPT renewal timed out"))??
            }
        };
        Ok(LoginResult::try_from(renewed)?)
    }

    /// Stop this account's in-flight requests before signing out, then persist the cleared record.
    #[napi]
    pub async fn logout_session(
        &self,
        record: String,
        cancellation: &Cancellation,
    ) -> napi::Result<LogoutResult> {
        let mut session = auth::Session::decode(&record)?;
        let confirmed = tokio::time::timeout(
            std::time::Duration::from_secs(25),
            auth::revoke(self.transport.client(), &session, &cancellation.token),
        )
        .await
        .unwrap_or(false);
        session.clear_tokens();
        Ok(LogoutResult {
            record: session.encode()?,
            revocation_confirmed: confirmed,
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
