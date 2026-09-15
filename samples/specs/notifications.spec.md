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
- Keep this comment.
-->

# Notifications

Sends emails and push notifications when an order changes.

## Requirements

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.

### Platform

- The service MUST expose prometheus metrics at `/metrics`
