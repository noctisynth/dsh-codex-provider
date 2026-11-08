use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

use crate::{
    auth::Session,
    error::Error,
    transport::{Transport, response_error},
};

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Quality {
    #[default]
    Auto,
    Low,
    Medium,
    High,
}

#[derive(Default, Deserialize, Serialize)]
enum Size {
    #[default]
    #[serde(rename = "auto")]
    Auto,
    #[serde(rename = "1024x1024")]
    Square,
    #[serde(rename = "1536x1024")]
    Landscape,
    #[serde(rename = "1024x1536")]
    Portrait,
}

#[derive(Deserialize, Serialize)]
struct Request {
    prompt: String,
    #[serde(default)]
    quality: Quality,
    #[serde(default)]
    size: Size,
    #[serde(default)]
    transparent: bool,
}

#[derive(Deserialize)]
struct Response {
    data: Vec<Image>,
}
#[derive(Deserialize)]
struct Image {
    b64_json: String,
}

fn decode(bytes: &[u8], maximum_bytes: usize) -> Result<Vec<u8>, Error> {
    let response: Response = serde_json::from_slice(bytes)
        .map_err(|_| Error::Protocol("Invalid Codex image response"))?;
    if response.data.len() != 1 {
        return Err(Error::Protocol("Codex did not return exactly one image"));
    }
    let encoded = &response.data[0].b64_json;
    let image = STANDARD
        .decode(encoded)
        .map_err(|_| Error::Protocol("Invalid Codex image encoding"))?;
    if image.len() > maximum_bytes {
        return Err(Error::Protocol(
            "Generated image exceeds the DSH attachment limit",
        ));
    }
    if !image.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err(Error::Protocol("Codex did not return a PNG image"));
    }
    Ok(image)
}

pub(crate) async fn generate(
    transport: &Transport,
    session: &Session,
    json: &str,
    maximum_bytes: u32,
) -> Result<Vec<u8>, Error> {
    if !session.login_method.capabilities().image_generation {
        return Err(Error::Protocol(
            "Image generation is not available with this sign-in method",
        ));
    }
    let request: Request = serde_json::from_str(json)
        .map_err(|_| Error::Protocol("Invalid image generation request"))?;
    if request.prompt.trim().is_empty() || maximum_bytes == 0 {
        return Err(Error::Protocol(
            "Image generation needs a prompt and attachment capacity",
        ));
    }
    let response = transport.authorized(session, transport.client()
        .post("https://chatgpt.com/backend-api/codex/images/generations"))?
        .header("x-codex-image-turn-id", uuid::Uuid::new_v4().to_string())
        .json(&serde_json::json!({
            "model":"gpt-image-2", "prompt":request.prompt, "quality":request.quality,
            "size":request.size, "background":if request.transparent { "transparent" } else { "auto" }
        }))
        .send().await.map_err(Error::Network)?;
    if !response.status().is_success() {
        return Err(response_error(response).await);
    }
    // The host's binary limit also bounds the Base64 response before decoding.
    let maximum_bytes = maximum_bytes as usize;
    let maximum_response = maximum_bytes.div_ceil(3) * 4 + 64 * 1024;
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(Error::Network)?;
        if bytes.len() + chunk.len() > maximum_response {
            return Err(Error::Protocol(
                "Generated image exceeds the DSH attachment limit",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    decode(&bytes, maximum_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_response_rejects_empty_invalid_and_oversized_data() -> Result<(), Error> {
        let png = b"\x89PNG\r\n\x1a\nfixture";
        let json = serde_json::json!({"data":[{"b64_json":STANDARD.encode(png)}]}).to_string();
        assert_eq!(decode(json.as_bytes(), png.len())?, png);
        assert!(decode(json.as_bytes(), png.len() - 1).is_err());
        assert!(decode(br#"{"data":[]}"#, 100).is_err());
        assert!(decode(br#"{"data":[{"b64_json":"not base64"}]}"#, 100).is_err());
        Ok(())
    }
}
