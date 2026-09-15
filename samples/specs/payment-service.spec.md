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

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.

- The service MUST take card payments through the payment provider's hosted form.
  - Example: a customer pays a 20 EUR basket with a Visa card and comes back to
    the shop with the order marked paid.
  - Example: the provider declines the card; the order stays unpaid and the
    customer is offered another payment method.
- The service MUST record every payment attempt with its order, amount, currency and outcome.
  - Example: three attempts on the same order, two declined and one accepted,
    are all readable in the back office with their timestamps.
- The service SHOULD support Apple Pay and Google Pay.
- The service MAY offer to save a card for later payments.

### Security

Agreed with the security team on 2026-08-12.

- The service MUST NOT store card numbers or security codes.
- The back office SHOULD NOT show more than the last four digits of a card
  number to support staff.

## Open questions

- Do we need 3-D Secure exemptions for low amounts?
