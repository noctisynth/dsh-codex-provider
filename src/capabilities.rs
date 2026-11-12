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
    pub configuration_update: bool,
}

impl LoginMethod {
    // Model eligibility comes from its advertised incremental mode, not its name.
    pub(crate) fn supports_history_updates(self) -> bool {
        matches!(self, Self::CodexBrowser | Self::CodexDevice)
    }

    pub fn capabilities(self) -> Capabilities {
        match self {
            Self::Siwc => Capabilities {
                web_search: true,
                quota: false,
                image_generation: false,
                connectors: false,
                remote_revocation: true,
                configuration_update: false,
            },
            Self::CodexBrowser | Self::CodexDevice => Capabilities {
                web_search: true,
                quota: true,
                image_generation: true,
                connectors: false,
                remote_revocation: false,
                configuration_update: true,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_extensions_are_legacy_only() {
        assert!(!LoginMethod::Siwc.supports_history_updates());
        assert!(LoginMethod::CodexBrowser.supports_history_updates());
        assert!(LoginMethod::CodexDevice.supports_history_updates());
    }
}
