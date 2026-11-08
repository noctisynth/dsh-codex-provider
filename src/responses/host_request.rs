use serde::Deserialize;
use serde_json::{Value, json};

use super::{Request, reasoning_cache};
use crate::error::Error;

pub(super) const REPLAY_FORMAT: &str = "dsh-codex-provider/responses";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateOptions {
    model: String,
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

fn has_replay_items(replay: &Value) -> bool {
    replay["response"]["trailing"]
        .as_array()
        .is_some_and(|items| !items.is_empty())
        || replay["blocks"].as_array().is_some_and(|blocks| {
            blocks.iter().any(|block| {
                block["items"]
                    .as_array()
                    .is_some_and(|items| !items.is_empty())
            })
        })
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
            let output = message
                .content
                .iter()
                .filter(|b| b["type"] == "text")
                .map(text)
                .collect::<Vec<_>>()
                .join("\n");
            input.push(json!({"type":"function_call_output","call_id":call_id,"output":output}));
            continue;
        }
        if !matches!(
            message.role.as_str(),
            "system" | "developer" | "user" | "assistant"
        ) {
            return Err(Error::Protocol("Unsupported DSH message role"));
        }
        let replay = message
            .source
            .as_ref()
            .and_then(|s| s.get("replayState"))
            .filter(|r| message.role == "assistant" && r["response"]["format"] == REPLAY_FORMAT)
            // Older empty completion snapshots must not suppress the persisted visible blocks.
            .filter(|r| has_replay_items(r));
        let start = input.len();
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
        input,
        instructions: options.system,
        tools: if tools.is_empty() { None } else { Some(tools) },
        tool_choice: options.search_only.then(|| json!({"type":"web_search"})),
        reasoning: Some(match options.reasoning_effort {
            Some(effort) => json!({"summary":"auto","effort":effort}),
            None => json!({"summary":"auto"}),
        }),
        include: options
            .web_search
            .then(|| vec!["web_search_call.action.sources".into()]),
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
    fn image_detail_reaches_every_retained_image_and_rejects_unknown_values() -> Result<(), Error> {
        let mut options = json!({"model":"vision","messages":[
            {"role":"user","content":[{"type":"image","imageUrl":"data:image/png;base64,one"}]},
            {"role":"user","content":[{"type":"image","imageUrl":"data:image/png;base64,two"}]}
        ]});
        for detail in ["auto", "low", "high", "original"] {
            options["imageDetail"] = json!(detail);
            let request = from_host(&options.to_string())?;
            for item in request.input {
                assert_eq!(item["content"][0]["detail"], detail);
            }
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
        options["webSearch"] = json!(true);
        options["searchOnly"] = json!(true);
        let search = serde_json::to_value(from_host(&options.to_string())?)?;
        assert_eq!(search["tools"][0]["type"], "web_search");
        assert_eq!(search["tool_choice"]["type"], "web_search");
        assert!(
            search["include"]
                .as_array()
                .is_some_and(|items| items.contains(&json!("web_search_call.action.sources")))
        );
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
        let item =
            json!({"type":"reasoning","id":"rs_test","summary":[],"encrypted_content":"opaque"});
        let options = json!({"model":"test","messages":[
            {"role":"assistant","content":[{"type":"reasoning","text":"summary"}],
             "source":{"replayState":{"response":{"format":REPLAY_FORMAT,"trailing":[]},"blocks":[{"items":[item]}]}}},
            {"role":"assistant","content":[{"type":"tool-call","id":"call_test","name":"lookup","arguments":"{}"}]},
            {"role":"tool","toolCallId":"call_test","content":[{"type":"text","text":"result"}]}
        ],"tools":[{"name":"lookup","description":"lookup","parameters":{"type":"object"}}]});
        let request = from_host(&options.to_string())?;
        assert_eq!(request.input.len(), 3);
        assert_eq!(request.input[0], item);
        assert_eq!(request.input[1]["call_id"], "call_test");
        assert_eq!(request.input[2]["output"], "result");
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
