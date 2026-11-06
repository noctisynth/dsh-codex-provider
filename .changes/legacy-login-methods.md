dsh-codex-provider: minor:feat
---

Add native Codex legacy browser OAuth and device-code login alongside SIWC, using shared account and authorization UI with login-method labels and device-code progress. Browser and device logins update the same legacy account while retaining SIWC credentials separately.

Route model discovery and Responses through the selected account's authentication backend. Keep legacy token exchange, verified identity, refresh rotation and local logout separate from SIWC registration and revocation. Complete real-user authorization and legacy inference acceptance before production delivery.
