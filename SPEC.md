# SPEC.md

## 1. Overview

This repository provides a custom GitHub Action implementation that synchronizes an Amazon CloudFront KeyValueStore (KVS) from a JSONC file stored in a GitHub repository.

The JSONC file is the single source of truth. The action reads the JSONC file, compares its contents with the current state of the target CloudFront KeyValueStore, and applies the required changes so that the KVS exactly matches the file contents.

This project is intended to be implemented in TypeScript and executed in a Node.js runtime. The compiled artifact must be emitted into the `dist/` directory, and GitHub Actions must invoke `dist/index.js` via Node.js.

---

## 2. Goals

- Treat a JSONC file in the repository as the source of truth for CloudFront KeyValueStore data.
- Synchronize KVS contents so that:
  - when a value changes in JSONC, the corresponding KVS value is updated
  - when a key is removed from JSONC, the corresponding KVS key is deleted
  - when a key is added in JSONC, the corresponding KVS key is added
- Provide a reusable implementation suitable for a standalone repository and future publication or reuse across multiple repositories.
- Be safe to use in CI/CD pipelines.
- Be deterministic and easy to review in pull requests.

---

## 3. Non-goals

- Managing CloudFront Function resources themselves
- Managing CloudFront KeyValueStore resource creation or association
- Managing multiple KVS targets in a single execution
- Supporting data sources other than a local repository file
- Supporting JSON Schema validation beyond the format defined in this specification
- Performing partial syncs by key prefix in the first version
- Implementing a GitHub Script based solution

---

## 4. High-level behavior

The action must:

1. Read a JSONC file from the checked-out repository
2. Parse and normalize the file contents into a flat key-value map
3. Retrieve the current contents of the target CloudFront KeyValueStore
4. Compute the diff between desired state and current state
5. Apply changes using CloudFront KeyValueStore APIs so that the final KVS state exactly matches the JSONC file
6. Output a summary of:
   - number of desired keys
   - number of current keys
   - number of keys to create/update
   - number of keys to delete
7. Fail clearly if validation or synchronization fails

The synchronization must be **authoritative**, meaning the JSONC file defines the complete desired state for the target KVS.

---

## 5. Runtime and implementation requirements

### 5.1 Runtime
- The implementation must run on Node.js.
- The implementation must not depend on GitHub Script.
- The GitHub Action must execute `dist/index.js` using Node.js.

### 5.2 Language
- The source code must be written in TypeScript.

### 5.3 Build output
- Build artifacts must be emitted into the `dist/` directory.
- The primary entrypoint must be:
  - `dist/index.js`

### 5.4 Module format
- Use a Node.js-compatible module format suitable for GitHub Actions execution.
- The implementation should prefer a simple and stable runtime model over advanced bundling tricks.

---

## 6. Inputs

The action must support the following inputs.

### 6.1 Required inputs

#### `kvs-arn`
- Type: string
- Description: ARN of the target Amazon CloudFront KeyValueStore

#### `file`
- Type: string
- Description: Path to the JSONC file in the repository

### 6.2 Optional inputs

#### `dry-run`
- Type: boolean string (`"true"` or `"false"`)
- Default: `"false"`
- Description:
  - If `true`, compute and print the diff but do not apply changes to KVS

#### `delete-missing`
- Type: boolean string (`"true"` or `"false"`)
- Default: `"true"`
- Description:
  - If `true`, keys present in KVS but absent from JSONC must be deleted
  - If `false`, only additions and updates are applied

#### `fail-on-empty`
- Type: boolean string (`"true"` or `"false"`)
- Default: `"true"`
- Description:
  - If `true`, synchronization must fail when the parsed desired dataset is empty
  - This is a safety mechanism to prevent accidental full deletion due to file mistakes

#### `max-preview-items`
- Type: integer string
- Default: `"50"`
- Description:
  - Maximum number of put/delete items shown in logs

#### `log-level`
- Type: string
- Allowed values:
  - `info`
  - `debug`
- Default: `info`

#### `aws-region`
- Type: string
- Default: `us-east-1`
- Description:
  - Region used by the AWS SDK client
  - CloudFront is global, but the action should accept a region input for consistent AWS SDK configuration

