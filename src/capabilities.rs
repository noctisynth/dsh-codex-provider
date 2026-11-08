use napi_derive::napi;

use crate::auth::LoginMethod;

/// Features this plugin currently enables for a login route.
/// Account grants, model support and user preferences are checked separately.
#[napi(object)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Capabilities {
    pub web_search: bool,
    pub quota: bool,
    pub image_generation: bool,
    pub connectors: bool,
    pub remote_revocation: bool,
}

impl LoginMethod {
    pub fn capabilities(self) -> Capabilities {
        match self {
            Self::Siwc => Capabilities {
                web_search: true,
                quota: false,
                image_generation: false,
                connectors: false,
                remote_revocation: true,
            },
            Self::CodexBrowser | Self::CodexDevice => Capabilities {
                web_search: true,
                quota: true,
                image_generation: true,
                connectors: false,
                remote_revocation: false,
            },
        }
    }
}
