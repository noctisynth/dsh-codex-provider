use serde::Deserialize;
use serde_json::{Value, json};

use super::Request;
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
    max_tokens: Option<u32>,
    temperature: Option<f64>,
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

pub(crate) fn from_host(json: &str) -> Result<Request, Error> {
    let options: GenerateOptions = serde_json::from_str(json)
        .map_err(|_| Error::Protocol("Invalid DSH generation request"))?;
    let mut input = Vec::new();
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
            .filter(|r| message.role == "assistant" && r["response"]["format"] == REPLAY_FORMAT);
        for (index, block) in message.content.iter().enumerate() {
            if let Some(items) = replay.and_then(|r| r["blocks"][index]["items"].as_array()) {
                input.extend(items.iter().cloned());
                continue;
            }
            match block["type"].as_str() {
                Some("text") => input.push(json!({"role":message.role,"content":text(block)})),
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
    Ok(Request {
        model: options.model,
        input,
        instructions: options.system,
        tools: options.tools.map(|tools| {
            tools
                .into_iter()
                .map(|t| {
                    json!({
                        "type":"function","name":t.name,"description":t.description,
                        "parameters":t.parameters,"strict":false
                    })
                })
                .collect()
        }),
        reasoning: Some(match options.reasoning_effort {
            Some(effort) => json!({"summary":"auto","effort":effort}),
            None => json!({"summary":"auto"}),
        }),
        max_output_tokens: options.max_tokens,
        temperature: options.temperature,
        include: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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
