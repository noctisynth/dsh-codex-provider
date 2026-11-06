use serde::{Deserialize, Serialize};

use crate::error::Error;

/// Backend credential payload; never send this record to browser clients.
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Session {
    pub client_id: String,
    pub issuer: String,
    pub subject: String,
    pub email: Option<String>,
    pub host_id: String,
    pub id_token: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
    pub scopes: Vec<String>,
}

impl Session {
    pub fn decode(json: &str) -> Result<Self, Error> {
        let session: Self =
            serde_json::from_str(json).map_err(|_| Error::Auth("Invalid saved ChatGPT session"))?;
        if session.client_id.is_empty()
            || session.client_id == super::DYNAMIC_CLIENT
            || session.issuer != super::ISSUER
        {
            return Err(Error::Auth("Invalid saved ChatGPT registration"));
        }
        Ok(session)
    }

    pub fn encode(&self) -> Result<String, Error> {
        serde_json::to_string(self).map_err(|_| Error::Auth("Cannot encode ChatGPT session"))
    }
}
