mod callback;
mod login;
mod provider;
mod session;

pub(crate) use login::{PendingLogin, begin_login};
pub(crate) use session::Session;

pub(crate) const ISSUER: &str = "https://auth.openai.com";
pub(crate) const RESOURCE: &str = "https://api.openai.com/v1";
const DYNAMIC_CLIENT: &str = "dynamic_agent_client";
