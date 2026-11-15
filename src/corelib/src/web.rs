// SPDX-License-Identifier: Apache-2.0
//! Google Boq (`batchexecute`) wire protocol. The C ABI over it lives in `src/core/capi` (`aphrody_*`); the adblock glue lives in aphrody-labs/open (`crates/adblock-capi`).
//!
//! Consolidates `crates/aphrody-boq` from `yolo-rs/yolo-web`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ============================================================================
// 1. Google Boq (`batchexecute`) Request Encoder & Streamed Response Parser
// ============================================================================

/// Anti-XSSI safety prefix every Google Boq response starts with.
pub const BOQ_XSSI_PREFIX: &str = ")]}'\n";

/// Encode a single-RPC `f.req` body string for Google Boq `batchexecute`.
///
/// `payload` is JSON-stringified into the inner slot, then wrapped in the
/// `[[[rpc_id, inner, null, "generic"]]]` envelope and stringified again.
pub fn boq_encode_f_req(rpc_id: &str, payload: &Value) -> serde_json::Result<String> {
    let inner = serde_json::to_string(payload)?;
    serde_json::to_string(&Value::Array(vec![Value::Array(vec![Value::Array(vec![
        Value::String(rpc_id.to_string()),
        Value::String(inner),
        Value::Null,
        Value::String("generic".to_string()),
    ])])]))
}

/// Strip the leading `)]}'` anti-XSSI safety prefix (with or without trailing newline).
#[must_use]
pub fn boq_strip_xssi(raw: &str) -> &str {
    let stripped = raw.strip_prefix(")]}'\n").unwrap_or(raw);
    stripped
        .strip_prefix(")]}'")
        .unwrap_or(stripped)
        .trim_start()
}

/// Walk the length-prefixed Boq chunk stream and yield every JSON array chunk.
#[must_use]
pub fn boq_extract_chunks(body: &str) -> Vec<Value> {
    let mut chunks = Vec::new();
    let lines: Vec<&str> = body.split('\n').collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();
        if line.is_empty() {
            i += 1;
            continue;
        }

        if line.chars().all(|c| c.is_ascii_digit()) {
            let length: usize = line.parse().unwrap_or(0);
            if i + 1 < lines.len() {
                let next = lines[i + 1].trim();
                if !next.is_empty()
                    && let Ok(value) = serde_json::from_str::<Value>(next)
                {
                    chunks.push(value);
                    i += 2;
                    continue;
                }
            }
            let mut accumulated = String::new();
            let mut j = i + 1;
            while j < lines.len() && accumulated.len() < length {
                if !accumulated.is_empty() {
                    accumulated.push('\n');
                }
                accumulated.push_str(lines[j]);
                j += 1;
            }
            if let Ok(value) = serde_json::from_str::<Value>(accumulated.trim()) {
                chunks.push(value);
            }
            i = j;
        } else if let Ok(value) = serde_json::from_str::<Value>(line) {
            chunks.push(value);
            i += 1;
        } else {
            i += 1;
        }
    }
    chunks
}

/// Iterate every `wrb.fr` envelope in a raw Boq response and return the inner JSON payloads.
#[must_use]
pub fn boq_parse_envelopes(raw: &str) -> Vec<Value> {
    let stripped = boq_strip_xssi(raw);
    let chunks = boq_extract_chunks(stripped);
    let mut results = Vec::new();
    for chunk in chunks {
        let Value::Array(envelopes) = chunk else {
            continue;
        };
        for env in envelopes {
            let Value::Array(items) = env else { continue };
            if items.first().and_then(Value::as_str) != Some("wrb.fr") {
                continue;
            }
            if let Some(Value::String(inner)) = items.get(2)
                && let Ok(parsed) = serde_json::from_str::<Value>(inner)
            {
                results.push(parsed);
            }
        }
    }
    results
}

/// Return the first `wrb.fr` envelope of a raw Boq response, or `None` when it carries none.
#[must_use]
pub fn boq_first_envelope(raw: &str) -> Option<Value> {
    boq_parse_envelopes(raw).into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_boq_encode_and_parse_roundtrip() {
        let payload = json!(["query-1", 1, [0, null, 1]]);
        let encoded = boq_encode_f_req("CCqFvf", &payload).unwrap();
        assert!(encoded.contains("CCqFvf"));
        assert!(encoded.contains("generic"));

        let raw = format!(
            "{}{}\n{}",
            BOQ_XSSI_PREFIX,
            "82",
            r#"[["wrb.fr","CCqFvf","[\"nbid-1\",[\"thread-1\"]]",null,null,null,"generic"]]"#,
        );
        let envelopes = boq_parse_envelopes(&raw);
        assert_eq!(envelopes.len(), 1);
        assert_eq!(envelopes[0][0].as_str(), Some("nbid-1"));
        assert_eq!(
            boq_first_envelope(&raw).unwrap()[0].as_str(),
            Some("nbid-1")
        );
    }
}
