dsh-codex-provider: patch:fix
---

Send a stable request-scoped session-id header for Codex browser and device sign-in so ChatGPT Responses can use session cache affinity. Preserve the existing prompt_cache_key and leave SIWC and requests without a session ID unchanged.
