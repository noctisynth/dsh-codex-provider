dsh-codex-provider: patch:fix
---

Reuse the active account's model catalog and concurrent catalog request until credentials change. Preserve streamed output items when the completion event has an empty output array, and retain visible content from previously saved empty replay snapshots. Fix missing tool-call context in later requests; validate native tool-result continuation and subsequent conversation against the public endpoint.
