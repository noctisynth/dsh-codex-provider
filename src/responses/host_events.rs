use serde_json::{Value, json};
use std::collections::BTreeMap;

use super::host_request::REPLAY_FORMAT;
use super::reasoning_cache::Pending;
use crate::error::Error;

struct Block {
    item_id: String,
    part: u64,
    kind: &'static str,
    text: String,
    call_id: String,
    name: String,
    ended: bool,
}

#[derive(Default)]
pub(super) struct Mapper {
    blocks: Vec<Block>,
    output: BTreeMap<u64, Value>,
    reasoning_cache: Option<Pending>,
}

fn required<'a>(value: &'a Value, key: &str) -> Result<&'a str, Error> {
    value[key]
        .as_str()
        .ok_or(Error::Protocol("OpenAI event omitted a required string"))
}

fn with_citations(text: &str, content: &Value) -> String {
    let mut result = text.to_owned();
    let mut links = Vec::new();
    if let Some(annotations) = content["annotations"].as_array() {
        for annotation in annotations {
            if annotation["type"] != "url_citation" {
                continue;
            }
            let Some(url) = annotation["url"]
                .as_str()
                .and_then(|url| reqwest::Url::parse(url).ok())
            else {
                continue;
            };
            if !matches!(url.scheme(), "http" | "https") || links.contains(&url) {
                continue;
            }
            links.push(url);
        }
    }
    if !links.is_empty() {
        result.push_str("\n\n");
        for (index, url) in links.iter().enumerate() {
            if index > 0 {
                result.push(' ');
            }
            result.push_str(&format!(
                "[来源 {}](<{}>)",
                index + 1,
                url.as_str().replace('>', "%3E").replace('<', "%3C")
            ));
        }
    }
    result
}

impl Mapper {
    pub(super) fn new(reasoning_cache: Option<Pending>) -> Self {
        Self {
            reasoning_cache,
            ..Self::default()
        }
    }

    fn block(
        &mut self,
        id: &str,
        part: u64,
        kind: &'static str,
        item: &Value,
        out: &mut Vec<Value>,
    ) -> usize {
        if let Some(index) = self
            .blocks
            .iter()
            .position(|b| b.item_id == id && b.part == part && b.kind == kind)
        {
            return index;
        }
        let index = self.blocks.len();
        self.blocks.push(Block {
            item_id: id.into(),
            part,
            kind,
            text: String::new(),
            call_id: item["call_id"].as_str().unwrap_or_default().into(),
            name: item["name"].as_str().unwrap_or_default().into(),
            ended: false,
        });
        out.push(json!({"type":"block-start","index":index,"blockType":kind}));
        if kind == "tool-call" {
            let b = &self.blocks[index];
            out.push(json!({"type":"tool-call-delta","index":index,"id":b.call_id,"name":b.name,"argumentsDelta":""}));
        }
        index
    }

    fn delta(&mut self, index: usize, delta: &str, out: &mut Vec<Value>) {
        let block = &mut self.blocks[index];
        block.text.push_str(delta);
        out.push(match block.kind {
            "tool-call" => json!({"type":"tool-call-delta","index":index,"id":block.call_id,"argumentsDelta":delta}),
            "reasoning" => json!({"type":"reasoning-delta","index":index,"text":delta}),
            _ => json!({"type":"text-delta","index":index,"text":delta}),
        });
    }

    fn close(
        &mut self,
        index: usize,
        value: Option<&str>,
        out: &mut Vec<Value>,
    ) -> Result<(), Error> {
        let block = &self.blocks[index];
        if block.ended {
            return Ok(());
        }
        if let Some(value) = value {
            let suffix = value.strip_prefix(&block.text).ok_or(Error::Protocol(
                "OpenAI final content differs from its streamed prefix",
            ))?;
            if !suffix.is_empty() {
                self.delta(index, suffix, out);
            }
        }
        let block = &mut self.blocks[index];
        block.ended = true;
        let content = if block.kind == "tool-call" {
            json!({"type":"tool-call","id":block.call_id,"name":block.name,"arguments":block.text})
        } else {
            json!({"type":block.kind,"text":block.text})
        };
        out.push(json!({"type":"block-end","index":index,"block":content}));
        Ok(())
    }

