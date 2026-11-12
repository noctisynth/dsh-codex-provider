use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::Request;
use crate::error::Error;

#[derive(Default)]
pub(super) struct Options {
    pub enabled: bool,
    pub previous: Option<Candidate>,
}

pub(super) struct Candidate {
    checkpoint: Checkpoint,
    start: usize,
    end: usize,
}

impl Candidate {
    pub fn from_replay(replay: &Value, start: usize, end: usize) -> Option<Self> {
        let checkpoint =
            serde_json::from_value(replay["response"]["reasoningCache"].clone()).ok()?;
        Some(Self {
            checkpoint,
            start,
            end,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    version: u8,
    scope: String,
    envelope: String,
    baseline: String,
    updates: Vec<Update>,
    input_len: usize,
    input_hash: String,
    output_hash: String,
}

#[derive(Deserialize, Serialize)]
struct Update {
    offset: usize,
    effort: String,
}

pub(super) struct Pending(Checkpoint);

impl Pending {
    pub fn complete(mut self, output: &[Value]) -> Result<Value, Error> {
        self.0.output_hash = hash(output)?;
        serde_json::to_value(self.0)
            .map_err(|_| Error::Protocol("Could not encode reasoning cache checkpoint"))
    }
}

fn hash(value: &(impl Serialize + ?Sized)) -> Result<String, Error> {
    let bytes = serde_json::to_vec(value)
        .map_err(|_| Error::Protocol("Could not encode reasoning cache prefix"))?;
    Ok(URL_SAFE_NO_PAD.encode(Sha256::digest(bytes)))
}

pub(super) fn prepare(
    request: &mut Request,
    account: &str,
    route_enabled: bool,
) -> Result<Option<Pending>, Error> {
    let options = std::mem::take(&mut request.cache);
    if !route_enabled || !options.enabled {
        return Ok(None);
    }
    let Some(effort) = request
        .reasoning
        .as_ref()
        .and_then(|r| r["effort"].as_str())
    else {
        return Ok(None);
    };
    let selected = effort.to_owned();
    let scope = hash(&account)?;
    let mut reasoning = request.reasoning.clone();
    if let Some(reasoning) = reasoning.as_mut().and_then(Value::as_object_mut) {
        reasoning.remove("effort");
    }
    let envelope = hash(&json!({
        "model":request.model, "instructions":request.instructions, "tools":request.tools,
        "tool_choice":request.tool_choice, "reasoning":reasoning, "include":request.include
    }))?;
    let mut checkpoint = Checkpoint {
        version: 1,
        scope,
        envelope,
        baseline: selected.clone(),
        updates: Vec::new(),
        input_len: request.input.len(),
        input_hash: hash(&request.input)?,
        output_hash: String::new(),
    };
    if let Some(previous) = options.previous {
        let saved = previous.checkpoint;
        // The latest assistant must still end the exact successful request we checkpointed.
        // Edits, compaction, tool projection changes, and account/model changes start a new baseline.
        let valid = saved.version == 1
            && saved.scope == checkpoint.scope
            && saved.envelope == checkpoint.envelope
            && saved.input_len == previous.start
            && previous.start <= previous.end
            && previous.end <= request.input.len()
            && saved.input_hash == hash(&request.input[..previous.start])?
            && saved.output_hash == hash(&request.input[previous.start..previous.end])?
            && saved
                .updates
                .iter()
                .all(|update| update.offset <= saved.input_len)
            && saved
                .updates
                .windows(2)
                .all(|pair| pair[0].offset < pair[1].offset);
        if valid {
            let effective = saved.updates.last().map_or(&saved.baseline, |u| &u.effort);
            if effective != &selected {
                // Place the update before the next user turn. A tool continuation can end
                // with an update instead; replay retains that position before its next output.
                let offset = request.input[previous.end..]
                    .iter()
                    .position(|item| item["role"] == "user")
                    .map_or(request.input.len(), |index| previous.end + index);
                checkpoint.updates = saved.updates;
                checkpoint.updates.push(Update {
                    offset,
                    effort: selected,
                });
            } else {
                checkpoint.updates = saved.updates;
            }
            checkpoint.baseline = saved.baseline;
        }
    }
    if let Some(reasoning) = request.reasoning.as_mut() {
        reasoning["effort"] = json!(checkpoint.baseline);
    }
    // Offsets count provider input items without updates; insert from the end to preserve them.
    for update in checkpoint.updates.iter().rev() {
        request.input.insert(
            update.offset,
            json!({
                "type":"configuration_update", "reasoning":{"effort":update.effort}
            }),
        );
    }
    Ok(Some(Pending(checkpoint)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::LoginMethod;
    use crate::responses::{from_host, host_events::Mapper};

    fn options() -> Value {
        json!({"model":"test","system":"Keep the context.","reasoningEffort":"low",
        "cachePreservingReasoning":true,"messages":[
            {"role":"user","content":[{"type":"text","text":"First"}]}
        ]})
    }

    fn user(options: &mut Value, text: &str) {
        options["messages"]
            .as_array_mut()
            .into_iter()
            .for_each(|messages| {
                messages.push(json!({"role":"user","content":[{"type":"text","text":text}]}));
            });
    }

    fn output(id: &str) -> Value {
        json!({"id":id,"type":"message","role":"assistant","content":[{"type":"output_text","text":"OK"}]})
    }

    fn turn(options: &mut Value, output: Vec<Value>) -> Result<(Request, Value), Error> {
        let mut request = from_host(&options.to_string())?;
        let pending = prepare(&mut request, "account", true)?;
        let chunks = Mapper::new(pending).accept(json!({
            "type":"response.completed","response":{"output":output}
        }))?;
        let finish = chunks
            .last()
            .ok_or(Error::Protocol("Missing test finish"))?;
        let replay = finish["replayState"].clone();
        let blocks: Vec<_> = chunks
            .iter()
            .filter(|c| c["type"] == "block-end")
            .map(|c| c["block"].clone())
            .collect();
        options["messages"]
            .as_array_mut()
            .ok_or(Error::Protocol("Missing test history"))?
            .push(json!({"role":"assistant","content":blocks,"source":{"replayState":replay}}));
        Ok((request, replay))
    }

    #[test]
    fn fixed_high_preserves_prefix_without_updates_even_when_checkpoint_is_missing()
    -> Result<(), Error> {
        let mut options = options();
        options["reasoningEffort"] = json!("high");
        let (first, _) = turn(&mut options, vec![output("m1")])?;
        user(&mut options, "Second");
        let (second, _) = turn(&mut options, vec![output("m2")])?;
        assert_eq!(second.input[..first.input.len()], first.input);
        for missing_checkpoint in [false, true] {
            let mut restored: Value = serde_json::from_str(&options.to_string())
                .map_err(|_| Error::Protocol("Test JSON"))?;
            if missing_checkpoint {
                restored["messages"][3]["source"]["replayState"]["response"]["reasoningCache"] =
                    Value::Null;
            }
            user(&mut restored, "Third");
            let (third, replay) = turn(&mut restored, vec![output("m3")])?;
            assert_eq!(third.input[..second.input.len()], second.input);
            assert!(
                !third
                    .input
                    .iter()
                    .any(|item| item["type"] == "configuration_update")
            );
            assert_eq!(
                third.reasoning.as_ref().map(|r| &r["effort"]),
                Some(&json!("high"))
            );
            assert_eq!(replay["response"]["reasoningCache"]["updates"], json!([]));
        }
        Ok(())
    }

    #[test]
    fn switches_keep_the_baseline_and_original_update_positions_after_reload() -> Result<(), Error>
    {
        let mut options = options();
        let (first, _) = turn(&mut options, vec![output("m1")])?;
        options["reasoningEffort"] = json!("high");
        user(&mut options, "Second");
        let (second, _) = turn(&mut options, vec![output("m2")])?;
        assert_eq!(
            second.reasoning.as_ref().map(|r| &r["effort"]),
            Some(&json!("low"))
        );
        assert_eq!(second.input[..first.input.len()], first.input);
        assert_eq!(second.input[1], output("m1"));
        assert_eq!(
            second.input[2],
            json!({"type":"configuration_update","reasoning":{"effort":"high"}})
        );
        assert_eq!(second.input[3]["content"], "Second");
        // Only serialized host history is needed; no adapter or process-local cache participates.
        options =
            serde_json::from_str(&options.to_string()).map_err(|_| Error::Protocol("Test JSON"))?;
        user(&mut options, "Third");
        let (third, _) = turn(&mut options, vec![output("m3")])?;
        assert_eq!(third.input[..second.input.len()], second.input);
        assert_eq!(
            third
                .input
                .iter()
                .filter(|i| i["type"] == "configuration_update")
                .count(),
            1
        );
        options["reasoningEffort"] = json!("low");
        user(&mut options, "Fourth");
        let (fourth, replay) = turn(&mut options, vec![output("m4")])?;
        assert_eq!(fourth.input[..third.input.len()], third.input);
        assert_eq!(
            fourth.input[fourth.input.len() - 2]["reasoning"]["effort"],
            "low"
        );
        assert_eq!(
            fourth
                .input
                .iter()
                .filter(|i| i["type"] == "configuration_update")
                .count(),
            2
        );
        assert_eq!(replay["response"]["reasoningCache"]["baseline"], "low");
        assert_eq!(
            replay["response"]["reasoningCache"]["updates"][1]["effort"],
            "low"
        );
        let wire = serde_json::to_value(&fourth).map_err(|_| Error::Protocol("Test JSON"))?;
        assert!(wire.get("cache").is_none());
        assert!(wire.get("cachePreservingReasoning").is_none());
        Ok(())
    }

    #[test]
    fn tool_continuations_replay_updates_and_encrypted_output_without_duplication()
    -> Result<(), Error> {
        let mut options = options();
        let call = json!({"id":"fc1","type":"function_call","call_id":"call1","name":"lookup","arguments":"{}"});
        let reasoning =
            json!({"id":"rs1","type":"reasoning","summary":[],"encrypted_content":"opaque"});
        turn(&mut options, vec![reasoning.clone(), call.clone()])?;
        options["reasoningEffort"] = json!("max");
        options["messages"].as_array_mut().ok_or(Error::Protocol("Missing test history"))?
            .push(json!({"role":"tool","toolCallId":"call1","content":[{"type":"text","text":"result"}]}));
        let (second, _) = turn(&mut options, vec![output("m2")])?;
        assert_eq!(second.input[1], reasoning);
        assert_eq!(second.input[2], call);
        assert_eq!(second.input[3]["type"], "function_call_output");
        assert_eq!(second.input[4]["reasoning"]["effort"], "max");
        user(&mut options, "Continue");
        let (third, _) = turn(&mut options, vec![output("m3")])?;
        assert_eq!(third.input[..second.input.len()], second.input);
        assert_eq!(third.input[5], output("m2"));
        Ok(())
    }

    #[test]
    fn changed_scope_envelope_or_history_starts_with_the_selected_effort() -> Result<(), Error> {
        let mut saved = options();
        turn(&mut saved, vec![output("m1")])?;
        saved["reasoningEffort"] = json!("high");
        user(&mut saved, "Second");
        for change in [
            "account",
            "model",
            "instructions",
            "tools",
            "input",
            "output",
            "visible-output",
            "compaction",
            "missing-state",
        ] {
            let mut options = saved.clone();
            match change {
                "model" => options["model"] = json!("other"),
                "instructions" => options["system"] = json!("Other instructions"),
                "tools" => {
                    options["tools"] = json!([{"name":"lookup","description":"Lookup","parameters":{"type":"object"}}])
                }
                "input" => options["messages"][0]["content"][0]["text"] = json!("Edited"),
                "output" => {
                    options["messages"][1]["source"]["replayState"]["response"]["items"][0]["content"]
                        [0]["text"] = json!("Edited")
                }
                "visible-output" => {
                    options["messages"][1]["content"][0]["text"] = json!("Edited visible text")
                }
                "compaction" => {
                    options["messages"]
                        .as_array_mut()
                        .ok_or(Error::Protocol("Missing test history"))?
                        .remove(0);
                }
                "missing-state" => {
                    options["messages"][1]["source"]["replayState"]["response"]["reasoningCache"] =
                        Value::Null
                }
                _ => {}
            }
            let mut request = from_host(&options.to_string())?;
            let account = if change == "account" {
                "other"
            } else {
                "account"
            };
            assert!(prepare(&mut request, account, true)?.is_some());
            assert_eq!(
                request.reasoning.as_ref().map(|r| &r["effort"]),
                Some(&json!("high")),
                "{change}"
            );
            assert!(
                !request
                    .input
                    .iter()
                    .any(|i| i["type"] == "configuration_update"),
                "{change}"
            );
        }
        Ok(())
    }

    #[test]
    fn siwc_and_disabled_requests_never_emit_updates_or_checkpoints() -> Result<(), Error> {
        let mut saved = options();
        turn(&mut saved, vec![output("m1")])?;
        saved["reasoningEffort"] = json!("high");
        user(&mut saved, "Second");
        for (route, enabled) in [
            (LoginMethod::Siwc, true),
            (LoginMethod::CodexBrowser, false),
        ] {
            let mut options = saved.clone();
            options["cachePreservingReasoning"] = json!(enabled);
            let mut request = from_host(&options.to_string())?;
            let cache = prepare(
                &mut request,
                "account",
                route.capabilities().configuration_update,
            )?;
            assert!(cache.is_none());
            assert_eq!(
                request.reasoning.as_ref().map(|r| &r["effort"]),
                Some(&json!("high"))
            );
            assert!(
                !request
                    .input
                    .iter()
                    .any(|i| i["type"] == "configuration_update")
            );
            let chunks = Mapper::new(cache).accept(
                json!({"type":"response.completed","response":{"output":[output("m2")]}}),
            )?;
            assert!(
                chunks
                    .last()
                    .is_some_and(|c| c["replayState"]["response"].get("reasoningCache").is_none())
            );
        }
        Ok(())
    }
}
