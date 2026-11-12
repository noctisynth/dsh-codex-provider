dsh-codex-provider: patch:fix
---

Preserve conversation prefixes when application instructions and tools change. Use advertised Codex incremental-model metadata rather than a model-name whitelist, expose system and native tool updates separately, append scoped developer instructions and additional_tools in history, and retain valid reasoning-effort checkpoints. Keep SIWC, auxiliary calls, and models without advertised support on the existing projection.