    fn item_done(&mut self, item: &Value, out: &mut Vec<Value>) -> Result<(), Error> {
        let id = required(item, "id")?;
        match item["type"].as_str() {
            Some("function_call") => {
                let index = self.block(id, 0, "tool-call", item, out);
                self.close(index, Some(required(item, "arguments")?), out)?;
            }
            Some("message") | Some("reasoning") => {
                let reasoning = item["type"] == "reasoning";
                let parts = if reasoning {
                    &item["summary"]
                } else {
                    &item["content"]
                };
                if let Some(parts) = parts.as_array() {
                    for (part, content) in parts.iter().enumerate() {
                        let text = match content["type"].as_str() {
                            Some("output_text") | Some("summary_text") => {
                                required(content, "text")?
                            }
                            Some("refusal") => required(content, "refusal")?,
                            _ => return Err(Error::Protocol("Unsupported OpenAI output content")),
                        };
                        let index = self.block(
                            id,
                            part as u64,
                            if reasoning { "reasoning" } else { "text" },
                            item,
                            out,
                        );
                        let visible = if reasoning {
                            text.to_owned()
                        } else {
                            with_citations(text, content)
                        };
                        self.close(index, Some(&visible), out)?;
                    }
                }
            }
            Some("web_search_call") => {}
            _ => return Err(Error::Protocol("Unsupported OpenAI output item")),
        }
        Ok(())
    }

