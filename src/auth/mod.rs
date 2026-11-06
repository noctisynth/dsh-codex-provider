mod callback;
mod legacy;
mod provider;
mod session;
mod siwc;
mod verify;

pub(crate) use session::{LoginMethod, Session};

use crate::error::Error;
use tokio_util::sync::CancellationToken;

pub(crate) const ISSUER: &str = "https://auth.openai.com";
pub(crate) const RESOURCE: &str = "https://api.openai.com/v1";
const DYNAMIC_CLIENT: &str = "dynamic_agent_client";

pub(crate) enum PendingLogin {
    Siwc(Box<siwc::login::PendingLogin>),
    Browser(legacy::browser::PendingLogin),
    Device(legacy::device::PendingLogin),
}

impl PendingLogin {
    pub fn url(&self) -> &str {
        match self {
            Self::Siwc(pending) => &pending.url,
            Self::Browser(pending) => &pending.url,
            Self::Device(_) => legacy::device::VERIFICATION_URL,
        }
    }

    pub fn user_code(&self) -> Option<&str> {
        match self {
            Self::Device(pending) => Some(&pending.user_code),
            _ => None,
        }
    }

    pub fn can_retry(&self) -> bool {
        matches!(self, Self::Siwc(pending) if pending.can_retry())
    }

    pub async fn restart(self, cancel: CancellationToken) -> Result<Self, Error> {
        match self {
            Self::Siwc(pending) => Ok(Self::Siwc(Box::new((*pending).restart(cancel).await?))),
            _ => Err(Error::Auth("Start a new Codex sign-in")),
        }
    }

    pub async fn complete(&mut self) -> Result<Session, Error> {
        match self {
            Self::Siwc(pending) => pending.complete().await,
            Self::Browser(pending) => pending.complete().await,
            Self::Device(pending) => pending.complete().await,
        }
    }
}

pub(crate) async fn begin_login(
    http: reqwest::Client,
    host_id: String,
    previous: Option<Session>,
    cancel: CancellationToken,
    method: LoginMethod,
) -> Result<PendingLogin, Error> {
    if cancel.is_cancelled() {
        return Err(Error::Auth("ChatGPT sign-in cancelled"));
    }
    if previous
        .as_ref()
        .is_some_and(|s| (s.login_method == LoginMethod::Siwc) != (method == LoginMethod::Siwc))
    {
        return Err(Error::Auth(
            "The selected account uses a different login method",
        ));
    }
    match method {
        LoginMethod::Siwc => Ok(PendingLogin::Siwc(Box::new(
            siwc::login::begin_login(http, host_id, previous, cancel, None).await?,
        ))),
        LoginMethod::CodexBrowser => Ok(PendingLogin::Browser(
            legacy::browser::begin(http, previous, cancel).await?,
        )),
        LoginMethod::CodexDevice => Ok(PendingLogin::Device(
            legacy::device::begin(http, previous, cancel).await?,
        )),
    }
}

pub(crate) async fn renew(http: &reqwest::Client, session: Session) -> Result<Session, Error> {
    match session.login_method {
        LoginMethod::Siwc => siwc::renewal::renew(http, session).await,
        _ => legacy::tokens::renew(http, session).await,
    }
}

pub(crate) async fn revoke(
    http: &reqwest::Client,
    session: &Session,
    cancel: &CancellationToken,
) -> bool {
    match session.login_method {
        LoginMethod::Siwc => siwc::logout::revoke(http, session, cancel).await,
        _ => false,
    }
}
