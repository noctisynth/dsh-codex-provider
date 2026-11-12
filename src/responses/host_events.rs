use serde_json::{Value, json};
use std::collections::BTreeMap;

use super::host_request::{REPLAY_FORMAT_V2, visible_content_digest};
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

impl Block {
    fn content(&self) -> Value {
        if self.kind == "tool-call" {
            json!({"type":"tool-call","id":self.call_id,"name":self.name,"arguments":self.text})
        } else {
            json!({"type":self.kind,"text":self.text})
        }
    }
}

// Completion items are final field values, not necessarily complete records.
// This is deliberately a shallow item merge, not a generic JSON deep merge.
fn merge_item(previous: &Value, final_item: &Value) -> Result<Value, Error> {
    let mut merged = previous
        .as_object()
        .cloned()
        .ok_or(Error::Protocol("OpenAI output item is not an object"))?;
    let final_item = final_item
        .as_object()
        .ok_or(Error::Protocol("OpenAI output item is not an object"))?;
    for key in ["id", "type", "call_id", "name"] {
        if let (Some(previous), Some(current)) = (merged.get(key), final_item.get(key))
            && previous != current
        {
            return Err(Error::Protocol("OpenAI output item identity conflicts"));
        }
    }
    for (key, value) in final_item {
        if key == "encrypted_content"
            && (value.is_null() || value.as_str() == Some(""))
            && merged
                .get(key)
                .and_then(Value::as_str)
                .is_some_and(|encrypted| !encrypted.is_empty())
        {
            continue;
        }
        merged.insert(key.clone(), value.clone());
    }
    Ok(Value::Object(merged))
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
            if value.is_some_and(|value| value != block.text) {
                return Err(Error::Protocol(
                    "OpenAI final content differs from its closed block",
                ));
            }
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
        let content = block.content();
        out.push(json!({"type":"block-end","index":index,"block":content}));
        Ok(())
    }

    fn item_done(&mut self, item: &Value, out: &mut Vec<Value>) -> Result<(), Error> {
        let id = required(item, "id")?;
        match item["type"].as_str() {
            Some("function_call") => {
                let index = self.block(id, 0, "tool-call", item, out);
                let block = &self.blocks[index];
                if item
                    .get("call_id")
                    .is_some_and(|call_id| call_id != &block.call_id)
                    || item.get("name").is_some_and(|name| name != &block.name)
                {
                    return Err(Error::Protocol("OpenAI tool call identity conflicts"));
                }
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
                    if self.blocks.iter().any(|block| {
                        block.item_id == id
                            && block.part >= parts.len() as u64
                            && !block.text.is_empty()
                    }) {
                        return Err(Error::Protocol(
                            "OpenAI final content omitted streamed parts",
                        ));
                    }
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

    fn merged_output(&self, completed: &[Value]) -> Result<Vec<Value>, Error> {
        let mut output = self.output.clone();
        let mut completed_indices = Vec::new();
        for (position, item) in completed.iter().enumerate() {
            // A sparse completed array can omit done items, so its array position
            // cannot override the native index of an already identified item.
            let index = item["id"]
                .as_str()
                .and_then(|id| {
                    output
                        .iter()
                        .find(|(_, saved)| saved["id"] == id)
                        .map(|(index, _)| *index)
                })
                .unwrap_or(position as u64);
            if !completed_indices.contains(&index) {
                if completed_indices.last().is_some_and(|last| *last > index) {
                    return Err(Error::Protocol("OpenAI completed output order conflicts"));
                }
                completed_indices.push(index);
            }
            let merged = match output.get(&index) {
                Some(previous) => merge_item(previous, item)?,
                None => item.clone(),
            };
            output.insert(index, merged);
        }
        Ok(output.into_values().collect())
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
                let index = event["output_index"]
                    .as_u64()
                    .ok_or(Error::Protocol("OpenAI output item omitted its index"))?;
                let id = required(&event["item"], "id")?;
                if self
                    .output
                    .iter()
                    .any(|(saved_index, item)| *saved_index != index && item["id"] == id)
                {
                    return Err(Error::Protocol("OpenAI output item index conflicts"));
                }
                let item = match self.output.get(&index) {
                    Some(previous) => merge_item(previous, &event["item"])?,
                    None => event["item"].clone(),
                };
                self.item_done(&item, &mut out)?;
                self.output.insert(index, item);
            }
            "response.completed" => {
                let completed_output = event["response"]["output"]
                    .as_array()
                    .ok_or(Error::Protocol("OpenAI completed response omitted output"))?;
                let output = self.merged_output(completed_output)?;
                for item in &output {
                    self.item_done(item, &mut out)?;
                }
                let visible: Vec<_> = self.blocks.iter().map(Block::content).collect();
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
                    "response":{
                        "format":REPLAY_FORMAT_V2,"items":output,
                        "contentDigest":visible_content_digest(&visible)?
                    }
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

// Legacy envelopes have no stored edit digest. Validate only what their saved
// item order can actually reproduce; this cannot recover their lost global order.
pub(super) fn replay_content_digest(items: &[Value]) -> Result<String, Error> {
    let mut mapper = Mapper::default();
    let mut ignored = Vec::new();
    for item in items {
        mapper.item_done(item, &mut ignored)?;
    }
    let visible: Vec<_> = mapper.blocks.iter().map(Block::content).collect();
    visible_content_digest(&visible)
}

#[cfg(test)]
mod tests {
    use super::*;

    // The host persists blocks in first-seen index order, not block-end order.
    fn visible_blocks(chunks: &[Value]) -> Vec<Value> {
        chunks
            .iter()
            .filter(|chunk| chunk["type"] == "block-end")
            .filter_map(|chunk| {
                chunk["index"]
                    .as_u64()
                    .map(|index| (index, chunk["block"].clone()))
            })
            .collect::<BTreeMap<_, _>>()
            .into_values()
            .collect()
    }

    #[test]
    fn sparse_completion_keeps_done_fields_and_nonempty_encryption() -> Result<(), Error> {
        let reasoning = json!({"id":"r","type":"reasoning","summary":[{"type":"summary_text","text":"Plan"}],"encrypted_content":"done-encrypted","status":"completed"});
        let call = json!({"id":"f","type":"function_call","call_id":"c","name":"lookup","arguments":"{ \"q\" : 1 }"});
        for encrypted in [
            None,
            Some(Value::Null),
            Some(json!("")),
            Some(json!("final-encrypted")),
        ] {
            let mut mapper = Mapper::default();
            let mut chunks = mapper.accept(
                json!({"type":"response.output_item.done","output_index":0,"item":reasoning}),
            )?;
            chunks.extend(mapper.accept(
                json!({"type":"response.output_item.done","output_index":1,"item":call}),
            )?);
            let mut final_reasoning = json!({"id":"r","type":"reasoning"});
            if let Some(value) = &encrypted {
                final_reasoning["encrypted_content"] = value.clone();
            }
            let final_chunks = mapper.accept(
                json!({"type":"response.completed","response":{"output":[final_reasoning]}}),
            )?;
            assert!(
                !final_chunks
                    .iter()
                    .any(|chunk| chunk["type"] == "block-end")
            );
            chunks.extend(final_chunks);
            let replay = &chunks.last().ok_or(Error::Protocol("Missing finish"))?["replayState"];
            let mut expected = reasoning.clone();
            if encrypted == Some(json!("final-encrypted")) {
                expected["encrypted_content"] = json!("final-encrypted");
            }
            assert_eq!(replay["response"]["items"], json!([expected, call]));
            assert_eq!(replay["response"]["format"], REPLAY_FORMAT_V2);
            assert!(replay.get("blocks").is_none());
            assert!(replay["response"].get("trailing").is_none());
            assert_eq!(
                replay["response"]["contentDigest"],
                visible_content_digest(&visible_blocks(&chunks))?
            );
        }
        Ok(())
    }

    #[test]
    fn completion_enriches_done_and_deduplicates_only_the_same_identity() -> Result<(), Error> {
        let mut mapper = Mapper::default();
        let poor = json!({"id":"r","type":"reasoning","summary":[]});
        mapper.accept(json!({"type":"response.output_item.done","output_index":0,"item":poor}))?;
        mapper.accept(json!({"type":"response.output_item.done","output_index":0,"item":poor}))?;
        let rich = json!({"id":"r","type":"reasoning","summary":[],"encrypted_content":"final"});
        let first = json!({"id":"f1","type":"function_call","call_id":"same-call","name":"lookup","arguments":"{}"});
        let second = json!({"id":"f2","type":"function_call","call_id":"same-call","name":"lookup","arguments":"{}"});
        let chunks = mapper.accept(
            json!({"type":"response.completed","response":{"output":[rich,rich,first,second]}}),
        )?;
        assert_eq!(
            chunks.last().ok_or(Error::Protocol("Missing finish"))?["replayState"]["response"]["items"],
            json!([rich, first, second])
        );
        Ok(())
    }

    #[test]
    fn identity_index_order_and_closed_body_conflicts_are_protocol_errors() -> Result<(), Error> {
        let item = json!({"id":"m","type":"message","role":"assistant","content":[{"type":"output_text","text":"OK"}]});
        for (index, changed) in [
            (1, item.clone()),
            (0, json!({"id":"other","type":"message","content":[]})),
            (0, json!({"id":"m","type":"reasoning","summary":[]})),
        ] {
            let mut mapper = Mapper::default();
            mapper
                .accept(json!({"type":"response.output_item.done","output_index":0,"item":item}))?;
            assert!(matches!(
                mapper.accept(
                    json!({"type":"response.output_item.done","output_index":index,"item":changed})
                ),
                Err(Error::Protocol(_))
            ));
        }
        for changed in [
            json!({"id":"other","type":"message","content":[]}),
            json!({"id":"m","type":"reasoning","summary":[]}),
            json!({"id":"m","type":"message","content":[]}),
            json!({"id":"m","type":"message","content":[{"type":"output_text","text":"Different"}]}),
            json!({"id":"m","type":"message","content":[{"type":"output_text","text":"OK appended"}]}),
        ] {
            let mut mapper = Mapper::default();
            mapper
                .accept(json!({"type":"response.output_item.done","output_index":0,"item":item}))?;
            assert!(matches!(
                mapper.accept(json!({"type":"response.completed","response":{"output":[changed]}})),
                Err(Error::Protocol(_))
            ));
        }
        let mut mapper = Mapper::default();
        mapper.accept(json!({"type":"response.output_item.done","output_index":0,"item":item}))?;
        let search = json!({"id":"s","type":"web_search_call"});
        mapper
            .accept(json!({"type":"response.output_item.done","output_index":1,"item":search}))?;
        assert!(matches!(
            mapper.accept(json!({"type":"response.completed","response":{"output":[search,item]}})),
            Err(Error::Protocol(_))
        ));
        let call =
            json!({"id":"f","type":"function_call","call_id":"c","name":"lookup","arguments":"{}"});
        for event_type in ["response.output_item.added", "response.output_item.done"] {
            for field in ["call_id", "name"] {
                let mut mapper = Mapper::default();
                mapper.accept(json!({"type":event_type,"output_index":0,"item":call}))?;
                let mut changed = call.clone();
                changed[field] = json!("different");
                assert!(matches!(
                    mapper.accept(
                        json!({"type":"response.completed","response":{"output":[changed]}})
                    ),
                    Err(Error::Protocol(_))
                ));
            }
        }
        let mut mapper = Mapper::default();
        let reasoning =
            json!({"id":"r","type":"reasoning","summary":[{"type":"summary_text","text":"Plan"}]});
        mapper.accept(
            json!({"type":"response.output_item.done","output_index":0,"item":reasoning}),
        )?;
        assert!(matches!(mapper.accept(json!({"type":"response.completed","response":{"output":[{"id":"r","type":"reasoning","summary":[]}]}})), Err(Error::Protocol(_))));
        Ok(())
    }

    #[test]
    fn response_items_survive_first_seen_order_multiple_parts_and_serialized_restore()
    -> Result<(), Error> {
        let mut options = json!({"model":"test","reasoningEffort":"high","cachePreservingReasoning":true,"messages":[{"role":"user","content":[{"type":"text","text":"First"}]}]});
        let mut first = super::super::from_host(&options.to_string())?;
        let pending = super::super::reasoning_cache::prepare(&mut first, "account", true)?;
        let mut mapper = Mapper::new(pending);
        let reasoning = json!({"id":"r","type":"reasoning","summary":[{"type":"summary_text","text":"Plan"}],"encrypted_content":"opaque"});
        let search = json!({"id":"s","type":"web_search_call","action":{"type":"search","query":"example","sources":[{"url":"https://example.com/"}]}});
        let invisible =
            json!({"id":"hidden","type":"reasoning","summary":[],"encrypted_content":"hidden"});
        let message = json!({"id":"m","type":"message","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"One"},{"type":"output_text","text":"Two"}]});
        let call = json!({"id":"f","type":"function_call","call_id":"c","name":"lookup","arguments":"{ \"q\" : 1 }"});
        let trailing = json!({"id":"trailing","type":"web_search_call","action":{"type":"open_page","url":"https://example.com/"}});
        let mut chunks = Vec::new();
        for event in [
            json!({"type":"response.output_text.delta","item_id":"m","content_index":1,"delta":"Two"}),
            json!({"type":"response.output_item.added","item":call}),
            json!({"type":"response.function_call_arguments.delta","item_id":"f","delta":"{ \"q\" : 1 }"}),
            json!({"type":"response.reasoning_summary_text.delta","item_id":"r","summary_index":0,"delta":"Plan"}),
            json!({"type":"response.output_text.delta","item_id":"m","content_index":0,"delta":"One"}),
        ] {
            chunks.extend(mapper.accept(event)?);
        }
        let output = vec![
            reasoning.clone(),
            search.clone(),
            invisible.clone(),
            message.clone(),
            call.clone(),
            trailing.clone(),
        ];
        for index in [4, 3, 0, 1, 2, 5] {
            chunks.extend(mapper.accept(json!({"type":"response.output_item.done","output_index":index,"item":output[index]}))?);
        }
        chunks.extend(mapper.accept(json!({"type":"response.completed","response":{"output":[{"id":"r","type":"reasoning","encrypted_content":null},{"id":"m","type":"message","phase":"final_answer"},{"id":"f","type":"function_call"}]}}))?);
        let content = visible_blocks(&chunks);
        assert_eq!(content[0]["text"], "Two");
        assert_eq!(content[1]["type"], "tool-call");
        assert_eq!(content[2]["text"], "Plan");
        assert_eq!(content[3]["text"], "One");
        let replay = &chunks.last().ok_or(Error::Protocol("Missing finish"))?["replayState"];
        let mut expected = output;
        expected[3]["phase"] = json!("final_answer");
        assert_eq!(replay["response"]["items"], json!(expected));
        options["messages"]
            .as_array_mut()
            .ok_or(Error::Protocol("Missing history"))?
            .push(json!({"role":"assistant","content":content,"source":{"replayState":replay}}));
        options =
            serde_json::from_str(&options.to_string()).map_err(|_| Error::Protocol("Test JSON"))?;
        let mut restored = super::super::from_host(&options.to_string())?;
        assert_eq!(restored.input[..first.input.len()], first.input);
        assert_eq!(restored.input[first.input.len()..], expected);
        // A real switch proves Pending hashed the same merged items the reader replays.
        options["reasoningEffort"] = json!("max");
        restored = super::super::from_host(&options.to_string())?;
        super::super::reasoning_cache::prepare(&mut restored, "account", true)?;
        assert_eq!(
            restored.reasoning.as_ref().map(|r| &r["effort"]),
            Some(&json!("high"))
        );
        assert_eq!(
            restored
                .input
                .last()
                .map(|item| &item["reasoning"]["effort"]),
            Some(&json!("max"))
        );
        Ok(())
    }

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
        assert_eq!(finish["replayState"]["response"]["items"][0], search);
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
        assert_eq!(chunks[2]["replayState"]["response"]["items"][0], reasoning);
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