#### `prefix`
- Type: string
- Default: empty
- Description:
  - Optional prefix filter to scope the sync target
  - When set, only keys under the prefix are managed by this execution
  - Keys outside the prefix must remain untouched
- Note:
  - This is optional for v1, but implementation support is desirable if simple

---

## 7. JSONC file format

The action must support the following file formats.

### 7.1 Canonical format

```jsonc
{
  "data": [
    { "key": "allow_ip:stg:203.0.113.10", "value": "tokyo-office" },
    { "key": "allow_ip:stg:198.51.100.25", "value": "vpn" }
  ]
}
````

### 7.2 Alternative flat object format

```jsonc
{
  "allow_ip:stg:203.0.113.10": "tokyo-office",
  "allow_ip:stg:198.51.100.25": "vpn"
}
```

### 7.3 Parsing rules

* JSONC comments must be supported
* Trailing commas must be supported
* The parsed result must be normalized into a flat map of `string -> string`
* Duplicate keys must cause the action to fail
* Non-string keys must cause the action to fail
* Non-string values must cause the action to fail
* Empty string keys must cause the action to fail
* Null values must not be allowed
* Nested objects are not allowed except for the top-level canonical `data` array container
* Arrays are not allowed except for the canonical `data` array

### 7.4 Canonical interpretation

Both supported formats must result in the same internal data model:

* `Map<string, string>` or equivalent

---

## 8. Synchronization semantics

### 8.1 Full sync

When `delete-missing=true`, the action must make the KVS match the JSONC file exactly.

Example:

Current KVS:

* `A=1`
* `B=2`
* `C=3`

Desired JSONC:

* `A=10`
* `C=3`
* `D=4`

Result:

* update `A` from `1` to `10`
* keep `C`
* add `D=4`
* delete `B`

### 8.2 Add/update-only sync

When `delete-missing=false`, missing keys in JSONC must not be deleted from KVS.

### 8.3 Diff rules

* If a desired key does not exist in KVS, include it in puts
* If a desired key exists but has a different value, include it in puts
* If a KVS key exists but is absent from desired data:

  * include it in deletes only when `delete-missing=true`

### 8.4 Idempotency

Repeated execution with no source changes must produce:

* no KVS updates
* successful completion
* logs indicating that no changes were needed

---

## 9. AWS integration requirements

### 9.1 AWS SDK

* Use AWS SDK for JavaScript v3
* Do not shell out to AWS CLI from the main implementation

### 9.2 Required API operations

The implementation must support the required CloudFront KeyValueStore API interactions to:

* describe the target KVS and obtain concurrency metadata
* list all relevant existing keys
* update keys
* delete keys

### 9.3 Pagination

* Listing existing keys must handle pagination correctly
* The action must retrieve all managed keys before computing the diff

### 9.4 Optimistic concurrency

* The implementation must use the required concurrency control token / ETag mechanism correctly
* If the update fails because the KVS was modified concurrently, the action should:

  * retry a small number of times
  * re-fetch metadata and current keys before retrying
* Retry count should be configurable internally
* Default retry count: 3

### 9.5 Atomicity expectation

* If the CloudFront API applies puts/deletes atomically, the implementation should use that model
* If not guaranteed by the API, the implementation must document its effective behavior clearly in README later
* The implementation should prefer batch operations over one-key-at-a-time operations where possible

---

## 10. Logging requirements

### 10.1 Summary logs

The action must log:

* input file path
* target KVS ARN
* dry-run mode status
* desired key count
* current key count
* put count
* delete count

### 10.2 Preview logs

The action must show a preview of changes:

* up to `max-preview-items` put items
* up to `max-preview-items` delete items

### 10.3 Sensitive data handling

* Values must be treated as potentially sensitive
* By default, logs should not print full values unless explicitly enabled in future
* For puts, prefer one of:

  * print keys only
  * print keys and value length
  * print keys and masked/truncated values

Recommended default:

* print keys only for delete operations
* print keys plus masked/truncated values for put operations

### 10.4 Debug logs

When `log-level=debug`, the action may print:

* normalized parsing details
* pagination counts
* retry behavior
* internal diff statistics

---

## 11. Validation requirements

The action must fail before making any AWS changes when any of the following is true:

* input file does not exist
* input file cannot be parsed as valid JSONC under the supported format rules
* duplicate keys exist
* any key is empty
* any value is not a string
* desired dataset is empty and `fail-on-empty=true`
* `kvs-arn` is missing
* AWS credentials are missing or invalid
* target KVS cannot be described

Optional additional validation that is recommended:

* enforce max key length and value length if AWS limits are known in code
* enforce valid Unicode/string handling
* trim only if explicitly specified; otherwise preserve exact value bytes as strings

Important:

* The implementation must not silently coerce numbers, booleans, or null into strings
* Invalid input must fail loudly

---

## 12. Safety requirements

### 12.1 Destructive operation protection

* `fail-on-empty=true` by default
* Large delete sets should emit a warning
* If all managed keys would be deleted, logs must clearly indicate this

### 12.2 No silent partial sync

* If parsing succeeds but the update fails, the action must fail the job
* The action must not report success when KVS updates failed

### 12.3 Explicit dry-run behavior

* In dry-run mode:

  * no write API calls must be made
  * output must still include the full computed diff summary

### 12.4 Prefix safety

If `prefix` is implemented:

* only matching keys are listed as managed current keys
* only matching desired keys are applied
* keys outside the prefix must never be deleted or modified

---

## 13. Error handling requirements

Errors must be actionable and clearly categorized.

The implementation should distinguish at least:

* configuration errors
* parse/validation errors
* AWS authentication/authorization errors
* target KVS not found errors
* concurrency/retry exhaustion errors
* unexpected internal errors

Error messages must:

* be concise
* identify the failing phase
* identify the relevant file or key when possible

Examples:

* `Failed to parse JSONC file: cloudfront/kvs/allowlist.jsonc`
* `Duplicate key found in source file: allow_ip:stg:203.0.113.10`
* `Failed to describe CloudFront KeyValueStore: <arn>`
* `KVS update failed after 3 retries due to concurrent modification`

---

## 14. Project structure requirements

A recommended structure:

```text
.
├─ src/
│  ├─ index.ts
│  ├─ inputs.ts
│  ├─ parser.ts
│  ├─ normalize.ts
│  ├─ diff.ts
│  ├─ aws/
│  │  └─ kvs-client.ts
│  ├─ log.ts
│  ├─ errors.ts
│  └─ types.ts
├─ dist/
│  └─ index.js
├─ action.yml
├─ package.json
├─ tsconfig.json
├─ README.md
└─ SPEC.md
```

This structure is not mandatory, but separation of concerns is required.

---

## 15. GitHub Action interface requirements

### 15.1 Action type

* Use a JavaScript action executed by Node.js

### 15.2 Entrypoint

* `action.yml` must point to `dist/index.js`

### 15.3 Example `action.yml` shape

```yaml
name: Sync CloudFront KVS from JSONC
description: Synchronize Amazon CloudFront KeyValueStore contents from a repository JSONC file
inputs:
  kvs-arn:
    required: true
    description: ARN of the target CloudFront KeyValueStore
  file:
    required: true
    description: Path to the JSONC source file
  dry-run:
    required: false
    default: "false"
  delete-missing:
    required: false
    default: "true"
  fail-on-empty:
    required: false
    default: "true"
  max-preview-items:
    required: false
    default: "50"
  log-level:
    required: false
    default: "info"
  aws-region:
    required: false
    default: "us-east-1"
