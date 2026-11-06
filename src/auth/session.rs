use serde::{Deserialize, Serialize};

use crate::error::Error;

#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum LoginMethod {
    #[default]
    Siwc,
    CodexBrowser,
    CodexDevice,
}

impl LoginMethod {
    pub fn is_siwc(&self) -> bool {
        *self == Self::Siwc
    }
    pub fn parse(value: &str) -> Result<Self, Error> {
        match value {
            "siwc" => Ok(Self::Siwc),
            "codex-browser" => Ok(Self::CodexBrowser),
            "codex-device" => Ok(Self::CodexDevice),
            _ => Err(Error::Auth("Unknown ChatGPT login method")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Siwc => "siwc",
            Self::CodexBrowser => "codex-browser",
            Self::CodexDevice => "codex-device",
        }
    }
}

/// Backend credential payload; never send this record to browser clients.
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Session {
    #[serde(default, skip_serializing_if = "LoginMethod::is_siwc")]
    pub login_method: LoginMethod,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    pub client_id: String,
    pub issuer: String,
    pub subject: String,
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    pub host_id: String,
    pub id_token: String,
    pub nonce: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
    pub scopes: Vec<String>,
}

impl Session {
    pub fn key(&self) -> String {
        if self.login_method == LoginMethod::Siwc {
            self.client_id.clone()
        } else {
            format!(
                "codex:{}:{}",
                self.account_id.as_deref().unwrap_or_default(),
                self.subject
            )
        }
    }

    pub fn plan_usage_authorized(&self) -> bool {
        match self.login_method {
            LoginMethod::Siwc => self
                .scopes
                .iter()
                .any(|scope| scope == "chatgpt.tokens.use.direct"),
            _ => self.account_id.as_ref().is_some_and(|id| !id.is_empty()),
        }
    }
    pub fn clear_tokens(&mut self) {
        self.access_token.clear();
        self.refresh_token.clear();
        self.id_token.clear();
        self.nonce.clear();
        self.expires_at = 0;
        self.scopes.clear();
    }

    pub fn decode(json: &str) -> Result<Self, Error> {
        let session: Self =
            serde_json::from_str(json).map_err(|_| Error::Auth("Invalid saved ChatGPT session"))?;
        if session.client_id.is_empty()
            || session.client_id == super::DYNAMIC_CLIENT
            || session.issuer != super::ISSUER
        {
            return Err(Error::Auth("Invalid saved ChatGPT registration"));
        }
        if session.login_method != LoginMethod::Siwc
            && (session.client_id != super::legacy::CLIENT_ID
                || session.subject.is_empty()
                || session.account_id.as_ref().is_none_or(|id| id.is_empty()))
        {
            return Err(Error::Auth("Invalid saved Codex account"));
        }
        Ok(session)
    }

    pub fn encode(&self) -> Result<String, Error> {
        serde_json::to_string(self).map_err(|_| Error::Auth("Cannot encode ChatGPT session"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved(method: LoginMethod) -> Result<Session, Error> {
        Session::decode(
            &serde_json::json!({
                "login_method": method, "account_id": "workspace-a",
                "client_id": super::super::legacy::CLIENT_ID, "issuer": super::super::ISSUER,
                "subject": "subject-a", "email": null, "host_id": "", "id_token": "id",
                "nonce": "", "access_token": "access", "refresh_token": "refresh", "expires_at": 1,
                "scopes": []
            })
            .to_string(),
        )
    }

    #[test]
    fn legacy_methods_share_an_account_without_merging_siwc() -> Result<(), Error> {
        let browser = saved(LoginMethod::CodexBrowser)?;
        let device = saved(LoginMethod::CodexDevice)?;
        assert_eq!(browser.key(), device.key());
        assert!(browser.plan_usage_authorized());
        let mut siwc = browser.clone();
        siwc.login_method = LoginMethod::Siwc;
        assert_ne!(siwc.key(), browser.key());
        assert!(!siwc.plan_usage_authorized());
        let mut other_workspace = browser.clone();
        other_workspace.account_id = Some("workspace-b".into());
        assert_ne!(browser.key(), other_workspace.key());
        let mut other_subject = browser.clone();
        other_subject.subject = "subject-b".into();
        assert_ne!(browser.key(), other_subject.key());
        Ok(())
    }

    #[test]
    fn clearing_legacy_tokens_keeps_identity_and_login_method() -> Result<(), Error> {
        let mut session = saved(LoginMethod::CodexDevice)?;
        let key = session.key();
        session.clear_tokens();
        let decoded = Session::decode(&session.encode()?)?;
        assert_eq!(decoded.key(), key);
        assert!(decoded.login_method == LoginMethod::CodexDevice);
        assert!(decoded.access_token.is_empty());
        assert!(decoded.refresh_token.is_empty());
        Ok(())
    }
}
