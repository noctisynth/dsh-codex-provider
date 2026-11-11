---
dsh-codex-provider: "patch:fix"
---

Preserve transport errors while reading Responses event streams so network interruptions use DSH TRANSPORT and read timeouts use TIMEOUT instead of PROVIDER_ERROR. Keep actual parsing failures classified as protocol errors.
