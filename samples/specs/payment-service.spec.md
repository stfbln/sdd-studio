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

# Payment service

Takes card and wallet payments for the web shop and the mobile app, and keeps
the payment history of each order.

## Context

Orders are created by the **order service**, which calls this service once the
customer confirms the basket. Card data never reaches our systems: the
payment provider hosts the card form.

- Peak load: 40 payments per second during sales.
- Refunds are requested by the support team from the back office.

## Requirements

*The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.*

#### ✅ MUST

*An absolute requirement of the specification (also written REQUIRED or SHALL).*

##### The service MUST take card payments through the payment provider's hosted form.

Keeps the shop out of the scope of PCI DSS: card data is typed in the form of
the provider, never in a page of the shop.

**Card accepted**\
A customer pays a 20 EUR basket with a Visa card and comes back to
the shop with the order marked paid.

**Card declined**\
The provider declines the card; the order stays unpaid and the
customer is offered another payment method.

##### The service MUST record every payment attempt with its order, amount, currency and outcome.

**Example 1**\
Three attempts on the same order, two declined and one accepted,
are all readable in the back office with their timestamps.

#### 👍 SHOULD

*Recommended: there may exist valid reasons in particular circumstances to ignore the requirement, but the full implications must be understood and carefully weighed before choosing a different course (also written RECOMMENDED).*

##### The service SHOULD support Apple Pay and Google Pay.

#### 🆗 MAY

*Truly optional: an implementation can include the item or leave it out, and still works with one that made the other choice (also written OPTIONAL).*

##### The service MAY offer to save a card for later payments.

### Security

Agreed with the security team on 2026-08-12.

#### ⛔ MUST NOT

*An absolute prohibition of the specification (also written SHALL NOT).*

##### The service MUST NOT store card numbers or security codes.

#### 👎 SHOULD NOT

*Not recommended: there may exist valid reasons in particular circumstances when the behavior is acceptable or even useful, but the full implications should be understood and the case carefully weighed before implementing it (also written NOT RECOMMENDED).*

##### The back office SHOULD NOT show more than the last four digits of a card number to support staff.

## Open questions

- Do we need 3-D Secure exemptions for low amounts?
