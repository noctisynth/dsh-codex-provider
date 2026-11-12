use eventsource_stream::{Event, Eventsource};
use futures_util::{StreamExt, TryStreamExt, stream::BoxStream};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use crate::{
    auth::Session,
    error::{ApiError, Error},
    transport::Transport,
};

mod host_events;
mod host_request;
mod reasoning_cache;
pub(crate) use host_request::from_host;

#[derive(Deserialize, Serialize)]
pub(crate) struct Request {
    model: String,
    input: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    include: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    prompt_cache_key: Option<String>,
    #[serde(skip)]
    history_updates: bool,
    #[serde(skip)]
    cache: reasoning_cache::Options,
}

impl Request {
    pub(crate) fn cache_affinity_key(&self) -> Option<&str> {
        self.prompt_cache_key.as_deref()
    }
}

#[derive(Serialize)]
pub(crate) struct StreamingRequest<'a> {
    #[serde(flatten)]
    pub request: &'a Request,
    pub store: bool,
    pub stream: bool,
}

pub(crate) fn stream(
    transport: Transport,
    session: Session,
    mut request: Request,
    cancel: CancellationToken,
) -> BoxStream<'static, Result<Value, Error>> {
    Box::pin(async_stream::try_stream! {
        if cancel.is_cancelled() { Err(Error::Cancelled)?; }
        if !session.plan_usage_authorized() {
            Err(Error::Auth("ChatGPT plan usage was not authorized"))?;
        }
        if request.history_updates && !session.login_method.supports_history_updates() {
            Err(Error::Protocol("History updates are not available with this sign-in method"))?;
        }
        if !session.login_method.capabilities().web_search
            && request.tools.as_ref().is_some_and(|tools| tools.iter().any(|tool| tool["type"] == "web_search"))
        {
            Err(Error::Protocol("Built-in web search is not available with this sign-in method."))?;
        }
        let cache = reasoning_cache::prepare(
            &mut request, &session.key(), session.login_method.capabilities().configuration_update,
        )?;
        let response = tokio::select! {
            _ = cancel.cancelled() => Err(Error::Cancelled),
            response = transport.response(&session, &request) => response,
        }?;
        let source = response.bytes_stream().eventsource()
            .map_err(Error::from).boxed();
        let mut events = decode(source, cancel);
        let mut mapper = host_events::Mapper::new(cache);
        while let Some(event) = events.next().await {
            for chunk in mapper.accept(event?)? { yield chunk; }
        }
    })
}

