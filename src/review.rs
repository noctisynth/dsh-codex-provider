use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Decision {
    risk: Risk,
    decision: Outcome,
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Risk {
    Low,
    Medium,
    High,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Outcome {
    Allow,
    Deny,
}

#[napi_derive::napi]
pub fn parse_review_decision(text: String) -> napi::Result<bool> {
    parse(&text)
        .map_err(|()| napi::Error::from_reason("ChatGPT returned an invalid approval decision"))
}

fn parse(text: &str) -> Result<bool, ()> {
    let decision: Decision = serde_json::from_str(text).map_err(|_| ())?;
    match (decision.risk, decision.decision, decision.reason) {
        (Risk::Low | Risk::Medium, Outcome::Allow, None) => Ok(true),
        (Risk::Medium | Risk::High, Outcome::Deny, _) => Ok(false),
        _ => Err(()),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn approval_decisions_reject_ambiguous_or_invalid_grants() {
        assert_eq!(
            super::parse(r#"{"risk":"low","decision":"allow"}"#),
            Ok(true)
        );
        assert_eq!(
            super::parse(r#"{"risk":"high","decision":"deny","reason":"Unsafe"}"#),
            Ok(false)
        );
        for text in [
            r#"{"risk":"high","decision":"allow"}"#,
            r#"{"risk":"low","decision":"deny"}"#,
            r#"{"risk":"low","decision":"allow","reason":"yes"}"#,
            r#"{"risk":"low","decision":"deny","decision":"allow"}"#,
            r#"{"risk":"low","decision":"allow","extra":true}"#,
            "```json\n{}\n```",
        ] {
            assert!(super::parse(text).is_err());
        }
    }
}
