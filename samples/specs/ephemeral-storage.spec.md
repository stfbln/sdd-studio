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
- A spec can extend one or several more general specs: an "Extends: [Title](relative/path.spec.md),
  [Other](relative/other.spec.md)" line right under the title (e.g. an ephemeral storage policy
  extending a data storage policy, a persistent storage policy extending it and an audit logging
  policy). Their requirements, and those of the specs they extend, apply to this spec too.
- Do not copy inherited requirements: only write here what is specific, or a requirement that
  overrides an inherited one by changing its key word (same sentence, e.g. SHOULD becoming MUST).
  When two specs extended disagree, the one written first applies; restate the requirement here to
  settle it.
- Keep this comment.
-->

# Ephemeral storage

Extends: [Data storage](./data-storage.spec.md)

Caches, queues and scratch space: stores the shop can lose without losing
anything a customer or an accountant would miss.

## Context

The checkout cache, the session store and the working files of the import jobs.
Losing them costs latency and work, not data: whatever they hold can be rebuilt
from a persistent store.

## Requirements

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.

- Every item MUST be written with a time to live of seven days at most.
  - Example: a basket is cached for two hours; once the customer comes back a
    day later, the checkout reads the basket from the orders database again.
- A component MUST keep working, slower, when the store answers that it holds
  nothing.
  - Example: the checkout cache is emptied during a failover; the next requests
    are served from the orders database and only latency changes.
- An ephemeral store MUST NOT be the only place holding data an invoice, a
  shipment or an audit depends on.
- An ephemeral store MUST NOT be backed up.
- Personal data SHOULD NOT be written to an ephemeral store; when it is, the
  time to live MUST be one day at most.
  - Example: a delivery address kept in the checkout cache is dropped after
    four hours.
