# API Architecture

> **Doc ID:** 48 · **Status:** Design · **Depends on:** `40`, `46`, `47`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

Four API surfaces, their contracts, and the versioning discipline that keeps a
five-year project working across releases.

---

## 1. The four surfaces

| Surface | Between | Transport | Trust |
|---|---|---|---|
| **IPC API** | Renderer ↔ service tier | Typed local channel | Renderer untrusted |
| **Host API** | service tier ↔ plugin sandbox | WASM host functions | Plugin untrusted |
| **Cloud API** | Client ↔ cloud plane | HTTPS/JSON | Mutually authenticated |
| **Provider API** | Gateway ↔ AI providers | HTTPS, per-provider | External |

There is deliberately **no public REST API over user content** in v1. Content
lives on the device; an API that served it would require the cloud plane to hold
it, which would undo `44`. Programmatic access is provided by plugins running on
the device (`47`), where the data already is.

---

## 2. Design rules

| # | Rule |
|---|---|
| API1 | **Typed end to end.** Schemas generate client and server types; no untyped payloads |
| API2 | **Validate at the boundary.** Every input validated at the trust boundary it crosses |
| API3 | **Explicit versioning.** Every surface carries a version; compatibility is a documented contract |
| API4 | **Errors are structured.** Code, message, and remediation — never a bare string |
| API5 | **Idempotent where it matters.** Mutations carry idempotency keys |
| API6 | **No ambient authority.** Every privileged call presents a capability |
| API7 | **Content stays out of the cloud API.** It carries identity, licensing, ciphertext, and metadata |

---

## 3. IPC API

The renderer's only route to anything. Generated typed channels, never
`send(string, any)` (`13` §3).

### 3.1 Shape

```
Request:   { channel, requestId, payload }
Response:  { requestId, ok: true, data }
         | { requestId, ok: false, error: { code, message, remediation, details } }
Event:     { channel, payload }        // kernel → renderer, unsolicited
```

### 3.2 Channel groups

| Group | Examples |
|---|---|
| `project.*` | create, open, list, archive, gate.signoff, gate.status |
| `draft.*` | read, edit, span.review, suggestion.accept, comment.add |
| `source.*` | upload, candidate.list, candidate.decide, corpus.list, revoke |
| `rubric.*` | source.add, rules.list, rule.edit, rule.waive, findings.list |
| `agent.*` | run, cancel, status, history, version.pin |
| `vault.*` | create, ingest, search, document.read, curate.proposals |
| `ledger.*` | authorship, report.generate, disclosure.draft, spans.unreviewed |
| `export.*` | preflight, render, package |
| `settings.*` | get, set, provider.configure, provider.validate |
| `privacy.*` | policy.get, policy.set, egress.preview, egress.audit |
| `system.*` | resources, processing.status, diagnostics, update |

### 3.3 Streaming

Long operations stream progress as events rather than blocking:

```
agent.run          → { runId }
event agent.progress { runId, stage, percent, message }
event agent.output   { runId, chunk }        // token streaming
event agent.complete { runId, result }
```

### 3.4 Security

| Control | Statement |
|---|---|
| No handles cross | The renderer never receives a store handle, a key, or a file descriptor |
| Validation | Every payload validated against its schema at the service tier |
| Rate limiting | Per channel, to contain a compromised renderer |
| Capability | Privileged channels require the session's capability set |
| No path arguments | The renderer names objects by ID, never by filesystem path |

The last rule closes path traversal as a category: the renderer cannot express a
path, so it cannot express a malicious one.

---

## 4. Host API (plugins)

Capability-gated host functions callable from WASM.

### 4.1 Shape

```
host.project.getMetadata()        requires read:project
host.structure.getOutline()       requires read:structure
host.draft.getText(sectionId)     requires read:draft
host.corpus.list()                requires read:corpus
host.vault.search(query)          requires read:vault
host.suggestions.propose(s)       requires write:suggestions
host.rules.propose(r)             requires write:rule_proposals
host.findings.report(f)           requires write:findings
host.artifact.write(bytes)        requires write:artifact
host.net.fetch(request)           requires net:outbound  → Warden-gated
host.storage.get/set(key, value)  plugin-scoped, always available
host.log(level, message)          always available
```

### 4.2 Enforcement

Every host function verifies the calling plugin's capability token before doing
anything (`46` §8). A call without the capability returns a structured denial
and is logged; repeated denials disable the plugin (`47` §9).

### 4.3 What is deliberately absent

| Absent | Why |
|---|---|
| `host.draft.write()` | No plugin writes the accepted draft (`42` §4.2) |
| `host.corpus.add()` | Sources enter only through approval (`REQ-SRC-4`) |
| `host.ledger.append()` | The Ledger is kernel-owned |
| `host.fs.*` | No filesystem access; data is passed in |
| `host.exec()` | No process execution |
| `host.plugin.call()` | No plugin-to-plugin calls |

---

## 5. Cloud API

Thin, because the cloud plane is thin (`40` §4).

### 5.1 Endpoints

