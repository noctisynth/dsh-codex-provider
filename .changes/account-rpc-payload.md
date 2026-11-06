dsh-codex-provider: patch:fix
---

Send an explicit null payload for parameterless account RPC calls so DSH's required envelope field survives JSON serialization. Fix login HTTP 400 and verify the shipped React component's login and cancellation requests against the official host schema.
