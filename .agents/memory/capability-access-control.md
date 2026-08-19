---
name: Capability access control
description: Authorization uses database-backed capabilities with a safe first-admin bootstrap.
---

Use capabilities, not only a role name, for access decisions. Navigation visibility is only a convenience layer: every protected view and API must enforce the corresponding capability on the server.

**Why:** The application has restricted operational areas and mutable tracked-market data; client-only role checks or an all-or-nothing admin flag can be bypassed through direct URLs and API requests.

**How to apply:** New restricted features need a named capability, UI gating, and server enforcement. The first authenticated account is the initial administrator; preserve at least one administrator when changing roles.