fn decode(
    mut source: BoxStream<'static, Result<Event, Error>>,
    cancel: CancellationToken,
) -> BoxStream<'static, Result<Value, Error>> {
    Box::pin(async_stream::try_stream! {
        loop {
            let event = tokio::select! {
                _ = cancel.cancelled() => Err(Error::Cancelled),
                event = source.next() => event.ok_or(Error::Interrupted),
            }??;
            if event.data == "[DONE]" { Err(Error::Interrupted)?; }
            let value: Value = serde_json::from_str(&event.data)
                .map_err(|_| Error::Protocol("Invalid OpenAI event JSON"))?;
            let event_type = value["type"].as_str().ok_or(Error::Protocol("OpenAI event omitted its type"))?;
            match event_type {
                "response.failed" => Err(Error::Api(ApiError::from_value(&value["response"]["error"])))?,
                "response.incomplete" => Err(Error::Incomplete(value["response"]["incomplete_details"]["reason"].as_str().unwrap_or("unknown_reason").into()))?,
                "error" => Err(Error::Api(ApiError::from_value(&value)))?,
                "response.completed" => { yield value; break; }
                _ => yield value,
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(data: &[&str]) -> BoxStream<'static, Result<Event, Error>> {
        let events: Vec<_> = data
            .iter()
            .map(|data| {
                Ok(Event {
                    data: (*data).into(),
                    event: String::new(),
                    id: String::new(),
                    retry: None,
                })
            })
            .collect();
        futures_util::stream::iter(events).boxed()
    }

    #[test]
    fn wire_request_always_disables_storage_and_enables_streaming()
    -> Result<(), Box<dyn std::error::Error>> {
        let request: Request = serde_json::from_str(
            r#"{"model":"test-model","input":[],"store":true,"stream":false}"#,
        )?;
        let wire = serde_json::to_value(StreamingRequest {
            request: &request,
            store: false,
            stream: true,
        })?;
        assert_eq!(wire["store"], false);
        assert_eq!(wire["stream"], true);
        Ok(())
    }

    #[tokio::test]
    async fn completion_is_required_for_success() -> Result<(), Error> {
        let events: Vec<_> = decode(
            source(&[
                r#"{"type":"response.output_text.delta","delta":"测试"}"#,
                r#"{"type":"response.completed"}"#,
            ]),
            CancellationToken::new(),
        )
        .try_collect()
        .await?;
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["delta"], "测试");
        let interrupted = decode(source(&[]), CancellationToken::new())
            .try_collect::<Vec<_>>()
            .await;
        assert!(matches!(interrupted, Err(Error::Interrupted)));
        Ok(())
    }

    #[tokio::test]
    async fn failure_and_incomplete_preserve_terminal_meaning() {
        let failed = decode(source(&[r#"{"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}"#]), CancellationToken::new())
            .try_collect::<Vec<_>>().await;
        assert!(
            matches!(failed, Err(Error::Api(detail)) if detail.code.as_deref() == Some("subscription_sharing_usage_limit_exceeded"))
        );
        let incomplete = decode(source(&[r#"{"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}"#]), CancellationToken::new())
            .try_collect::<Vec<_>>().await;
        assert!(
            matches!(incomplete, Err(Error::Incomplete(reason)) if reason == "max_output_tokens")
        );
    }

    #[tokio::test]
    async fn stream_error_retains_public_diagnostics_without_payload()
    -> Result<(), Box<dyn std::error::Error>> {
        let result = decode(source(&[
            r#"{"type":"error","code":"context_length_exceeded","param":"input","message":"Context exceeded","input":"not-for-display"}"#,
        ]), CancellationToken::new()).try_collect::<Vec<_>>().await;
        let error = match result {
            Err(error) => error,
            Ok(_) => return Err("the synthetic stream must fail".into()),
        };
        let event = error.stream_event();
        assert_eq!(event["error"]["code"], "context_length_exceeded");
        assert_eq!(event["error"]["param"], "input");
        assert_eq!(
            event["error"]["message"],
            "OpenAI response failed: Context exceeded"
        );
        assert!(event["error"].get("input").is_none());
        Ok(())
    }

    #[tokio::test]
    async fn body_read_failures_preserve_transport_and_timeout_kinds()
    -> Result<(), Box<dyn std::error::Error>> {
        for (kind, expected) in [
            (std::io::ErrorKind::ConnectionReset, "transport"),
            (std::io::ErrorKind::TimedOut, "timeout"),
        ] {
            let body = reqwest::Body::wrap_stream(futures_util::stream::iter([
                Ok(
                    b"data: {\"type\":\"response.output_text.delta\",\"delta\":\"test\"}\n\n"
                        .as_slice(),
                ),
                Err(std::io::Error::new(kind, "synthetic read failure")),
            ]));
            let response = reqwest::Response::from(axum::http::Response::new(body));
            let source = response
                .bytes_stream()
                .eventsource()
                .map_err(Error::from)
                .boxed();
            let mut events = decode(source, CancellationToken::new());
            let delta = events.next().await.ok_or("missing delta")??;
            assert_eq!(delta["delta"], "test");
            let error = events
                .next()
                .await
                .ok_or("missing stream failure")?
                .err()
                .ok_or("body read must fail")?;
            assert!(matches!(&error, Error::Network(_)), "{error:?}");
            let event = error.stream_event();
            assert_eq!(event["error"]["kind"], expected);
            assert_eq!(event["error"]["message"], "OpenAI network request failed");
            assert!(events.next().await.is_none());
        }
        Ok(())
    }

    #[tokio::test]
    async fn invalid_stream_encoding_and_json_remain_protocol_errors()
    -> Result<(), Box<dyn std::error::Error>> {
        for body in [b"\xff".as_slice(), b"data: not-json\n\n".as_slice()] {
            let response = reqwest::Response::from(axum::http::Response::new(body.to_vec()));
            let source = response
                .bytes_stream()
                .eventsource()
                .map_err(Error::from)
                .boxed();
            let error = decode(source, CancellationToken::new())
                .next()
                .await
                .ok_or("missing stream failure")?
                .err()
                .ok_or("invalid stream must fail")?;
            assert!(matches!(error, Error::Protocol(_)));
            assert_eq!(error.stream_event()["error"]["kind"], "protocol");
        }
        Ok(())
    }

    #[tokio::test]
    async fn cancellation_interrupts_a_pending_read() -> Result<(), Box<dyn std::error::Error>> {
        let cancel = CancellationToken::new();
        let mut events = decode(futures_util::stream::pending().boxed(), cancel.clone());
        let pending = tokio::spawn(async move { events.next().await });
        tokio::task::yield_now().await;
        cancel.cancel();
        let result = tokio::time::timeout(std::time::Duration::from_secs(1), pending).await??;
        assert!(matches!(result, Some(Err(Error::Cancelled))));
        Ok(())
    }
}
