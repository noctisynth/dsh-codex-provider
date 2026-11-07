use napi_derive::napi;

use crate::{auth, capabilities::Capabilities, error::Error, models};

#[napi(object)]
pub struct AccountInfo {
    pub capabilities: Capabilities,
    pub id: String,
    pub login_method: String,
    pub client_id: String,
    pub subject: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
    pub plan_usage_authorized: bool,
    pub has_credentials: bool,
}

impl From<&auth::Session> for AccountInfo {
    fn from(session: &auth::Session) -> Self {
        Self {
            capabilities: session.login_method.capabilities(),
            id: session.key(),
            login_method: session.login_method.as_str().into(),
            client_id: session.client_id.clone(),
            subject: session.subject.clone(),
            email: session.email.clone(),
            name: session.name.clone(),
            picture: session.picture.clone(),
            plan_usage_authorized: session.plan_usage_authorized(),
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
    pub local_only: bool,
}

#[napi(object)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub hidden: Option<bool>,
    pub auto_review_model_override: Option<String>,
    pub context_window: Option<u32>,
    pub input_modalities: Option<Vec<String>>,
    pub reasoning: Option<ModelReasoning>,
}

#[napi(object)]
pub struct ModelReasoning {
    pub efforts: Vec<ModelReasoningEffort>,
    pub default_effort: Option<String>,
}

#[napi(object)]
pub struct ModelReasoningEffort {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

impl From<models::Model> for Model {
    fn from(value: models::Model) -> Self {
        Self {
            id: value.id,
            name: value.name,
            hidden: Some(value.hidden),
            auto_review_model_override: value.auto_review_model_override,
            context_window: value.context_window,
            input_modalities: value.input_modalities,
            reasoning: value.reasoning.map(|reasoning| ModelReasoning {
                default_effort: reasoning.default_effort,
                efforts: reasoning
                    .efforts
                    .into_iter()
                    .map(|effort| ModelReasoningEffort {
                        name: effort.id.clone(),
                        id: effort.id,
                        description: effort.description,
                    })
                    .collect(),
            }),
        }
    }
}
