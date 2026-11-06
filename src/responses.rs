use eventsource_stream::{Event, Eventsource};
use futures_util::{StreamExt, TryStreamExt, stream::BoxStream};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use crate::{auth::Session, error::Error, transport::Transport};

mod host_events;
mod host_request;
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
    reasoning: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    include: Option<Vec<String>>,
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
    request: Request,
    cancel: CancellationToken,
) -> BoxStream<'static, Result<Value, Error>> {
    Box::pin(async_stream::try_stream! {
        if cancel.is_cancelled() { Err(Error::Cancelled)?; }
        let response = tokio::select! {
            _ = cancel.cancelled() => Err(Error::Cancelled),
            response = transport.response(&session.access_token, &request) => response,
        }?;
        let source = response.bytes_stream().eventsource()
            .map_err(|_| Error::Protocol("Invalid or interrupted OpenAI event stream")).boxed();
        let mut events = decode(source, cancel);
        let mut mapper = host_events::Mapper::default();
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
                "response.failed" => Err(Error::ResponseFailed(value["response"]["error"]["code"].as_str().unwrap_or("unknown_error").into()))?,
                "response.incomplete" => Err(Error::Incomplete(value["response"]["incomplete_details"]["reason"].as_str().unwrap_or("unknown_reason").into()))?,
                "error" => Err(Error::ResponseFailed(value["code"].as_str().unwrap_or("unknown_error").into()))?,
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
            matches!(failed, Err(Error::ResponseFailed(code)) if code == "subscription_sharing_usage_limit_exceeded")
        );
        let incomplete = decode(source(&[r#"{"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}"#]), CancellationToken::new())
            .try_collect::<Vec<_>>().await;
        assert!(
            matches!(incomplete, Err(Error::Incomplete(reason)) if reason == "max_output_tokens")
        );
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
