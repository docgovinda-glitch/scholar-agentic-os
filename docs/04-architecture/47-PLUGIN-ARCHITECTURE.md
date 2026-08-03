# Plugin Architecture

> **Doc ID:** 47 · **Status:** Design · **Depends on:** `40`, `46`, `48`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

How Scholar OS is extended without compromising the security model or the
integrity guarantees.

---

## 1. Why plugins

Academia is too heterogeneous to serve from a single codebase. A chemistry
department's report format, a Nordic university's thesis regulations, a niche
citation style, a discipline-specific analysis tool — these matter enormously to
a few hundred people each and cannot all be core features.

| Extends | Example |
|---|---|
| Output types | A specific institution's thesis format |
| Citation styles | A regional or society style |
| Requirement sources | A university's regulation format |
| Ingestion formats | A domain-specific file type |
| Discovery sources | A discipline database |
| Agents | A statistics advisor for a specific method |
| Editor tools | Discipline-specific notation |
| Export targets | A submission system's format |
| Panels | A specialised view |

### 1.1 What plugins may never do

| Never | Why |
|---|---|
| Write to the accepted draft | `42` §4.2 — only the user writes the draft |
| Bypass the Warden | Egress control is absolute |
| Bypass source approval | `REQ-SRC-8` is structural |
| Modify the Ledger | Append-only, kernel-owned |
| Access another plugin's data | Isolation |
| Obtain ambient filesystem or network access | Sandbox |
| Escalate capabilities | The manifest is the whole grant |

These are enforced by the sandbox and capability system, not by policy. A plugin
that tries has no mechanism available to it.

---

## 2. Model

```
┌────────────────────────────────────────────────────┐
│  KERNEL                                             │
│  ┌──────────────────────────────────────────────┐  │
│  │ Host API — capability-gated                   │  │
│  └───────────────┬──────────────────────────────┘  │
└──────────────────┼─────────────────────────────────┘
                   │  every call verifies a token
   ┌───────────────┼───────────────┬─────────────────┐
   ▼               ▼               ▼                 ▼
┌────────┐    ┌────────┐    ┌────────┐         ┌────────┐
│ WASM   │    │ WASM   │    │ WASM   │   …     │ WASM   │
│ sandbox│    │ sandbox│    │ sandbox│         │ sandbox│
└────────┘    └────────┘    └────────┘         └────────┘
 plugin A      plugin B      plugin C
```

One sandbox per plugin. No shared memory. No direct communication between
plugins — they compose only through kernel-mediated extension points.

---

## 3. Manifest

```yaml
id: com.example.nordic-thesis
name: Nordic Thesis Formats
version: 1.2.0
author: { name, email, url }
license: MIT
scholar_os: ">=2.0.0 <3.0.0"

extends:
  - kind: output_type
    ids: [nordic-licentiate, nordic-doctoral]
  - kind: citation_style
    ids: [nordic-humanities]

capabilities:
  - read:project              # metadata only
  - read:structure
  - write:rule_proposals
  # not requested: read:draft, read:vault, read:corpus, net:outbound

resources:
  memory_mb: 64
  cpu_ms_per_call: 500

integrity:
  signature: …
  publisher_key: …
```

### 3.1 Capability declaration is the contract

Requested capabilities are shown to the user at install in plain language:

```
Nordic Thesis Formats wants to:
  ✓ See your project's title, type, and deadline
  ✓ See your document's structure (headings and sections)
  ✓ Suggest formatting requirements

It cannot:
  ✗ Read what you have written
  ✗ Read your Knowledge Vault
  ✗ Access the internet
  ✗ Change your document

                          [Install]  [Cancel]
```

**The "cannot" list is as important as the "can" list.** It tells the user what
is structurally impossible rather than merely not requested.

---

## 4. Sandbox

| Control | Mechanism |
|---|---|
| Execution | WASM; no syscalls; no ambient authority |
| Memory | Hard limit from the manifest; enforced by the runtime |
| CPU | Per-call time limit; exceeded calls are terminated |
| Filesystem | None. All data through the host API |
| Network | None unless `net:outbound`, and then Warden-gated |
| Clock and randomness | Provided by the host; no direct access |
| Crash | Contained; the plugin is disabled; core unaffected |
| Persistence | A scoped key-value store, isolated per plugin, size-limited |

### 4.1 Why WASM

| Property | Value |
|---|---|
| Genuinely sandboxed | Isolation is a property of the runtime, not a convention |
| Language-agnostic | Rust, Go, AssemblyScript, C++, TypeScript via toolchains |
| Deterministic | Same input, same output — testable |
| Portable | Same plugin on every platform |
| Resource-bounded | Memory and time limits are enforceable |

The trade-off is ergonomics: WASM plugin development is harder than shipping a
JavaScript file. That cost is accepted, because the alternative is a plugin
system that can read the user's dissertation.

### 4.2 UI plugins

Plugins contributing panels or editor decorations do so declaratively — a
component tree description the renderer renders — not by injecting code into the
renderer. A plugin cannot execute JavaScript in the renderer process.

This is more restrictive than most plugin systems and it is deliberate: the
renderer is where untrusted content is displayed, and letting plugins run there
would defeat `40` §2.1.

