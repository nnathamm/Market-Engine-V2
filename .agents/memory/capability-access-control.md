---
name: Capability access control
description: Authorization uses database-backed capabilities with a safe first-admin bootstrap.
---

Use capabilities, not only a role name, for access decisions. Navigation visibility is only a convenience layer: every protected view and API must enforce the corresponding capability on the server.

**Why:** The application has restricted operational areas and mutable tracked-market data; client-only role checks or an all-or-nothing admin flag can be bypassed through direct URLs and API requests.

**How to apply:** New restricted features need a named capability, UI gating, and server enforcement. The first authenticated account is the initial administrator; preserve at least one administrator when changing roles.

Algorithm-design controls such as Order Flow belong under Admin and are owner-only; ordinary Admin access must not imply permission to edit them.

**Why:** The owner confirmed that Order Flow variables define core algorithm behavior and must be controlled by a single master account.

**How to apply:** Model owner-only algorithm editing as a distinct capability and enforce it in navigation, page access, and API routes. Identify the owner through controlled access data, never a hardcoded email or bypass.

Master signals are owner-authored, system-wide strategies; followers can follow or unfollow them, but published updates apply automatically to all followers.

**Why:** The owner confirmed that master signals should act as a live source of truth rather than independent copies.

**How to apply:** Keep the master definition/version separate from each user’s follow relationship and notification preferences. Do not grant followers edit access to the master signal.

Basic, Pro, and Elite are membership tiers for entitlement decisions, separate from Admin/Member roles and owner-only authority; billing is deferred.

**Why:** The owner chose to establish tier-based access now while postponing subscription payments.

**How to apply:** Store tier entitlements independently from capabilities and roles so future billing can change a user’s tier without changing their identity or administrative authority.

Master Signals live in a system-wide Signal Library. Users add a linked copy to My Signals; it remains non-editable and receives Master Admin updates automatically.

**Why:** The owner rejected a separate follow action and chose a library-to-linked-copy experience that keeps personal signals in their existing workspace.

**How to apply:** Keep Master Signal authoring and management exclusive to the master owner, while the library is available to permitted users. A copied item must retain its source identity rather than fork the definition.