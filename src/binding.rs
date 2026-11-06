use napi_derive::napi;

use crate::{models, transport::Transport};

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
