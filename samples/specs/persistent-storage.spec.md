<!--
How to update this file (for people and AI assistants): a Markdown specification of requirements,
  see https://www.rfc-editor.org/rfc/rfc8174.
- Purpose: The general spec of a catalog entity: only the requirements the catalog and the specific
  spec files cannot express. What belongs in other files:
  - Owner, system, APIs, dependencies, networks and data: the catalog entry.
  - Endpoints, messages, RPCs and commands: the API definition files.
  - Behaviour shown by examples: Gherkin features. Threats and mitigations: the threat model.
  - Refer to those files with links instead of restating them.
- The catalog entry linking this file (sdd-studio/specs annotation) is the entry point: start there
  to find the owner, the APIs, the dependencies and the other spec files of the entity.
- Structure: a "# Title" heading, a short description, a "## Context" section (background, free
  text) and a "## Requirements" section. Other sections are allowed and kept as written.
- Each requirement is one list item under "## Requirements", or under a "### Group" heading inside
  it, and uses one BCP 14 key word in capitals: MUST, MUST NOT, SHOULD, SHOULD NOT or MAY (also
  SHALL, SHALL NOT, REQUIRED, RECOMMENDED, NOT RECOMMENDED, OPTIONAL).
- Do not write these words in lowercase inside requirements: rephrase instead (e.g. "can" or "is
  allowed to"). Keep the sentence about BCP 14 key words at the start of the Requirements section.
- Say who or what the requirement is about (e.g. "The service MUST ...") and keep one requirement
  per item.
- A requirement can be illustrated by example scenarios: a nested list under it, each item written
  "Example: <one concrete case>" (e.g. "Example: a 20 EUR basket paid with a declined card leaves
  the order unpaid"). Give real values, one case per item, and no expected steps: behaviour shown
  step by step belongs in a Gherkin feature.
- A spec can extend a more general spec: an "Extends: [Title](relative/path.spec.md)" line right
  under the title, pointing to one other markdown spec (e.g. an ephemeral storage policy extending a
  data storage policy). Its requirements and those of its own parents apply to this spec too.
- Do not copy inherited requirements: only write here what is specific, or a requirement that
  overrides an inherited one by changing its key word (same sentence, e.g. SHOULD becoming MUST).
- Keep this comment.
-->

# Persistent storage

Extends: [Data storage](./data-storage.spec.md)

Stores the shop is expected to still hold the same data next year: orders,
payments, invoices and customer accounts.

## Context

The orders database and the invoice bucket. What they hold is read by support,
by the accounting team and, for invoices, by the tax authority.

## Requirements

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.

- Data MUST be encrypted at rest.
- Every store MUST have a retention limit written in the catalog entry of each
  data asset it holds.
  - Example: invoices are kept for ten years, then deleted by the archive job.
- Backups MUST be taken every day and kept for 35 days.
- A restore MUST be tested every quarter, on a real backup, in the staging
  environment.
  - Example: the January test restores the orders database of 6 January into
    staging and the checkout runs against it for a day.
- The recovery point objective MUST be 15 minutes at most, and the recovery
  time objective 4 hours at most.
  - Example: the primary database is lost at 10:05; the standby takes over at
    10:20 with the transactions written until 10:04.
- A schema change that drops or renames a column MUST be released in two steps,
  so the previous version of the component keeps running.

### Deletion

- A deletion asked for by a customer MUST also remove the data from the backups
  within 35 days, or the backups MUST be encrypted with a key destroyed on the
  same schedule.
- An archived store SHOULD be read-only.
