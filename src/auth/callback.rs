use std::sync::{Arc, Mutex};

use axum::{
    Router,
    extract::{Query, State},
    http::StatusCode,
    routing::get,
};
use openidconnect::CsrfToken;
use serde::Deserialize;
use tokio::{net::TcpListener, sync::oneshot};
use tokio_util::sync::CancellationToken;

use crate::error::Error;

#[derive(Deserialize)]
pub(crate) struct Callback {
    pub state: String,
    pub code: Option<String>,
    pub client_id: Option<String>,
    pub error: Option<String>,
}

struct CallbackState {
    expected: CsrfToken,
    sender: Mutex<Option<oneshot::Sender<Callback>>>,
}

async fn receive(
    State(state): State<Arc<CallbackState>>,
    Query(callback): Query<Callback>,
) -> (StatusCode, &'static str) {
    if CsrfToken::new(callback.state.clone()) != state.expected {
        return (
            StatusCode::BAD_REQUEST,
            "Authorization state did not match.",
        );
    }
    let Ok(mut sender) = state.sender.lock() else {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Authorization attempt is unavailable.",
        );
    };
    let Some(sender) = sender.take() else {
        return (StatusCode::GONE, "Authorization attempt already completed.");
    };
    if sender.send(callback).is_err() {
        return (StatusCode::GONE, "Authorization attempt ended.");
    }
    (
        StatusCode::OK,
        "You can return to DeepSeek Harness to finish signing in.",
    )
}

pub(crate) async fn listen(
    state: CsrfToken,
    cancel: CancellationToken,
) -> Result<(String, oneshot::Receiver<Callback>), Error> {
    listen_on(state, cancel, 0).await
}

pub(crate) async fn listen_on(
    state: CsrfToken,
    cancel: CancellationToken,
    port: u16,
) -> Result<(String, oneshot::Receiver<Callback>), Error> {
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
        .await
        .map_err(Error::Listener)?;
    let port = listener.local_addr().map_err(Error::Listener)?.port();
    let (sender, receiver) = oneshot::channel();
    let app = Router::new()
        .route("/auth/callback", get(receive))
        .with_state(Arc::new(CallbackState {
            expected: state,
            sender: Mutex::new(Some(sender)),
        }));
    napi::tokio::spawn(async move {
        // Dropping the router on listener failure closes the receiver as well.
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(cancel.cancelled_owned())
            .await;
    });
    Ok((format!("http://127.0.0.1:{port}/auth/callback"), receiver))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn wrong_state_does_not_consume_the_pending_callback()
    -> Result<(), Box<dyn std::error::Error>> {
        let state = CsrfToken::new_random();
        let cancel = CancellationToken::new();
        let (url, receiver) = listen(state.clone(), cancel.clone()).await?;
        let http = reqwest::Client::builder().no_proxy().build()?;
        let rejected = http
            .get(&url)
            .query(&[("state", "incorrect"), ("code", "fake-code")])
            .send()
            .await?;
        assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);
        let accepted = http
            .get(&url)
            .query(&[("state", state.secret().as_str()), ("code", "fake-code")])
            .send()
            .await?;
        assert_eq!(accepted.status(), StatusCode::OK);
        assert_eq!(receiver.await?.code.as_deref(), Some("fake-code"));
        cancel.cancel();
        Ok(())
    }
}