| Group | Endpoints | Sees content |
|---|---|---|
| `/auth` | register, verify, login, refresh, logout, mfa/*, password/* | No |
| `/account` | profile, devices, sessions, delete, export | No |
| `/subscription` | status, checkout, portal | No |
| `/sync` | manifest, push, pull, delete, conflicts | Ciphertext only |
| `/registry` | models, venue-profiles, agent-versions, feature-flags | No |
| `/plugins` | search, metadata, download | No |
| `/telemetry` | ingest (aggregate) | No |

### 5.2 Sync protocol

```
GET  /sync/manifest?since=<version>
  → [ { objectId, version, size, updatedAt } ]      opaque IDs only

POST /sync/push
  { objectId, version, parentVersion, ciphertext, nonce }
  → 200 accepted | 409 conflict { serverVersion }

GET  /sync/pull/<objectId>
  → { objectId, version, ciphertext, nonce }
```

**The server sees:** an opaque object ID, a version, a size, a timestamp, and
ciphertext. It cannot infer document titles, types, or project names
(`45` §11).

**Conflicts are returned, never resolved.** A 409 hands both versions to the
client, which surfaces them for human resolution (`REQ-LOC-8`).

### 5.3 Authentication

Bearer access tokens (short-lived) with rotating refresh tokens bound to a device
key (`46` §10.2). Every request is scoped by row-level security to its account.

### 5.4 Errors

```json
{
  "error": {
    "code": "sync.version_conflict",
    "message": "This object was modified on another device.",
    "remediation": "Pull the server version and resolve the conflict.",
    "details": { "serverVersion": 47, "yourVersion": 45 }
  }
}
```

Codes are namespaced, stable, and documented. Clients switch on `code`, never on
`message` — messages are localised and may change.

---

## 6. Provider API

Normalised behind the adapter contract (`41` §3.1). Provider-specific quirks —
authentication style, streaming format, error shapes, token accounting — are
absorbed by the adapter so that no agent, and no other module, knows which
provider served a request.

---

## 7. Versioning

`API3`, and the reason a four-year doctoral project keeps working.

| Surface | Scheme | Compatibility promise |
|---|---|---|
| IPC | Ships with the app | Both sides update together; no promise needed |
| Host API | Semantic version in the manifest range | Minor versions are additive; major versions require plugin updates, with a deprecation window of two minor releases |
| Cloud API | `/v1`, `/v2` in the path | A version is supported for 24 months after its successor ships |
| Registry | Schema version per document | Clients ignore unknown fields; servers never remove fields within a major version |

### 7.1 Compatibility rules

| Change | Allowed within a major version |
|---|---|
| Add an optional field | Yes |
| Add an endpoint or channel | Yes |
| Add an enum value | Yes, if clients tolerate unknowns |
| Make a required field optional | Yes |
| Remove a field | No |
| Rename anything | No |
| Change a type | No |
| Make an optional field required | No |
| Change an error code's meaning | No |

### 7.2 Client-newer-than-server, and the reverse

| Case | Behaviour |
|---|---|
| Client newer than cloud API | Client degrades to the supported version; features requiring the newer version are disabled with an explanation |
| Client older than cloud API | Server serves the older version for its support window; the client is prompted to update |
| Client older than local data schema | **Refuses to open**, with a clear message (`45` §8.1). Silent partial reads would corrupt |

---

## 8. Rate limits

| Surface | Limit | On exceed |
|---|---|---|
| IPC | Per channel, generous | Structured error; logged as a renderer anomaly |
| Host API | Per plugin, per manifest | Denial; repeated denials disable |
| Cloud auth | Progressive backoff | 429 with `Retry-After` |
| Cloud sync | Per account, per minute | 429 with `Retry-After` |
| Cloud registry | Cached aggressively; limits rarely reached | 429 |

---

## 9. Documentation and contract testing

| Artefact | Kept |
|---|---|
| IPC channel reference | Generated from schemas |
| Host API reference | Generated, with capability requirements per function |
| Cloud API OpenAPI spec | Source of truth; clients generated from it |
| Error code catalogue | Complete, with remediation text |
| Changelog per surface | Every version, with migration notes |

Contract tests run in CI against the OpenAPI spec and the generated IPC schemas.
A change that breaks a compatibility rule in §7.1 fails the build rather than
reaching a release.

---

## 10. Current state

The repository has an Express server exposing `/api/generate*`, `/api/parse-*`,
`/api/agents*`, `/api/health`, and admin routes, with the client calling them
directly.

| Current | Target |
|---|---|
| HTTP API between browser and server for everything | Typed IPC between renderer and kernel |
| Server-side AI proxy endpoints | Direct client-to-provider through the Gateway and Warden |
| Server-side parse endpoints | Local parsing; no API involved |
| No plugin API | Capability-gated WASM host API |
| Untyped JSON payloads | Schema-generated types end to end |
| No versioning discipline | Documented compatibility rules per surface |
| Admin routes on the same server | Separate admin plane (`49` §3) |

`/api/health` survives as the cloud plane's health endpoint. Almost everything
else moves onto the device.