---

## 5. Extension points

| Point | Contributes | Capabilities typically needed |
|---|---|---|
| `output_type` | Catalog entries with structure and intake schema | `read:project` |
| `citation_style` | A formatter implementation | none |
| `requirement_source` | A parser for a requirement format | `read:requirement_source` |
| `ingestion_format` | A parser producing CDM | none (content is passed in) |
| `discovery_source` | An academic search adapter | `net:outbound` |
| `agent` | An agent with a manifest (`42` §2) | varies |
| `editor_tool` | A command or decoration | `read:draft`, `write:suggestions` |
| `export_target` | A format writer | `write:artifact` |
| `panel` | A Desk panel | varies |
| `compliance_rule` | A custom rule evaluator | `read:draft`, `read:rubric` |

### 5.1 Agent plugins

A plugin may contribute an agent, subject to the full agent contract: declared
permissions, QA checkpoints, and a golden set. Plugin agents run in the sandbox
with the same capability enforcement as core agents, and — like core agents —
cannot hold `write:draft`.

---

## 6. Lifecycle

```
Author ─▶ Build (WASM) ─▶ Sign ─▶ Submit ─▶ Review ─▶ Registry
                                                          │
                                            Install ◀─────┘
                                               │
                                        Grant capabilities
                                               │
                                             Enable
                                               │
                                        Update ─┴─ Disable ─ Uninstall
```

| Stage | Detail |
|---|---|
| Install | From registry, or sideload with a stronger warning |
| Capabilities | Granted at install; changes require re-consent |
| Enable | Per workspace |
| Update | Reviewed if capabilities changed; auto-update otherwise, user-configurable |
| Disable | Immediate; state retained |
| Uninstall | Plugin data removed; contributed content (e.g. a custom output type used by a project) is preserved as a frozen copy so projects do not break |

The last point matters: uninstalling a plugin must never break a project that
used it. Contributed output types and styles are copied into the project when
first used.

---

## 7. Distribution and review

### 7.1 Registry

| Property | Approach |
|---|---|
| Hosting | Operator-run, signed, CDN-delivered |
| Discovery | Browse and search in the Plugin Manager |
| Verification | Signature checked before load |
| Tiers | Community (reviewed), Verified (reviewed + audited), Official (operator-authored) |
| Private | Institutional tiers may host a private registry |

### 7.2 Review

Manual review is required for registry distribution, and it is intentionally
proportionate to a small team:

| Check | Automated | Manual |
|---|---|---|
| Manifest validity | ✓ | |
| Capability justification | | ✓ |
| Source availability | ✓ | |
| Known-bad dependencies | ✓ | |
| Behaviour against declared capabilities | ✓ | |
| Content quality (for output types and styles) | | ✓ |
| Privacy claims | | ✓ |

**The review's central question:** does the plugin request more capability than
its stated function requires? A citation-style plugin asking for `net:outbound`
is rejected, and the answer explains why.

### 7.3 Sideloading

Permitted, for institutional and development use, with an unmissable warning:

> This plugin has not been reviewed. It will run on your computer with the
> permissions you grant it. Install it only if you trust its source.

---

## 8. Development

| Element | Provided |
|---|---|
| SDK | TypeScript and Rust bindings for the host API |
| Templates | One per extension point |
| Local development | Hot reload against a development build |
| Testing | Harness with a mock host and capability simulation |
| Validation | Manifest and capability linting before submission |
| Documentation | Host API reference (`48` §5), guides, examples |

### 8.1 Design goal

The most common plugin will be an **output type or an institutional profile** —
content, not code. Those must be authorable without writing WASM at all: a
declarative YAML manifest with structure, intake schema, and rules, validated and
packaged by a tool.

Reserving code plugins for genuine behaviour extensions keeps the common case
easy and the risky case rare.

---

## 9. Failure handling

| Failure | Response |
|---|---|
| Crash | Contained; disabled; user notified with a report option |
| Timeout | Call aborted; plugin flagged; repeated timeouts disable it |
| Memory exceeded | Terminated; disabled |
| Capability violation | Call denied; logged; repeated violations disable it and flag for review |
| Invalid output | Rejected by schema validation before it reaches the kernel |
| Incompatible version | Not loaded; user told which version is required |
| Signature invalid | Not loaded; treated as a security event |

**No plugin failure may affect core functionality.** Verified by fault-injection
tests (`52` §6).

---

## 10. Performance

| Constraint | Limit |
|---|---|
| Load time | < 100 ms per plugin |
| Call latency | < 50 ms typical, 500 ms hard cap |
| Memory | 64 MB default, 256 MB maximum |
| Concurrent plugins | 20 |
| Startup impact | < 300 ms total for 10 plugins |

Plugins are lazily loaded — a plugin contributing an export target is not loaded
until an export runs.

---

## 11. Current state

No plugin system exists. `src/skills/` has a registry-and-executor pattern that
is conceptually adjacent and is the natural host for plugin-contributed agents.

Everything in this document is new construction, scheduled in Phase 5
(`51`) — after the security model it depends on is complete, and never before.
