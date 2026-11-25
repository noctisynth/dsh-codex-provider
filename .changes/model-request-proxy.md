dsh-codex-provider: minor:feat
---

Add an optional HTTP or HTTPS model request proxy in ChatGPT settings. SIWC and Codex model requests use the configured proxy without falling back to a direct connection. Clearing it restores the default network settings; sign-in and other non-model requests are unchanged.
