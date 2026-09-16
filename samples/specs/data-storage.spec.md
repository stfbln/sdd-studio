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
- Keep the sentence about BCP 14 key words, in italics, at the start of the Requirements section.
  Requirements can be split into "### Group" headings inside it (e.g. Security).
- Under the section, or under each group, requirements are listed by key word: a "#### MUST"
  heading, then MUST NOT, SHOULD, SHOULD NOT and MAY, in this order, each followed by the definition
  of its key word in italics and left out when it has no requirement. An icon can come before the
  key word (e.g. "#### ✅ MUST"): use the icons already written in the file.
- Each requirement is a "##### <sentence>" heading under the heading of its key word: one sentence
  on one line, saying who or what it is about (e.g. "##### The service MUST ..."), with that BCP 14
  key word in capitals (SHALL and REQUIRED are read as MUST, SHALL NOT as MUST NOT, RECOMMENDED as
  SHOULD, NOT RECOMMENDED as SHOULD NOT, OPTIONAL as MAY). A description (details, rationale) can
  follow under the heading, before the examples.
- Do not write these words in lowercase inside requirements: rephrase instead (e.g. "can" or "is
  allowed to"). Keep one requirement per heading.
- A requirement can be illustrated by example scenarios, after its description: a short title in
  bold followed by a backslash ("**Declined card**\", or "**Example 2**\" without a title), the case
  on the next line, and a blank line between examples. Give real values (e.g. "A 20 EUR basket paid
  with a declined card leaves the order unpaid"), one case per example, and no expected steps:
  behaviour shown step by step belongs in a Gherkin feature.
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

*The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.*

#### ✅ MUST

*An absolute requirement of the specification (also written REQUIRED or SHALL).*

##### Every store MUST be a resource of the software catalog, owned by a team, with the data assets it holds and their classification.

**Example 1**\
The Redis cache of the checkout is a `resource` owned by the
payments team, holding the basket data asset, classified internal.

##### Data MUST be encrypted in transit.

##### A store MUST be reachable only from the network of the system that owns it.

##### Personal data MUST be deleted or anonymized when the account it belongs to is closed.

**Example 1**\
30 days after a customer closes their account, their address is
replaced by a placeholder and their order history keeps only the amounts.

#### 👍 SHOULD

*Recommended: there may exist valid reasons in particular circumstances to ignore the requirement, but the full implications must be understood and carefully weighed before choosing a different course (also written RECOMMENDED).*

##### Data SHOULD be encrypted at rest.

**Example 1**\
The orders database uses the managed encryption of the provider,
with a key rotated every year.

### Access

#### ✅ MUST

*An absolute requirement of the specification (also written REQUIRED or SHALL).*

##### Access to a store MUST use a named service account, one per component.

##### A service account MUST have the smallest set of rights the component needs.

**Example 1**\
The reporting job reads the orders database with a role that has
no write right.

##### Credentials MUST come from the secret store, and MUST NOT be written in a repository or in a container image.

#### 👍 SHOULD

*Recommended: there may exist valid reasons in particular circumstances to ignore the requirement, but the full implications must be understood and carefully weighed before choosing a different course (also written RECOMMENDED).*

##### Human access to production data SHOULD go through a request that is recorded and expires.
