dsh-codex-provider: minor:fix
---

Update the DSH SDK to 0.2.2-rc.5 and declare support for the 0.2.2 family from rc.2 through the final release instead of enumerating individual RCs. DSH rc.1 is no longer supported, and Node.js 24.9 or newer is required. Preserve provider error codes and diagnostics using the official LlmError.fromFailure API.

Pin the Codex legacy model catalog client_version to the current stable release, 0.170.0, without changing SIWC requests or introducing runtime version discovery.