    pub(super) fn accept(&mut self, event: Value) -> Result<Vec<Value>, Error> {
        let mut out = Vec::new();
        match required(&event, "type")? {
            "response.output_item.added" if event["item"]["type"] == "function_call" => {
                self.block(
                    required(&event["item"], "id")?,
                    0,
                    "tool-call",
                    &event["item"],
                    &mut out,
                );
            }
            "response.output_text.delta"
            | "response.refusal.delta"
            | "response.reasoning_summary_text.delta"
            | "response.function_call_arguments.delta" => {
                let kind = match event["type"].as_str() {
                    Some("response.reasoning_summary_text.delta") => "reasoning",
                    Some("response.function_call_arguments.delta") => "tool-call",
                    _ => "text",
                };
                let part = event[if kind == "reasoning" {
                    "summary_index"
                } else {
                    "content_index"
                }]
                .as_u64()
                .unwrap_or(0);
                let id = required(&event, "item_id")?;
                if kind == "tool-call" && !self.blocks.iter().any(|b| b.item_id == id) {
                    return Err(Error::Protocol("OpenAI tool delta arrived before its item"));
                }
                let index = self.block(id, part, kind, &Value::Null, &mut out);
                self.delta(index, required(&event, "delta")?, &mut out);
            }
            "response.output_item.done" => {
                self.item_done(&event["item"], &mut out)?;
                let index = event["output_index"]
                    .as_u64()
                    .ok_or(Error::Protocol("OpenAI output item omitted its index"))?;
                self.output.insert(index, event["item"].clone());
            }
            "response.completed" => {
                let completed_output = event["response"]["output"]
                    .as_array()
                    .ok_or(Error::Protocol("OpenAI completed response omitted output"))?;
                // Subscription streams can finish with an empty output array after emitting item.done.
                let output = if completed_output.is_empty() {
                    self.output.values().cloned().collect::<Vec<_>>()
                } else {
                    completed_output.clone()
                };
                for item in &output {
                    self.item_done(item, &mut out)?;
                }
                let mut replay_blocks = vec![json!({"items":[]}); self.blocks.len()];
                let mut pending = Vec::new();
                for item in &output {
                    pending.push(item.clone());
                    if let Some(index) = self.blocks.iter().position(|b| item["id"] == b.item_id) {
                        replay_blocks[index] = json!({"items":std::mem::take(&mut pending)});
                    }
                }
                let usage = &event["response"]["usage"];
                if let (Some(input), Some(output)) = (
                    usage["input_tokens"].as_u64(),
                    usage["output_tokens"].as_u64(),
                ) {
                    let cached = usage["input_tokens_details"]["cached_tokens"]
                        .as_u64()
                        .unwrap_or(0);
                    let written = usage["input_tokens_details"]["cache_write_tokens"]
                        .as_u64()
                        .unwrap_or(0);
                    out.push(json!({"type":"usage","usage":{
                        "inputTokens":input.saturating_sub(cached).saturating_sub(written),
                        "cacheReadTokens":cached,"cacheWriteTokens":written,"outputTokens":output,
                        "totalTokens":input+output,"reasoningTokens":usage["output_tokens_details"]["reasoning_tokens"].as_u64().unwrap_or(0)
                    }}));
                }
                let reason = if self.blocks.iter().any(|b| b.kind == "tool-call") {
                    "tool-calls"
                } else {
                    "stop"
                };
                let mut replay = json!({
                    "response":{"format":REPLAY_FORMAT,"trailing":pending},"blocks":replay_blocks
                });
                if let Some(cache) = self.reasoning_cache.take() {
                    replay["response"]["reasoningCache"] = cache.complete(&output)?;
                }
                out.push(json!({"type":"finish","reason":{"kind":reason},"replayState":replay}));
            }
            _ => {}
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_search_is_replayed_with_clickable_citations_and_no_client_tool_call()
    -> Result<(), Error> {
        let mut mapper = Mapper::default();
        let search = json!({"id":"ws_test","type":"web_search_call","status":"completed","action":{"sources":[{"url":"https://example.com/"}]}});
        let message = json!({"id":"msg_test","type":"message","role":"assistant","content":[{"type":"output_text","text":"Answer","annotations":[{"type":"url_citation","url":"https://example.com/"}]}]});
        let mut chunks = mapper
            .accept(json!({"type":"response.output_item.done","output_index":0,"item":search}))?;
        chunks.extend(
            mapper.accept(
                json!({"type":"response.output_item.done","output_index":1,"item":message}),
            )?,
        );
        chunks
            .extend(mapper.accept(json!({"type":"response.completed","response":{"output":[]}}))?);
        assert!(!chunks.iter().any(|chunk| chunk["blockType"] == "tool-call"));
        let block = chunks
            .iter()
            .find(|chunk| chunk["type"] == "block-end")
            .ok_or(Error::Protocol("Missing text"))?;
        assert!(
            block["block"]["text"]
                .as_str()
                .is_some_and(|text| text.contains("[来源 1](<https://example.com/>)"))
        );
        let finish = chunks.last().ok_or(Error::Protocol("Missing finish"))?;
        assert_eq!(finish["reason"]["kind"], "stop");
        assert_eq!(finish["replayState"]["blocks"][0]["items"][0], search);
        Ok(())
    }

    #[test]
    fn empty_completion_replays_finished_items_before_their_tool_result() -> Result<(), Error> {
        let mut mapper = Mapper::default();
        let call = json!({"type":"function_call","id":"fc_test","call_id":"call_test","name":"lookup","arguments":"{}"});
        let reasoning =
            json!({"type":"reasoning","id":"rs_test","summary":[],"encrypted_content":"opaque"});
        let mut chunks = mapper
            .accept(json!({"type":"response.output_item.done","output_index":1,"item":call}))?;
        chunks.extend(mapper.accept(
            json!({"type":"response.output_item.done","output_index":0,"item":reasoning}),
        )?);
        chunks
            .extend(mapper.accept(json!({"type":"response.completed","response":{"output":[]}}))?);
        let finish = chunks
            .iter()
            .find(|chunk| chunk["type"] == "finish")
            .ok_or(Error::Protocol("Test response omitted finish"))?;
        let blocks = chunks
            .iter()
            .filter(|chunk| chunk["type"] == "block-end")
            .map(|chunk| chunk["block"].clone())
            .collect::<Vec<_>>();
        let options = json!({"model":"test","messages":[
            {"role":"user","content":[{"type":"text","text":"Look up the result"}]},
            {"role":"assistant","content":blocks,"source":{"replayState":finish["replayState"]}},
            {"role":"tool","toolCallId":"call_test","content":[{"type":"text","text":"result"}]}
        ]});
        let request = super::super::from_host(&options.to_string())?;
        assert_eq!(request.input[1], reasoning);
        assert_eq!(request.input[2], call);
        assert_eq!(request.input[3]["type"], "function_call_output");
        assert_eq!(request.input[3]["call_id"], request.input[2]["call_id"]);
        Ok(())
    }

    #[test]
    fn tool_stream_finishes_with_disjoint_usage_and_lossless_replay() -> Result<(), Error> {
        let mut mapper = Mapper::default();
        let item = json!({"type":"function_call","id":"fc_test","call_id":"call_test","name":"lookup","arguments":""});
        let start = mapper.accept(json!({"type":"response.output_item.added","item":item}))?;
        assert_eq!(start[1]["id"], "call_test");
        mapper.accept(json!({"type":"response.function_call_arguments.delta","item_id":"fc_test","delta":"{}"}))?;
        let mut final_item = item;
        final_item["arguments"] = json!("{}");
        let reasoning =
            json!({"type":"reasoning","id":"rs_test","summary":[],"encrypted_content":"opaque"});
        let chunks = mapper.accept(json!({"type":"response.completed","response":{
            "output":[reasoning,final_item],"usage":{"input_tokens":10,"input_tokens_details":{"cached_tokens":4},"output_tokens":3}
        }}))?;
        assert_eq!(chunks[0]["block"]["arguments"], "{}");
        assert_eq!(chunks[1]["usage"]["inputTokens"], 6);
        assert_eq!(chunks[1]["usage"]["cacheWriteTokens"], 0);
        assert_eq!(chunks[1]["usage"]["totalTokens"], 13);
        assert_eq!(chunks[2]["reason"]["kind"], "tool-calls");
        assert_eq!(chunks[2]["replayState"]["blocks"][0]["items"][0], reasoning);
        Ok(())
    }

    #[test]
    fn cache_writes_are_disjoint_from_reads_and_ordinary_input() -> Result<(), Error> {
        let chunks = Mapper::default().accept(json!({"type":"response.completed","response":{
            "output":[],"usage":{
                "input_tokens":12000,"input_tokens_details":{
                    "cached_tokens":4000,"cache_write_tokens":7000,
                    "cache_write_tokens_details":{"ttl_30m_tokens":3000,"ttl_12h_tokens":4000}
                },"output_tokens":300,"output_tokens_details":{"reasoning_tokens":200}
            }
        }}))?;
        let usage = &chunks[0]["usage"];
        assert_eq!(usage["inputTokens"], 1000);
        assert_eq!(usage["cacheReadTokens"], 4000);
        assert_eq!(usage["cacheWriteTokens"], 7000);
        assert_eq!(usage["outputTokens"], 300);
        assert_eq!(usage["reasoningTokens"], 200);
        assert_eq!(usage["totalTokens"], 12300);
        assert_eq!(
            usage["inputTokens"].as_u64().unwrap_or_default()
                + usage["cacheReadTokens"].as_u64().unwrap_or_default()
                + usage["cacheWriteTokens"].as_u64().unwrap_or_default()
                + usage["outputTokens"].as_u64().unwrap_or_default(),
            usage["totalTokens"]
        );
        Ok(())
    }
}
