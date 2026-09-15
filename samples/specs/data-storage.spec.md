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

# Data storage

The rules every store of the online shop follows, whatever holds the data. The
specs of ephemeral and persistent storage extend this one.

## Context

The shop keeps data in a managed PostgreSQL database, in a Redis cache and in
object storage. Which system owns which store is in the software catalog; this
spec only says what they all have in common.

- Agreed with the security team and the data protection officer on 2026-09-01.
- The classification of each data asset (public, internal, confidential,
  personal) is a label of its catalog entry.

## Requirements

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.

- Every store MUST be a resource of the software catalog, owned by a team, with
  the data assets it holds and their classification.
  - Example: the Redis cache of the checkout is a `resource` owned by the
    payments team, holding the basket data asset, classified internal.
- Data MUST be encrypted in transit.
- Data SHOULD be encrypted at rest.
  - Example: the orders database uses the managed encryption of the provider,
    with a key rotated every year.
- A store MUST be reachable only from the network of the system that owns it.
- Personal data MUST be deleted or anonymized when the account it belongs to is
  closed.
  - Example: 30 days after a customer closes their account, their address is
    replaced by a placeholder and their order history keeps only the amounts.

### Access

- Access to a store MUST use a named service account, one per component.
- A service account MUST have the smallest set of rights the component needs.
  - Example: the reporting job reads the orders database with a role that has
    no write right.
- Credentials MUST come from the secret store, and MUST NOT be written in a
  repository or in a container image.
- Human access to production data SHOULD go through a request that is recorded
  and expires.
