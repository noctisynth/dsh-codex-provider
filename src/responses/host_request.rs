use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::{Request, reasoning_cache};
use crate::error::Error;

pub(super) const REPLAY_FORMAT: &str = "dsh-codex-provider/responses";
pub(super) const REPLAY_FORMAT_V2: &str = "dsh-codex-provider/responses-v2";

// Hash only persisted visible semantics, never source/replay metadata or usage.
// Both the streaming writer and history reader use these exact tuples.
pub(super) fn visible_content_digest(blocks: &[Value]) -> Result<String, Error> {
    let content: Vec<_> = blocks
        .iter()
        .map(|block| match block["type"].as_str() {
            Some("tool-call") => json!([
                block["type"],
                block["id"],
                block["name"],
                block["arguments"]
            ]),
            _ => json!([block["type"], block["text"]]),
        })
        .collect();
    let bytes = serde_json::to_vec(&content)
        .map_err(|_| Error::Protocol("Could not encode visible replay content"))?;
    Ok(URL_SAFE_NO_PAD.encode(Sha256::digest(bytes)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateOptions {
    model: String,
    session_id: Option<String>,
    messages: Vec<Message>,
    system: Option<String>,
    tools: Option<Vec<Tool>>,
    reasoning_effort: Option<String>,
    #[serde(default)]
    image_detail: ImageDetail,
    #[serde(default)]
    web_search: bool,
    #[serde(default)]
    search_only: bool,
    #[serde(default)]
    cache_preserving_reasoning: bool,
}

#[derive(Clone, Copy, Default, Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
enum ImageDetail {
    #[default]
    Auto,
    Low,
    High,
    Original,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Message {
    role: String,
    content: Vec<Value>,
    source: Option<Value>,
    tool_call_id: Option<String>,
}

#[derive(Deserialize)]
struct Tool {
    name: String,
    description: String,
    parameters: Value,
}

fn text(block: &Value) -> &str {
    block["text"].as_str().unwrap_or_default()
}

fn legacy_replay_matches(replay: &Value, digest: &str) -> bool {
    let items: Vec<_> = replay["blocks"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|block| block["items"].as_array().into_iter().flatten())
        .chain(
            replay["response"]["trailing"]
                .as_array()
                .into_iter()
                .flatten(),
        )
        .cloned()
        .collect();
    // Empty old snapshots must still fall back to persisted visible content.
    !items.is_empty()
        && super::host_events::replay_content_digest(&items).is_ok_and(|saved| saved == digest)
}

pub(crate) fn from_host(json: &str) -> Result<Request, Error> {
    let options: GenerateOptions = serde_json::from_str(json)
        .map_err(|_| Error::Protocol("Invalid DSH generation request"))?;
    let mut input = Vec::new();
    let mut previous_cache = None;
    for message in options.messages {
        if message.role == "tool" {
            let call_id = message
                .tool_call_id
                .ok_or(Error::Protocol("DSH tool result omitted its call ID"))?;
            let output = if message.content.iter().any(|block| block["type"] == "image") {
                let mut content = Vec::new();
                for block in &message.content {
                    match block["type"].as_str() {
                        Some("text") => {
                            content.push(json!({"type":"input_text","text":text(block)}))
                        }
                        Some("image") => {
                            let url = block["imageUrl"]
                                .as_str()
                                .filter(|url| !url.is_empty())
                                .ok_or(Error::Protocol(
                                    "DSH image omitted its resolved data URL",
                                ))?;
                            content.push(json!({
                                "type":"input_image", "image_url":url, "detail":options.image_detail
                            }));
                        }
                        _ => {}
                    }
                }
                json!(content)
            } else {
                json!(
                    message
                        .content
                        .iter()
                        .filter(|b| b["type"] == "text")
                        .map(text)
                        .collect::<Vec<_>>()
                        .join("\n")
                )
            };
            input.push(json!({"type":"function_call_output","call_id":call_id,"output":output}));
            continue;
        }
        if !matches!(
            message.role.as_str(),
            "system" | "developer" | "user" | "assistant"
        ) {
            return Err(Error::Protocol("Unsupported DSH message role"));
        }
        let digest = visible_content_digest(&message.content)?;
        let replay = message
            .source
            .as_ref()
            .and_then(|s| s.get("replayState"))
            .filter(|_| message.role == "assistant")
            .filter(|r| {
                if r["response"]["format"] == REPLAY_FORMAT_V2 {
                    r["response"]["contentDigest"] == digest
                        && r["response"]["items"]
                            .as_array()
                            .is_some_and(|items| !items.is_empty())
                } else {
                    // Legacy protection is limited to what its saved item order can reproduce.
                    // Do not migrate it or invent a native order from the current UI blocks.
                    r["response"]["format"] == REPLAY_FORMAT && legacy_replay_matches(r, &digest)
                }
            });
        let start = input.len();
        let ordered_items = replay
            .filter(|r| r["response"]["format"] == REPLAY_FORMAT_V2)
            .and_then(|r| r["response"]["items"].as_array());
        if let Some(items) = ordered_items {
            input.extend(items.iter().cloned());
        } else {
            for (index, block) in message.content.iter().enumerate() {
                if let Some(items) = replay.and_then(|r| r["blocks"][index]["items"].as_array()) {
                    input.extend(items.iter().cloned());
                    continue;
                }
                match block["type"].as_str() {
                    Some("text") => input.push(json!({"role":message.role,"content":text(block)})),
                    Some("image") if message.role == "user" => {
                        let url = block["imageUrl"]
                            .as_str()
                            .filter(|url| !url.is_empty())
                            .ok_or(Error::Protocol("DSH image omitted its resolved data URL"))?;
                        input.push(json!({"role":"user","content":[{
                            "type":"input_image", "image_url":url, "detail":options.image_detail
                        }]}));
                    }
                    Some("tool-call") => input.push(json!({
                        "type":"function_call", "call_id":block["id"],
                        "name":block["name"], "arguments":block["arguments"]
                    })),
                    // Summaries are display text; only encrypted provider items are replayable reasoning.
                    Some("reasoning") => {}
                    _ => return Err(Error::Protocol("Unprojected DSH content block")),
                }
            }
            if let Some(items) = replay.and_then(|r| r["response"]["trailing"].as_array()) {
                input.extend(items.iter().cloned());
            }
        }
        if message.role == "assistant" {
            previous_cache =
                replay.and_then(|r| reasoning_cache::Candidate::from_replay(r, start, input.len()));
        }
    }
    let mut tools: Vec<_> = options
        .tools
        .unwrap_or_default()
        .into_iter()
        .map(|t| {
            json!({
                "type":"function","name":t.name,"description":t.description,
                "parameters":t.parameters,"strict":false
            })
        })
        .collect();
    if options.web_search {
        tools.push(json!({"type":"web_search"}));
    }
    Ok(Request {
        model: options.model,
        prompt_cache_key: options
            .session_id
            .filter(|id| !id.is_empty())
            .map(|id| URL_SAFE_NO_PAD.encode(Sha256::digest(id.as_bytes()))),
        input,
        instructions: options.system,
        tools: if tools.is_empty() { None } else { Some(tools) },
        tool_choice: options.search_only.then(|| json!({"type":"web_search"})),
        reasoning: Some(match options.reasoning_effort {
            Some(effort) => json!({"summary":"auto","effort":effort}),
            None => json!({"summary":"auto"}),
        }),
        include: Some(if options.web_search {
            vec![
                "reasoning.encrypted_content".into(),
                "web_search_call.action.sources".into(),
            ]
        } else {
            vec!["reasoning.encrypted_content".into()]
        }),
        cache: reasoning_cache::Options {
            enabled: options.cache_preserving_reasoning,
            previous: previous_cache,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_cache_key_is_stable_bounded_and_omitted_without_a_session()
    -> Result<(), Box<dyn std::error::Error>> {
        let mut options = json!({"model":"test","messages":[],"sessionId":"dsh-session-a"});
        let first = serde_json::to_value(from_host(&options.to_string())?)?;
        assert_eq!(
            first["prompt_cache_key"],
            "dTl4QO2xLq1MCRJSwjSlGJIJwJlKiVR4a3zANGDvljs"
        );
        assert!(first.get("sessionId").is_none());
        // A new parse after restoring serialized host options must retain the key,
        // even when the next turn changes model, effort, or input.
        options = serde_json::from_str(&options.to_string())?;
        options["model"] = json!("other-model");
        options["reasoningEffort"] = json!("high");
        options["messages"] =
            json!([{"role":"user","content":[{"type":"text","text":"Next turn"}]}]);
        let next = serde_json::to_value(from_host(&options.to_string())?)?;
        assert_eq!(next["prompt_cache_key"], first["prompt_cache_key"]);
        let shared_prefix = "session-".repeat(20);
        options["sessionId"] = json!(format!("{shared_prefix}a"));
        let long = serde_json::to_value(from_host(&options.to_string())?)?;
        assert_eq!(long["prompt_cache_key"].as_str().map(str::len), Some(43));
        options["sessionId"] = json!(format!("{shared_prefix}b"));
        let other = serde_json::to_value(from_host(&options.to_string())?)?;
        assert_ne!(other["prompt_cache_key"], long["prompt_cache_key"]);
        for id in [Value::Null, json!("")] {
            options["sessionId"] = id;
            assert!(
                serde_json::to_value(from_host(&options.to_string())?)?
                    .get("prompt_cache_key")
                    .is_none()
            );
        }
        let missing = serde_json::to_value(from_host(r#"{"model":"test","messages":[]}"#)?)?;
        assert!(missing.get("prompt_cache_key").is_none());
        Ok(())
    }

    #[test]
    fn images_preserve_order_and_survive_followup_history() -> Result<(), Error> {
        let request = from_host(
            &json!({"model":"vision","messages":[
                {"role":"user","content":[
                    {"type":"text","text":"Compare"},
                    {"type":"image","imageUrl":"data:image/png;base64,first"},
                    {"type":"image","imageUrl":"data:image/jpeg;base64,second"}
                ]},
                {"role":"assistant","content":[{"type":"text","text":"Different colors"}]},
                {"role":"user","content":[{"type":"text","text":"Which is red?"}]}
            ]})
            .to_string(),
        )?;
        assert_eq!(request.input.len(), 5);
        assert_eq!(request.input[1]["content"][0]["type"], "input_image");
        assert_eq!(
            request.input[1]["content"][0]["image_url"],
            "data:image/png;base64,first"
        );
        assert_eq!(
            request.input[2]["content"][0]["image_url"],
            "data:image/jpeg;base64,second"
        );
        assert_eq!(request.input[2]["content"][0]["detail"], "auto");
        assert_eq!(request.input[4]["content"], "Which is red?");
        Ok(())
    }

    #[test]
    fn tool_images_preserve_call_content_order_and_followup_history() -> Result<(), Error> {
        let request = from_host(
            &json!({"model":"vision","imageDetail":"high","messages":[
                {"role":"assistant","content":[
                    {"type":"tool-call","id":"call_images","name":"read_image","arguments":"{}"}
                ]},
                {"role":"tool","toolCallId":"call_images","content":[
                    {"type":"text","text":"First image"},
                    {"type":"image","imageUrl":"data:image/png;base64,first"},
                    {"type":"text","text":"Second image"},
                    {"type":"image","imageUrl":"data:image/jpeg;base64,second"},
                    {"type":"text","text":"End"}
                ]},
                {"role":"assistant","content":[{"type":"text","text":"Different colors"}]},
                {"role":"user","content":[{"type":"text","text":"Which is red?"}]}
            ]})
            .to_string(),
        )?;
        assert_eq!(request.input.len(), 4);
        assert_eq!(request.input[0]["type"], "function_call");
        assert_eq!(request.input[0]["call_id"], "call_images");
        assert_eq!(
            request.input[1],
            json!({
                "type":"function_call_output","call_id":"call_images","output":[
                    {"type":"input_text","text":"First image"},
                    {"type":"input_image","image_url":"data:image/png;base64,first","detail":"high"},
                    {"type":"input_text","text":"Second image"},
                    {"type":"input_image","image_url":"data:image/jpeg;base64,second","detail":"high"},
                    {"type":"input_text","text":"End"}
                ]
            })
        );
        assert_eq!(request.input[2]["content"], "Different colors");
        assert_eq!(request.input[3]["content"], "Which is red?");
        Ok(())
    }

    #[test]
    fn text_only_tool_results_keep_string_outputs() -> Result<(), Error> {
        for (content, expected) in [
            (json!([]), ""),
            (json!([{"type":"text","text":"result"}]), "result"),
            (
                json!([{"type":"text","text":"first"},{"type":"text","text":"second"}]),
                "first\nsecond",
            ),
        ] {
            let request = from_host(
                &json!({"model":"test","messages":[
                    {"role":"tool","toolCallId":"call_text","content":content}
                ]})
                .to_string(),
            )?;
            assert_eq!(request.input[0]["output"], expected);
        }
        Ok(())
    }

    #[test]
    fn images_require_resolved_urls_in_user_and_tool_messages() {
        for role in ["user", "tool"] {
            for url in [Value::Null, json!("")] {
                assert!(from_host(&json!({"model":"vision","messages":[
                    {"role":role,"toolCallId":"call_image","content":[{"type":"image","imageUrl":url}]}
                ]}).to_string()).is_err());
            }
        }
    }

    #[test]
    fn image_detail_reaches_every_retained_image_and_rejects_unknown_values() -> Result<(), Error> {
        let mut options = json!({"model":"vision","messages":[
            {"role":"user","content":[{"type":"image","imageUrl":"data:image/png;base64,one"}]},
            {"role":"user","content":[{"type":"image","imageUrl":"data:image/png;base64,two"}]},
            {"role":"tool","toolCallId":"call_image","content":[{"type":"image","imageUrl":"data:image/png;base64,tool"}]}
        ]});
        for detail in ["auto", "low", "high", "original"] {
            options["imageDetail"] = json!(detail);
            let request = from_host(&options.to_string())?;
            for item in &request.input[..2] {
                assert_eq!(item["content"][0]["detail"], detail);
            }
            assert_eq!(
                request.input[2]["output"],
                json!([
                    {"type":"input_image","image_url":"data:image/png;base64,tool","detail":detail}
                ])
            );
        }
        options["imageDetail"] = json!("unsupported");
        assert!(from_host(&options.to_string()).is_err());
        Ok(())
    }

    #[test]
    fn compaction_options_do_not_send_unsupported_siwc_parameters()
    -> Result<(), Box<dyn std::error::Error>> {
        let request = from_host(
            &json!({
                "model": "test", "system": "Summarize the conversation.",
                "messages": [{"role":"user","content":[{"type":"text","text":"Keep the task goal."}]}],
                "maxTokens": 65536, "temperature": 0.2, "reasoningEffort": "low"
            }).to_string(),
        )?;
        let wire = serde_json::to_value(super::super::StreamingRequest {
            request: &request,
            store: false,
            stream: true,
        })?;
        assert!(wire.get("max_output_tokens").is_none());
        assert!(wire.get("temperature").is_none());
        assert_eq!(wire["instructions"], "Summarize the conversation.");
        assert_eq!(wire["input"][0]["content"], "Keep the task goal.");
        assert_eq!(wire["reasoning"]["effort"], "low");
        assert_eq!(wire["store"], false);
        assert_eq!(wire["stream"], true);
        Ok(())
    }

    #[test]
    fn selected_effort_is_sent_to_responses_without_an_invented_default() -> Result<(), Error> {
        let mut options = json!({"model":"test","messages":[]});
        assert!(
            from_host(&options.to_string())?
                .reasoning
                .as_ref()
                .is_some_and(|value| value.get("effort").is_none())
        );
        options["reasoningEffort"] = json!("future-level");
        assert_eq!(
            from_host(&options.to_string())?
                .reasoning
                .as_ref()
                .map(|value| &value["effort"]),
            Some(&json!("future-level"))
        );
        Ok(())
    }

    #[test]
    fn search_tools_are_opt_in_and_forced_only_for_dedicated_search()
    -> Result<(), Box<dyn std::error::Error>> {
        let mut options = json!({"model":"test","messages":[]});
        let ordinary = serde_json::to_value(from_host(&options.to_string())?)?;
        assert!(ordinary.get("tool_choice").is_none());
        assert_eq!(ordinary["include"], json!(["reasoning.encrypted_content"]));
        options["webSearch"] = json!(true);
        options["searchOnly"] = json!(true);
        let search = serde_json::to_value(from_host(&options.to_string())?)?;
        assert_eq!(search["tools"][0]["type"], "web_search");
        assert_eq!(search["tool_choice"]["type"], "web_search");
        assert_eq!(
            search["include"],
            json!([
                "reasoning.encrypted_content",
                "web_search_call.action.sources"
            ])
        );
        assert!(
            search["include"]
                .as_array()
                .is_some_and(|items| items.contains(&json!("web_search_call.action.sources")))
        );
        Ok(())
    }

    #[test]
    fn response_digest_invalidates_all_raw_items_and_checkpoint_on_visible_edits()
    -> Result<(), Error> {
        let content = json!([
            {"type":"reasoning","text":"Plan"},
            {"type":"text","text":"Original"},
            {"type":"tool-call","id":"c","name":"lookup","arguments":"{ \"q\" : 1 }"}
        ]);
        let items = json!([
            {"id":"r","type":"reasoning","summary":[{"type":"summary_text","text":"Plan"}],"encrypted_content":"opaque"},
            {"id":"m","type":"message","role":"assistant","content":[{"type":"output_text","text":"Original"}]},
            {"id":"f","type":"function_call","call_id":"c","name":"lookup","arguments":"{ \"q\" : 1 }"}
        ]);
        let mut options = json!({"model":"test","reasoningEffort":"high","cachePreservingReasoning":true,"messages":[]});
        let mut request = from_host(&options.to_string())?;
        let checkpoint = reasoning_cache::prepare(&mut request, "account", true)?
            .ok_or(Error::Protocol("Missing test checkpoint"))?
            .complete(
                items
                    .as_array()
                    .ok_or(Error::Protocol("Missing test items"))?,
            )?;
        let digest = visible_content_digest(
            content
                .as_array()
                .ok_or(Error::Protocol("Missing test content"))?,
        )?;
        options["messages"] = json!([{"role":"assistant","content":content,"source":{"replayState":{"response":{
            "format":REPLAY_FORMAT_V2,"items":items,"contentDigest":digest,"reasoningCache":checkpoint
        }}}}]);
        let unchanged = from_host(&options.to_string())?;
        assert_eq!(json!(unchanged.input), items);
        assert!(unchanged.cache.previous.is_some());
        // Nonsemantic block metadata and source/usage never participate in the digest.
        let mut restored = options.clone();
        restored["messages"][0]["content"][0]["metadata"] = json!({"duration":1});
        restored["messages"][0]["source"]["usage"] = json!({"outputTokens":99});
        assert_eq!(json!(from_host(&restored.to_string())?.input), items);
        for (index, field, value) in [
            (0, "text", "Edited plan"),
            (0, "type", "text"),
            (1, "text", "Edited text"),
            (2, "id", "other-call"),
            (2, "name", "other-tool"),
            (2, "arguments", "{\"q\":1}"),
        ] {
            let mut edited = options.clone();
            edited["messages"][0]["content"][index][field] = json!(value);
            let fallback = from_host(&edited.to_string())?;
            assert!(fallback.cache.previous.is_none(), "{index}/{field}");
            assert!(fallback.input.iter().all(|item| item.get("encrypted_content").is_none() && item.get("id").is_none()), "{index}/{field}");
            if index == 1 {
                assert_eq!(fallback.input[0]["content"], value);
            }
            if index == 2 {
                let wire_field = if field == "id" { "call_id" } else { field };
                assert_eq!(fallback.input[1][wire_field], value);
            }
        }
        for change in ["truncate", "reorder"] {
            let mut edited = options.clone();
            let content = edited["messages"][0]["content"]
                .as_array_mut()
                .ok_or(Error::Protocol("Missing test content"))?;
            if change == "truncate" {
                content.pop();
            } else {
                content.swap(0, 1);
            }
            assert!(from_host(&edited.to_string())?.cache.previous.is_none());
        }
        Ok(())
    }

    #[test]
    fn empty_saved_replay_keeps_existing_text_and_tool_calls() -> Result<(), Error> {
        let options = json!({"model":"test","messages":[
            {"role":"assistant","content":[
                {"type":"text","text":"Looking up"},
                {"type":"tool-call","id":"call_test","name":"lookup","arguments":"{}"}
            ],"source":{"replayState":{"response":{"format":REPLAY_FORMAT,"trailing":[]},"blocks":[{"items":[]},{"items":[]}]}}},
            {"role":"tool","toolCallId":"call_test","content":[{"type":"text","text":"result"}]}
        ]});
        let request = from_host(&options.to_string())?;
        assert_eq!(request.input.len(), 3);
        assert_eq!(request.input[0]["content"], "Looking up");
        assert_eq!(request.input[1]["type"], "function_call");
        assert_eq!(request.input[1]["call_id"], request.input[2]["call_id"]);
        Ok(())
    }

    #[test]
    fn projects_tools_and_replays_encrypted_items_without_summary_duplication() -> Result<(), Error>
    {
        let item = json!({"type":"reasoning","id":"rs_test","summary":[{"type":"summary_text","text":"summary"}],"encrypted_content":"opaque"});
        let trailing = json!({"type":"web_search_call","id":"legacy-search","action":{"type":"search","query":"example"}});
        let options = json!({"model":"test","messages":[
            {"role":"assistant","content":[{"type":"reasoning","text":"summary"}],
             "source":{"replayState":{"response":{"format":REPLAY_FORMAT,"trailing":[trailing]},"blocks":[{"items":[item]}]}}},
            {"role":"assistant","content":[{"type":"tool-call","id":"call_test","name":"lookup","arguments":"{}"}]},
            {"role":"tool","toolCallId":"call_test","content":[{"type":"text","text":"result"}]}
        ],"tools":[{"name":"lookup","description":"lookup","parameters":{"type":"object"}}]});
        let request = from_host(&options.to_string())?;
        assert_eq!(request.input.len(), 4);
        assert_eq!(request.input[0], item);
        assert_eq!(request.input[1], trailing);
        assert_eq!(request.input[2]["call_id"], "call_test");
        assert_eq!(request.input[3]["output"], "result");
        let mut edited = options.clone();
        edited["messages"][0]["content"][0]["text"] = json!("Edited summary");
        let fallback = from_host(&edited.to_string())?;
        assert_eq!(fallback.input.len(), 2);
        assert_eq!(fallback.input[0]["call_id"], "call_test");
        assert!(fallback.cache.previous.is_none());
        assert_eq!(
            request
                .tools
                .as_ref()
                .and_then(|t| t.first())
                .map(|t| &t["strict"]),
            Some(&json!(false))
        );
        Ok(())
    }
}
