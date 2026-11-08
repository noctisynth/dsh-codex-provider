dsh-codex-provider: minor:feat
---

Derive a stable, bounded Responses prompt_cache_key from the DSH session ID for SIWC and legacy sign-in. Preserve the key across turns and restored sessions, and omit it for requests without a session ID. Keep the existing SSE transport.