runs:
  using: node20
  main: dist/index.js
```

Node 20 is preferred unless there is a strong reason to choose another currently supported GitHub Actions Node runtime.

---

## 16. Usage example

```yaml
name: Sync CloudFront KVS

on:
  push:
    branches: [main]
    paths:
      - cloudfront/kvs/**

permissions:
  contents: read
  id-token: write

jobs:
  sync-kvs:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - uses: your-org/sync-cloudfront-kvs-action@v1
        with:
          kvs-arn: ${{ secrets.CLOUDFRONT_KVS_ARN }}
          file: cloudfront/kvs/allowlist.jsonc
          dry-run: "false"
          delete-missing: "true"
```

---

## 17. Testing requirements

### 17.1 Unit tests

Must cover:

* canonical format parsing
* flat object format parsing
* duplicate key detection
* invalid value type detection
* diff generation
* delete-missing true/false behavior
* fail-on-empty behavior
* prefix filtering behavior if implemented

### 17.2 Integration-style tests

Should cover:

* mocked AWS SDK pagination
* mocked concurrency retry behavior
* no-op sync path
* dry-run path
* destructive sync path

### 17.3 Build verification

CI must verify:

* TypeScript typecheck passes
* build succeeds
* `dist/index.js` is produced

### 17.4 Fixture-based tests

Use fixture JSONC files for realistic source examples.

---

## 18. Performance requirements

* The implementation must be efficient enough for typical CI usage
* It should avoid unnecessary write calls when no changes are needed
* It must use paginated listing correctly
* It should avoid O(n²) diff logic for large key sets
* Internal diff computation should be map/set based

Recommended performance target:

* handle at least several thousand keys without pathological slowdown in CI

---

## 19. Dependency requirements

* Keep runtime dependencies minimal
* Prefer well-maintained libraries
* A JSONC parser library may be used instead of custom parsing
* AWS SDK v3 is required for AWS interactions

Recommended examples:

* `@actions/core`
* `@actions/github` only if actually needed
* `jsonc-parser` or similar
* `@aws-sdk/*` packages required for the CloudFront KeyValueStore API

Do not introduce unnecessary frameworks.

---

## 20. Maintainability requirements

* Keep the logic modular and testable
* Separate pure functions from AWS side effects
* Avoid hidden state
* Prefer explicit types
* Use narrow interfaces around AWS SDK calls so they are easy to mock
* Keep README aligned with actual behavior

---

## 21. Security requirements

* Do not log AWS credentials
* Do not log full KVS values by default
* Treat source file values as sensitive by default
* Avoid executing repository file content as code
* Parse JSONC using a proper parser library, not `eval`, not `vm`
* Validate all external inputs
* Fail closed on parse or validation errors

---

## 22. Recommended implementation notes

### 22.1 Parsing

Use a real JSONC parser library. Do not implement parsing by evaluating the file as JavaScript.

### 22.2 Internal data model

Normalize source data early into a plain structure such as:

```ts
type DesiredState = Map<string, string>;
```

### 22.3 Diff model

Use a structure such as:

```ts
type DiffResult = {
  puts: Array<{ key: string; value: string }>;
  deletes: Array<{ key: string }>;
  unchangedCount: number;
};
```

### 22.4 AWS abstraction

Wrap AWS calls behind a small service interface so the diff and sync orchestration remain easy to test.

---

## 23. Acceptance criteria

The implementation is complete when all of the following are true:

1. A repository JSONC file can define the desired KVS contents
2. The action reads and validates the JSONC file correctly
3. The action detects additions, updates, and deletions correctly
4. The action can synchronize the target KVS to match the source file
5. The action supports dry-run mode
6. The action fails safely on invalid input
7. The action does not require GitHub Script
8. The codebase is written in TypeScript
9. The built artifact is emitted to `dist/index.js`
10. The action can be invoked from GitHub Actions as a standalone reusable custom action

---

## 24. Nice-to-have future extensions

These are out of scope for the first implementation but should be considered in the design.

* PR comment summary support
* Markdown diff output for GitHub Actions summary
* prefix-scoped sync as a first-class feature
* support for multiple source files merged into one desired state
* optional value redaction modes
* optional strict key naming conventions
* optional import/export helper CLI
* optional per-key metadata validation
* optional check mode for CI validation without deployment

---

## 25. Implementation guidance for Codex

Prioritize:

1. correctness
2. safety
3. testability
4. small and clear design

Avoid:

* overengineering
* unnecessary abstractions
* shelling out to AWS CLI
* custom JSONC parsing hacks
* silent coercion of invalid values

The expected first implementation should be a clean, production-usable v1, not an experimental prototype.
