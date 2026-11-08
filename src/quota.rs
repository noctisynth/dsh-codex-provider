use napi_derive::napi;
use serde::Deserialize;

use crate::{
    auth::Session,
    error::Error,
    transport::{Transport, response_error},
};

#[napi(object)]
#[derive(Debug)]
pub struct QuotaWindow {
    pub name: String,
    pub window_seconds: u32,
    pub remaining_percent: f64,
    /// Unix time in seconds, as supplied by the service.
    pub resets_at: Option<f64>,
}

#[napi(object)]
#[derive(Debug)]
pub struct Quota {
    pub plan: Option<String>,
    pub windows: Vec<QuotaWindow>,
    pub credits: Option<String>,
    pub unlimited_credits: bool,
}

#[derive(Deserialize)]
struct Usage {
    plan_type: Option<String>,
    rate_limit: Option<Limit>,
    code_review_rate_limit: Option<Limit>,
    additional_rate_limits: Option<Vec<AdditionalLimit>>,
    credits: Option<Credits>,
}

#[derive(Deserialize)]
struct AdditionalLimit {
    limit_name: Option<String>,
    metered_feature: String,
    rate_limit: Option<Limit>,
}

#[derive(Deserialize)]
struct Limit {
    primary_window: Option<Window>,
    secondary_window: Option<Window>,
}

#[derive(Deserialize)]
struct Window {
    used_percent: f64,
    limit_window_seconds: u32,
    reset_at: Option<f64>,
}

#[derive(Deserialize)]
struct Credits {
    balance: Option<String>,
    #[serde(default)]
    unlimited: bool,
}

fn parse(bytes: &[u8]) -> Result<Quota, Error> {
    let usage: Usage = serde_json::from_slice(bytes)
        .map_err(|_| Error::Protocol("Invalid Codex quota response"))?;
    let mut windows = Vec::new();
    let mut add = |name: &str, limit: Option<Limit>| -> Result<(), Error> {
        if let Some(limit) = limit {
            for window in [limit.primary_window, limit.secondary_window]
                .into_iter()
                .flatten()
            {
                if !(0.0..=100.0).contains(&window.used_percent) || window.limit_window_seconds == 0
                {
                    return Err(Error::Protocol("Invalid Codex quota window"));
                }
                windows.push(QuotaWindow {
                    name: name.to_owned(),
                    window_seconds: window.limit_window_seconds,
                    remaining_percent: 100.0 - window.used_percent,
                    resets_at: window.reset_at,
                });
            }
        }
        Ok(())
    };
    add("Codex", usage.rate_limit)?;
    add("Code review", usage.code_review_rate_limit)?;
    for limit in usage.additional_rate_limits.unwrap_or_default() {
        add(
            limit
                .limit_name
                .as_deref()
                .unwrap_or(&limit.metered_feature),
            limit.rate_limit,
        )?;
    }
    Ok(Quota {
        plan: usage.plan_type,
        windows,
        unlimited_credits: usage
            .credits
            .as_ref()
            .is_some_and(|credits| credits.unlimited),
        credits: usage.credits.and_then(|credits| credits.balance),
    })
}

pub(crate) async fn read(transport: &Transport, session: &Session) -> Result<Quota, Error> {
    if !session.login_method.capabilities().quota {
        return Err(Error::Protocol(
            "Quota is not available with this sign-in method",
        ));
    }
    let response = transport
        .authorized(
            session,
            transport
                .client()
                .get("https://chatgpt.com/backend-api/wham/usage"),
        )?
        .send()
        .await
        .map_err(Error::Network)?;
    if !response.status().is_success() {
        return Err(response_error(response).await);
    }
    parse(&response.bytes().await.map_err(Error::Network)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_only_quota_fields_and_does_not_invent_missing_windows() -> Result<(), Error> {
        let quota = parse(br#"{"email":"private","plan_type":"pro","rate_limit":{"primary_window":{"used_percent":12.5,"limit_window_seconds":18000,"reset_at":2000000000},"secondary_window":null},"additional_rate_limits":[{"metered_feature":"image","limit_name":"Images","rate_limit":{"primary_window":{"used_percent":20,"limit_window_seconds":86400}}}],"credits":{"balance":"4.5","unlimited":false}}"#)?;
        assert_eq!(quota.windows.len(), 2);
        assert_eq!(quota.windows[0].remaining_percent, 87.5);
        assert_eq!(quota.windows[0].resets_at, Some(2000000000.0));
        assert_eq!(quota.windows[1].resets_at, None);
        assert_eq!(quota.credits.as_deref(), Some("4.5"));
        assert!(parse(br#"{"rate_limit":{"primary_window":{"used_percent":101,"limit_window_seconds":18000}}}"#).is_err());
        assert!(
            parse(br#"{"rate_limit":null,"credits":null}"#)?
                .windows
                .is_empty()
        );
        Ok(())
    }
}
