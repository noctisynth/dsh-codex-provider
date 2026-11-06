dsh-codex-provider: patch:fix
---

Fix compaction requests by omitting parameters unsupported by Sign in with ChatGPT. Preserve public provider error details and map failures to DSH classifications so context overflow can trigger host recovery. Persist cleared tokens after terminal refresh failures before prompting for sign-in, while retaining the account registration and credentials on temporary failures.
