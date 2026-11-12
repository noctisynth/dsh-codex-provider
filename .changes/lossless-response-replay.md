dsh-codex-provider: patch:fix
---

Preserve completed native response items and encrypted reasoning when terminal stream notifications are sparse. Replay native items in protocol order independently of display block order, invalidate stale replay after visible content changes, keep compatible saved histories readable, and explicitly request encrypted reasoning alongside search sources.
