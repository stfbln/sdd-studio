# SDD Studio

A VS Code extension for **Specification-Driven Development**: write standard spec files through visual forms, while the files stay plain text on disk.

- **Less technical users** edit specs with forms, buttons and tables.
- **Power users** keep editing the same files in the text editor, with git, diff and search. The visual editor and the text editor stay in sync.

Each spec format is a *module*. Available modules: **Gherkin** (`.feature` files), **OpenAPI** (3.0 / 3.1) and **AsyncAPI** (2.x / 3.0) in YAML or JSON, **gRPC / Protobuf** (`.proto` files), **OpenCLI** command line descriptions in YAML or JSON, **Specs**: markdown documents with the RFC 2119 requirements of a system or component that no specific spec can hold, **Threat models** in the [Open Threat Model](https://github.com/iriusrisk/OpenThreatModel) format (OTM 0.2.0) in YAML or JSON, **OpenSLO**: service level objectives in the [OpenSLO](https://github.com/openslo/openslo) format, and the **Software catalog**: [Backstage](https://backstage.io/docs/features/software-catalog/descriptor-format) catalog files that glue everything together (systems, components, APIs, resources, data assets, owners, and which spec files and threat models apply to each of them).

**Each fact has one home.** The software catalog is the entry point and the source of truth for what exists, who owns it and how it fits together. The specific spec files linked from its entities (API definitions, features, threat models) are the source of truth for what they describe. The markdown spec of an entity only holds the requirements none of them can express. AI assistants and other extensions work with the files through an [API and MCP server](#api-and-mcp-server-for-ai-assistants) that advertises this.

## Home page

The **SDD Studio** icon in the Activity Bar, on the left next to the Explorer, opens the side view of the extension:

- **Home:** an **Open SDD Studio** button, which opens the home page as a full editor tab.
- **Documents:** one row per kind of spec, with how many files the workspace holds and how many problems were found in them. Clicking a kind unfolds its files, in folder order, each opening in its form editor; the button on the right of the row opens the catalog page of the kind instead. Files that cannot be read, or that have problems, carry an error or warning icon.
- **Miscellaneous:** **Prompts** and **Consolidated Catalog**, the two pages that are not about one kind of file.

The same page is opened by **SDD Studio: Open SDD Studio** and by the first entry of the **SDD Studio** menu in the Explorer title bar.

The page gathers everything in one place:

- **Catalog:** the [Software Catalog](#software-catalog-module-backstage) page and the [consolidated catalog](#software-catalog-module-backstage) of a workspace folder.
- **Specifications:** one card per format, saying what those files are for, how many the workspace holds and how many problems were found in them. Click one to open its [catalog page](#spec-catalogs), where specs are browsed, created and organised.
- **AI assistants:** the [prompts page](#prompts-for-ai-assistants), [update instructions](#update-instructions-for-ai-assistants) for every spec file of the workspace, and the [MCP server](#api-and-mcp-server-for-ai-assistants) configuration for Claude Code.

Counts refresh as files change, both on the page and in the side view, and the page comes back after a window reload.

The same entries are in the **SDD Studio** menu of the Explorer title bar: the home page, then the prompts page and the consolidated catalog, then the catalog page of each format under the name of the page it opens (**Features**, **API Specifications**, …). Creating a file is done from a catalog page or from the Explorer context menu on a folder.

## Gherkin module

Opening a `.feature` file shows the visual editor. Use the **Open as Text** button in the editor title bar to switch to text, and **Open in Visual Editor** to switch back.

What you can do:

| Area | What you can do |
| --- | --- |
| Feature | Name, tags, description, Gherkin language (70+ languages, keywords are translated when you switch) |
| Blocks | Add, reorder, duplicate, delete and collapse Background, Scenario, Scenario Outline and Rule |
| Steps | Keyword picker (Given/When/Then/And/But/`*`), text suggestions from the steps already used in the workspace, data tables, doc strings |
| Keyboard | `Enter` adds a step, `Backspace` on an empty step deletes it, `Alt+↑/↓` moves a step |
| Parameters | Type `<name>` in a step, or select a value and click the **{x}** button: the value becomes `<name>`, the scenario becomes an outline, and the value is added to the Examples table |
| Examples | Columns come from the parameters used in the steps. Missing columns and unused columns are flagged, with one-click **Add column** and **Rename** fixes. Pasting from a spreadsheet or a Gherkin/Markdown table fills several cells at once. **Preview** shows the scenarios each row will generate |
| Safety | Invalid Gherkin (for example after a manual edit) shows the errors with links to their lines, and the form becomes read-only until the file is fixed |

### Features overview

**SDD Gherkin: Features** opens the catalog page of all features (see [Spec catalogs](#spec-catalogs)). It is also available from the **SDD Studio** menu in the Explorer title bar, **All features** in the visual editor toolbar, and the Explorer context menu on a folder.

Other commands (Command Palette → *SDD Gherkin*):

- **New Feature File**: quick creation from an input box, also available from the Explorer context menu on folders.

Settings:

- `sdd.gherkin.featuresFolder` (default `specs/features`): default folder for new features in the Features overview.
- `sdd.gherkin.stepSuggestions` (default `true`): suggest step texts found in the workspace's `.feature` files.

### How files are written

The text document is the single source of truth. Changes made in the forms are written to the document as regular text edits, so dirty state, **Ctrl+S**, **Ctrl+Z** and hot exit work as they do for any file.

When you edit through the forms, the file is rewritten in a canonical layout: 2-space indentation, aligned table columns, one blank line between blocks. Comments are kept and attached to the element that follows them. Just opening a file never modifies it.

To make text the default editor for `.feature` files, add this to your settings:

```json
"workbench.editorAssociations": { "*.feature": "default" }
```

## OpenAPI module

Files named `*.openapi.yaml|yml|json` or `openapi.yaml|yml|json` open in the **form editor**. Any other YAML or JSON file with an `openapi:` field shows an **Open in Form Editor** button in the editor title bar. **Open as Text** switches back.

| Page | What you can edit |
| --- | --- |
| General | Title, version, description, contact, license, servers, tags (renaming a tag updates the operations using it), plus a list of problems |
| Path | Rename the path template, add operations by HTTP method, parameters shared by all operations |
| Operation | Method, summary, operationId (with a generate button), tags, deprecated, parameters (path/query/header/cookie), request body and responses with their media types and schemas |
| Schema | Rename (every `$ref` is updated), type, format, nullable, enum, object properties (name, type, required, description) with nested objects and arrays, and where the schema is used |

Types include references: choose `→ Pet` in any type selector to point at a component schema.

**Checks:** missing `info.title`/`version`, operations without responses, undeclared path parameters (with a one-click **Declare it**), duplicate operationIds and references to missing schemas. Problems are shown in the outline and link to the right page.

**How the file is written:** the form never rewrites the whole document. Each change is applied as a targeted edit (set a value, delete a key, rename a key in place) on the YAML or JSON text:

- comments, key order, quoting, inline lists and every field the form doesn't know about are preserved;
- JSON files keep their indentation;
- if a YAML file mixes formatting styles the serializer cannot reproduce exactly, a banner warns that the first form edit will also normalize that formatting.

Constructs the form doesn't edit (`allOf`/`oneOf`/`anyOf`/`not`, shared parameters and responses, security schemes, callbacks...) are shown read-only with a link to the text editor, and are never modified. Swagger 2.0 files are detected and left to the text editor.

**SDD OpenAPI: API Specifications** opens the catalog page of all OpenAPI documents of the workspace (see [Spec catalogs](#spec-catalogs)). Any `.yaml`, `.yml` or `.json` file declaring `openapi:` (or `swagger:`) is listed, whatever its name. Each row shows the title, version, operation and schema counts, the number of problems, and flags Swagger 2.0 files. Moving a spec that references other files with relative `$ref`s asks for confirmation first, because those references are not updated.

**SDD OpenAPI: New OpenAPI Specification** creates a starter `<slug>.openapi.yaml` (or JSON) from an API name.

Settings:

- `sdd.openapi.specsFolder` (default `specs/apis`): default folder for new specifications in the API Specs overview.

A sample is available in `samples/api/petstore.openapi.yaml` in the source repository.

## AsyncAPI module

Files named `*.asyncapi.yaml|yml|json` or `asyncapi.yaml|yml|json` open in the **form editor**. Any other YAML or JSON file with an `asyncapi:` field shows an **Open in Form Editor** button in the editor title bar. It works like the OpenAPI editor: the text stays the source of truth, and each change is a targeted edit that keeps comments, key order, quotes and unknown fields.

Both **AsyncAPI 2.x** (2.0–2.6) and **3.0** are supported; the form adapts to the version of the file.

| Page | AsyncAPI 3.0 | AsyncAPI 2.x |
| --- | --- | --- |
| General | Title, version, description, default content type, id, contact, license, servers (host, pathname, protocol), tags | Same, servers with `url` and protocol |
| Channel | Rename the id (references are updated), address, title, description, parameters (undeclared `{name}` in the address flagged with **Declare it**), messages of the channel, operations using it with **+ send / + receive** | Rename the address, description, parameters, **publish** / **subscribe** operations |
| Operation | Action (send/receive), rename, channel, title, summary, description, which channel messages it uses | Kind (publish/subscribe) with an explanation, operationId (with generate), summary, description, message (reference or inline) |
| Message | Rename (references are updated), name, title, summary, content type, description, payload and headers with the schema editor, where it is used | Same |
| Schema | Rename, type, properties, formats, enums, nested objects/arrays, where it is used | Same |

**Checks:** missing title/version, undeclared or unused channel parameters, 3.0 operations without a valid action or channel, 3.0 operations using messages that don't belong to their channel, duplicate operationIds (2.x) and broken local references.

Payloads in other schema formats (Avro, RAML...), `oneOf` messages and other components (security schemes, bindings, traits...) are shown read-only and kept as they are. AsyncAPI 1.x files are left to the text editor.

**SDD AsyncAPI: AsyncAPI Specifications** lists every AsyncAPI document of the workspace (see [Spec catalogs](#spec-catalogs)), and **SDD AsyncAPI: New AsyncAPI Specification** creates a starter 3.0 `<slug>.asyncapi.yaml`.

Settings:

- `sdd.asyncapi.specsFolder` (default `specs/apis`): default folder for new specifications in the AsyncAPI Specs overview.

Samples: `samples/api/order-events.asyncapi.yaml` (3.0) and `samples/api/user-events-v2.asyncapi.yaml` (2.6).

## gRPC / Protobuf module

`.proto` files open in the **form editor** (**Open as Text** in the title bar switches back). As for the other modules, the file stays the source of truth: the form parses it and each change replaces, inserts or removes only the tokens or lines concerned, so comments, blank lines, indentation, option styles and constructs unknown to the form are kept.

proto3, proto2 and editions files are read. The sidebar lists services with their RPCs, messages with their nested types, and top-level enums.

| Page | What you can edit |
| --- | --- |
| General | Syntax (proto2 / proto3), package, imports (with their status: well-known, found in the workspace with a link, or not found), code generation options (`go_package`, `java_package`, `java_multiple_files`, `csharp_namespace`, `optimize_for`...), plus a list of problems |
| Service | Rename, description, deprecated, RPC list with streaming badges, **Add RPC** (optionally creating empty `<Name>Request` / `<Name>Response` messages) |
| RPC | Rename, description, request and response messages with **stream** toggles (unary, server, client or bidirectional streaming is explained), link to the message or **Create message**, `idempotency_level`, deprecated |
| Message | Rename (references in the file are updated, nested types included), description, fields table (number, cardinality: single / `optional` / `repeated` / `required` in proto2 / `map`, type, name), field details (description, oneof membership, JSON name, deprecated), oneofs, nested messages and enums, reserved numbers and names, where the message is used |
| Enum | Rename (references updated), description, values (name, number, description, deprecated), `allow_alias`, reserved numbers and names, where the enum is used |

**Types:** type inputs suggest scalars, the types of the file, the types of its imports, the well-known types (`google.protobuf.Timestamp`...) and the types of the other `.proto` files of the workspace. Picking a type that is not imported yet also adds the import. References are written as short as possible (`Order.Line`, `common.v1.Money`). New field and enum value numbers are suggested after the highest used or reserved one (skipping 19000–19999).

**Descriptions** are the `//` comments right above a declaration, which code generators copy into the generated code.

**Checks:** missing syntax or package, names defined twice, duplicate or out-of-range field numbers, numbers or names that are reserved, `required` in proto3, invalid map keys, labels on oneof or map fields, empty oneofs, enums whose first value is not 0 (proto3), duplicate enum numbers without `allow_alias`, unknown types, and RPCs whose request or response is not a message. Unknown types are only reported when every import was found.

**Imports** are looked up like `protoc -I`: in the folders of the `sdd.proto.importPaths` setting, then in every folder from the edited file up to the workspace root, then in any workspace file whose path ends with the import.

Groups, `extend` blocks, extension ranges and custom options (for example `(google.api.http)`) are shown read-only and kept; their line opens in the text editor. Renames only update the edited file: other files importing a renamed type must be updated separately.

**SDD gRPC: gRPC / Protobuf Files** lists every `.proto` file of the workspace (see [Spec catalogs](#spec-catalogs)), and **SDD gRPC: New Proto File** creates a starter proto3 `<name>.proto` with a service, one RPC and its messages.

Settings:

- `sdd.proto.specsFolder` (default `specs/protos`): default folder for new files in the Proto Files overview.
- `sdd.proto.importPaths` (default none): extra import roots, relative to the workspace folder.

Samples: `samples/proto/orders/v1/order_service.proto`, which imports `samples/proto/common/v1/money.proto`.

## OpenCLI module

[OpenCLI](https://opencli.org) describes a command line tool: its commands, subcommands, options, arguments and exit codes. Files named `*.opencli.json|yaml|yml` or `opencli.json|yaml|yml` open in the **form editor**. Any other YAML or JSON file with an `opencli:` version next to `info` or `command` shows an **Open in Form Editor** button in the editor title bar. As with OpenAPI, the text stays the source of truth: each change is a targeted edit that keeps comments, key order, quotes and unknown fields.

The sidebar shows the command tree, starting with the executable (the root command).

| Page | Contents |
| --- | --- |
| General | Title, version, summary, description, contact, license (with SPDX identifiers), conventions (separator between an option and its value, grouping of short options), OpenCLI version, plus a list of problems |
| Command | Name, usage line (`acme deploy [OPTIONS] <SERVICE>`), description, aliases, hidden, interactive. **Arguments** in order: name, number of values, required, description; details for accepted values, group, hidden, metadata. **Options**: name, aliases, value name (empty for a flag), required, description; details for recursive, hidden, group, values (with the same argument editor) and metadata. Recursive options inherited from parent commands are listed. **Subcommands**, **exit codes** (with common codes), **examples**, **metadata**, and a **help preview** of what `--help` could print |

Arguments, options, subcommands and examples can be reordered, since order matters in OpenCLI. Typed names are turned into conventions: `Output format` becomes `--output-format` for an option (value name `OUTPUT_FORMAT`), and `List All` becomes `list-all` for a command.

The number of values uses plain choices: exactly one (the default, no `arity` written), zero or one, one or more, zero or more, or a custom range. A missing `maximum` means unlimited, as the specification describes.

**Checks:** missing version, title, root command or command names; duplicate subcommand names or aliases; options sharing a name or alias; options hiding a recursive option of a parent; duplicate argument names; invalid arity (negative, minimum above maximum); required arguments that accept zero values; optional arguments followed by required ones; arguments taking several values that are not last; duplicate or non-integer exit codes; metadata without a name; invalid contact email or URLs.

**Older drafts:** files that put the root command fields (`options`, `commands`...) at the top level, as OpenCLI drafts before April 2026 did, are edited in place. The General page offers **Move them into command** to switch to the current layout. The conventions separator is written as `optionSeparator` (the JSON schema name) unless the file already uses `optionArgumentSeparator` (the name in the specification text).

**SDD OpenCLI: CLI Specifications** lists every OpenCLI description of the workspace (see [Spec catalogs](#spec-catalogs)), and **SDD OpenCLI: New CLI Specification (OpenCLI)** creates a starter `<slug>.opencli.json` with `--help`, `--version`, exit codes and an example.

Settings:

- `sdd.opencli.specsFolder` (default `specs/clis`): default folder for new descriptions in the CLI Specs overview.

Samples: `samples/cli/acme-deploy.opencli.yaml` (nested commands, recursive options, accepted values) and `samples/cli/todo.opencli.json`.

## Specs module (markdown, RFC 2119)

A spec is a plain markdown file listing the requirements of a catalog entity using the [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) key words. It is the general spec: it only holds what the catalog and the specific spec files cannot express (quality targets, compliance, business rules and constraints), and links to them instead of restating them. Files named `*.spec.md` open in the **form editor**. Other markdown files whose `## Requirements` section has list items with a key word in capitals show an **Open in Form Editor** button in the editor title bar. The markdown stays the source of truth: the form only rewrites the lines a change concerns.

The form always shows every part, but the file only contains the parts that are filled:

```markdown
# Payment service

Extends: [Data storage](./data-storage.spec.md)

Takes card and wallet payments for the web shop.

## Context

Called by the order service once the customer confirms the basket.

## Requirements

*The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.*

#### ✅ MUST

*An absolute requirement of the specification (also written REQUIRED or SHALL).*

##### The service MUST take card payments through the payment provider's hosted form.

Keeps the shop out of the scope of PCI DSS.

**Card accepted**\
A customer pays a 20 EUR basket with a Visa card and comes back to the shop with the order marked paid.

**Example 2**\
The provider declines the card; the order stays unpaid.

#### 👍 SHOULD

*Recommended: there may exist valid reasons in particular circumstances to ignore the requirement, but the full implications must be understood and carefully weighed before choosing a different course (also written RECOMMENDED).*

##### The service SHOULD support Apple Pay and Google Pay.

### Security

#### ⛔ MUST NOT

*An absolute prohibition of the specification (also written SHALL NOT).*

##### The service MUST NOT store card numbers or security codes.
```

| Part | Written as |
| --- | --- |
| Title | The first `#` heading |
| Extends | An `Extends: [Title](path)` line right under the title, with the specs separated by commas (see [Specs that extend other specs](#specs-that-extend-other-specs)), removed when the last one goes |
| Description | The text between the title (or the Extends line) and the first `##` section |
| Context | A `## Context` section, removed when emptied |
| Requirements | A `## Requirements` section: the BCP 14 conformance sentence of RFC 8174 in italics (can be turned off), the requirements, and optional `###` groups (e.g. Security) with their own. A group is written as soon as it is named, even empty, and stays until it is deleted; the section goes when it has no requirement or group left |
| Key words | Under the section, and under each group, a `####` heading per key word in the order MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, its icon first (`#### ✅ MUST`, see `sdd.spec.keywordIcons`), followed by the definition of the key word after RFC 2119 in italics. A heading is written with the first requirement using its key word and goes with the last one; requirements without a key word in capitals come last, under `#### ❔ No key word` |
| Requirement | A `#####` heading holding the sentence, on one line, under the heading of its key word |
| Description | The text under the requirement heading, before its examples: details, rationale |
| Examples | After the description: a title in bold followed by a backslash, which breaks the line once rendered (`**Card accepted**\`, or `**Example 2**\` for an example without a title), the case on the next line, and a blank line between examples |

Inherited requirements are never written to the file: they stay in the spec that states them and the form reads them from there.

**Requirements** are sentences with a key word in capitals: **MUST** / **MUST NOT** (absolute), **SHOULD** / **SHOULD NOT** (recommended, exceptions need a valid reason), **MAY** (optional). The other RFC 2119 words are read as their equivalent (SHALL and REQUIRED as MUST, SHALL NOT as MUST NOT, RECOMMENDED as SHOULD, NOT RECOMMENDED as SHOULD NOT, OPTIONAL as MAY) and kept as written.

- Each row has a **key word picker** next to the sentence: picking a level replaces the key word in the sentence (or a lowercase "must", "should"...) and moves the requirement under the heading of that key word, the keyboard focus following it. The picker follows what you type: typing another key word in the sentence moves it too, while a sentence whose key word is being retyped stays where it is.
- The **add box** takes a full sentence as typed, or composes one: with MUST selected, `Take card payments` becomes `The service MUST take card payments`, reusing the subject of the last requirement (or the title). A preview shows the sentence before it is added.
- The form lists the requirements of each group as the file does, under a header per key word with its meaning.
- Requirements can be edited in place, reordered within their key word, moved to another group (under the same key word there), and deleted. Deleting the text of a requirement and leaving it removes it. While a requirement is being edited, a box to write its **description** and a box to add an example show under it (Shift+Enter in the sentence moves to the description); a description, like examples, stays shown once written. Groups can be added (empty, then filled by adding requirements or moving existing ones into them), renamed, reordered and deleted with their content.
- The Requirements header counts requirements per key word, their examples and the inherited ones; the outline on the left shows the groups, each with the number of requirements written here and, after a `+`, the number it inherits.

**Specs written in an older layout.** Specs written before key word headings, with each requirement as a list item under `## Requirements` or a group and its examples as nested `- Example: ...` items, are still read: the form shows them under key word headers, in the order they will be written. So are key word headings written with another icon or none, a conformance sentence or definitions without italics, and example titles in italics without a backslash. The first change made in the form, whatever it is, writes the whole Requirements section in the current layout: the first paragraph of a list item becomes the heading, what follows it (nested lists, other paragraphs) its description, its examples are numbered, and notes between items are kept before the first key word heading. Opening a file never changes it.

### Example scenarios

A requirement can carry **example scenarios**: one concrete case each, with real values, showing what the requirement means. The beaker button of a requirement opens its examples; they are written after its description and move, are copied to another group and are deleted with it. An example can have a short **title**, typed in the box in front of its case (when adding it or later) and written in bold above it; without one it is numbered (`**Example 2**\`), and renumbered when the examples move.

```markdown
##### The service MUST record every payment attempt with its order, amount, currency and outcome.

**Three attempts**\
Three attempts on the same order, two declined and one accepted, are all readable in the back office.

**Example 2**\
A refused attempt shows the reason given by the provider.
```

Examples are edited in place (Shift+Enter for a second line), reordered and deleted like requirements, and one left without title or case is removed when you leave it. They illustrate a requirement, they do not replace a [Gherkin feature](#gherkin-module): behaviour shown step by step, with its Given / When / Then, belongs in a feature file, and a requirement can link to it.

### Specs that extend other specs

A spec can **extend** one or several more general ones, so that shared rules are written once: a *Data storage* spec holds what every store follows, an *Ephemeral storage* spec extends it, and a *Persistent storage* spec extends it together with an *Audit logging* spec. The link is an `Extends: [Title](path), [Other](other-path)` line right under the title, written by the **Extends** field of the Overview section, which lists the specs already extended and a picker for the other specs of the workspace folder.

```markdown
# Persistent storage

Extends: [Data storage](./data-storage.spec.md), [Audit logging](./audit-logging.spec.md)
```

- Every spec inherited from — the specs extended, in the order they are written, then the specs *those* extend, and so on — has its requirements shown **in the Requirements section itself**, in the group they belong to: the inherited ones come first in each group, read-only, each naming the spec it comes from with a link to open it, then the requirements this spec writes itself. A spec reached through two different parents is listed once.
- A group that only the specs extended have is shown after the groups of this spec, marked *inherited*; adding a requirement to it creates the group here with that requirement. Groups are matched by name, whatever their case.
- A requirement of the child that says the same thing as an inherited one with **another key word overrides it** (`Data SHOULD be encrypted at rest` becoming `Data MUST be encrypted at rest`): the inherited one is struck through and marked *overridden here*. Restating an inherited requirement without changing its key word is reported as a problem instead: it applies already.
- When two specs extended **disagree** (the same requirement at two levels), the one listed first applies: the other is struck through and marked as overridden by it, and the form reports the disagreement so the child can settle it by restating the requirement.
- A missing file, a path outside the workspace folder, a spec extending one that extends it back, and chains deeper than 10 specs are reported in the form.

**Kept as written:** front matter, other `##` sections (listed with a link to their line in the text editor), notes or tables before the first key word heading of the section or a group (they move and are deleted with their group), a conformance sentence worded otherwise, the text under a key word heading when it is not its definition, a `####` heading naming no key word, and task boxes (`##### [x] ...`). Lines of the description or context that would start a `#`/`##` heading are escaped (`\##`), and so are lines of details and examples that would start a heading or, in italics at the start of a paragraph, an example; a code block left open is closed, so typed text never breaks the structure.

**Checks:** missing title, several level-1 headings, several Context or Requirements sections (only the first is edited), groups with the same name, empty requirements, requirements without a key word in capitals (with a hint when it is written in lowercase, which RFC 8174 excludes), a requirement written under the heading of another key word, the same requirement listed twice, empty or repeated examples, an Extends line naming the same spec twice or pointing to something that is not a markdown file, and, in the form, specs extended that cannot be read, a requirement that repeats an inherited one and two specs extended that disagree.

**SDD Specs: Specs** lists the specs of the workspace (see [Spec catalogs](#spec-catalogs)), and **SDD Specs: New Spec (Markdown)** asks for the name of the system or component and creates `<slug>.spec.md` holding only its title.

Settings:

- `sdd.spec.specsFolder` (default `specs/generics`): default folder for new specs in the Specs overview.
- `sdd.spec.keywordIcons` (default ✅ MUST, ⛔ MUST NOT, 👍 SHOULD, 👎 SHOULD NOT, 🆗 MAY, ❔ No key word): icon written in front of each key word in the `####` headings; an empty string writes the key word alone. A spec is read whatever icons it was written with (an emoji, a `:shortcode:`, an image...) and gets the icons of the settings at its next change.

Samples: `samples/specs/payment-service.spec.md` (all parts, a description and titled examples, a Security group with a note, another section), `samples/specs/notifications.spec.md` (title and description only) and a hierarchy of policies: `samples/specs/data-storage.spec.md` (the general one), extended by `samples/specs/ephemeral-storage.spec.md` and by `samples/specs/persistent-storage.spec.md`, which overrides its "Data SHOULD be encrypted at rest" with a MUST and also extends `samples/specs/audit-logging.spec.md`.

## Threat model module (Open Threat Model)

A threat model is an [Open Threat Model](https://github.com/iriusrisk/OpenThreatModel) (OTM 0.2.0) document in YAML or JSON. Files named `*.otm.yaml`, `*.otm.yml` or `*.otm.json` open in the **form editor**. Other YAML/JSON files with an `otmVersion` field show an **Open in Form Editor** button in the editor title bar. As for the API modules, the form applies targeted edits: comments, key order, blank lines and fields the form does not know about are kept.

The outline lists the **project** and every element of the model. Each element has its own page:

| Page | What you edit |
| --- | --- |
| Project | Name, id, owner and contact, tags, description, OTM version, representations (diagrams with their size, code repositories, other threat models), attributes. The **threat register** lists every threat found on a component or dataflow with its state and mitigations |
| Trust zone | Id, type, parent trust zone, description, trust rating, what it contains (with **Add component here**), where it appears in representations, attributes |
| Component | Id, type, parent (trust zone or component), tags, description, assets it processes or stores, threats with their state and mitigations, its dataflows, representations, attributes |
| Dataflow | Id, source and destination (components or trust zones), both ways, tags, description, assets it carries, threats, attributes |
| Asset | Id, description, confidentiality, integrity and availability with a comment, where it is used |
| Threat | Id, categories (STRIDE suggestions), CWEs, tags, description, likelihood and impact with comments, where it is found |
| Mitigation | Id, description, risk reduction, where it is applied |

- **Risk values** (trust rating, confidentiality, integrity, availability, likelihood, impact, risk reduction) go from 0 to 100 and are edited with a slider and a number.
- **References are picked, not typed:** parents, dataflow ends, threats and mitigations are selects listing the elements of the model; assets are checkboxes. A value pointing to nothing stays visible and is marked as missing. **Link a threat…** and **Add a mitigation…** can also create the threat or mitigation by name.
- **Threat and mitigation states** are free text with suggestions (`exposed`, `mitigated`, `partly-mitigated`, `not-applicable`; `required`, `recommended`, `implemented`, `rejected`, `not-applicable`), since OTM does not fix their values.
- **Ids:** changing an id (Enter or leaving the field) also updates every reference to it. New elements get an id made from their name (`Payments API` → `payments-api`), unique among trust zones and components together, since a dataflow end may be either.
- **New elements** are written with the fields OTM requires: trust rating, asset risks, likelihood, impact and risk reduction start at 50; a component is placed in the first trust zone with type `generic`; a dataflow goes from the first to the second component.
- **Deleting** an asset, threat or mitigation also removes the links to it (asset lists, threat and mitigation entries). Deleting a trust zone or component keeps what points to it, so the broken parents and dataflow ends show up as problems; the delete button says how many references are concerned.

**Checks:** missing required fields (OTM version, project name and id, element ids, names, component types, parents, dataflow ends), ids used twice, trust zone and component sharing an id, references to missing trust zones, components, assets, threats, mitigations or representations, parents forming a loop, risk values outside 0–100, threats or mitigations without a state, dataflows going to themselves, and warnings for assets, threats and mitigations that nothing uses and CWEs not written `CWE-<number>`.

**SDD Threat Model: Threat Models** lists the threat models of the workspace (see [Spec catalogs](#spec-catalogs)), and **SDD Threat Model: New Threat Model (OTM)** asks for the name of the system and creates `<slug>.otm.yaml` with the project and empty lists of elements.

Settings:

- `sdd.otm.threatModelsFolder` (default `specs/threat-models`): default folder for new threat models in the Threat Models overview.

Sample: `samples/threat-models/online-shop.otm.yaml` (two trust zones, three components with a diagram, dataflows, assets, threats and mitigations).

## OpenSLO module

An [OpenSLO](https://github.com/openslo/openslo) file describes the service level objectives of a service: how they are measured, and how burning their error budget too fast is alerted on. Files named `*.openslo.yaml` or `*.openslo.yml` open in the **form editor**. Any other YAML file with an `apiVersion: openslo/...` field shows an **Open in Form Editor** button in the editor title bar. As for the other YAML/JSON modules, the form applies targeted edits: comments, key order and fields it doesn't know about are kept.

A file holds one object per YAML document (`---`-separated), of one of seven kinds. Objects reference each other by `metadata.name`, scoped to the file. The outline groups them by kind:

| Kind | What it holds |
| --- | --- |
| Service | What the SLOs are measured for |
| SLO | A target on an indicator, with an error budget: the service, an indicator (an existing SLI or one declared inline), budgeting method (Occurrences or Timeslices), one or more time windows, one or more objectives, and the alert policies watching it |
| SLI | An indicator: a ratio (good / total, optionally bad) or a threshold metric, each backed by a metric source (type, optional data source, free-form query) |
| DataSource | Where indicators query their metrics: type (Prometheus, Datadog, CloudWatch, New Relic, Splunk…) and connection details |
| AlertPolicy | When to alert (no data, breaching, resolved), from its conditions and notification targets |
| AlertCondition | A burn rate threshold (kind, threshold, lookback window, alert-after) that triggers a policy |
| AlertNotificationTarget | Where an alert is sent (Slack, Email, PagerDuty, Webhook, Opsgenie, MS Teams…) |

The **Overview** page lists every object by kind, with a table of Services and their SLOs and a table of SLOs with their objective count and budgeting method, and creates new objects of any kind.

- **References are picked, not typed:** an SLO's service, indicator (SLI) and alert policies, and an alert policy's conditions and notification targets, are selects listing the objects of the file. A value pointing to nothing is flagged.
- **Renaming** an object (Enter or leaving the name field) updates every reference to it in the file. **Deleting** it removes the list entries pointing to it (an SLO's alert policies, a policy's conditions and notification targets); single references (an SLO's service or indicator) are kept and flagged as broken, and the delete button says how many are concerned.
- **Objectives** are a ratio (0.99 = 99%), not a percentage.

**Checks:** `apiVersion` other than `openslo/v1`, unknown kind, missing `metadata.name`, a name used twice by the same kind, missing `spec`, an SLO without a service, a valid indicator (`indicatorRef` or inline), a budgeting method, at least one time window and one objective, an SLI without a ratio or threshold metric (and their metric source type), a DataSource without a type, an AlertCondition without a condition kind, threshold or lookback window, an AlertNotificationTarget without a target, and references (`service`, `indicatorRef`, `alertPolicies`, `conditions`, `notificationTargets`) that don't match any object of the file.

**SDD OpenSLO: Service Level Objectives** lists the OpenSLO files of the workspace (see [Spec catalogs](#spec-catalogs)), and **SDD OpenSLO: New OpenSLO File** asks for the name of the service and creates `<slug>.openslo.yaml` with a Service and an SLO with an inline ratio SLI.

Settings:

- `sdd.openslo.specsFolder` (default `specs/slos`): default folder for new files in the OpenSLO Files overview.

Sample: `samples/slos/checkout-service.openslo.yaml` (a service, a Prometheus data source, an SLI, a PagerDuty notification target, a fast-burn alert condition and policy, and an availability SLO tying them together).

## Software catalog module (Backstage)

A catalog file is a [Backstage catalog descriptor](https://backstage.io/docs/features/software-catalog/descriptor-format): a YAML file with one entity per document (`---` separated), which Backstage can read as is. Files named `catalog-info.yaml`, `catalog-info.yml`, `*.catalog-info.yaml` or `*.catalog-info.yml` open in the **form editor**. Other YAML files starting with a `backstage.io/` `apiVersion` show an **Open in Form Editor** button. Only the entity you edit is written again: the other documents of the file keep their exact text, and the edited one keeps its comments and key order.

The outline shows the file as a hierarchy:

- **Software:** domains (and subdomains), then the systems of each domain, then the components (and subcomponents), APIs, resources and data assets of each system. An entity whose parent lives in another catalog file shows it (`in Online shop`). The **+** asks for the kind and the name; parts of a system go into the file's system when there is only one.
- **Infrastructure:** networks nested in their parent network, platforms, infrastructure and sites. **Code and artifacts:** repositories and artifacts.
- **Organization:** groups (nested by parent group) and users. **Locations:** other catalog files Backstage should read. Kinds without a form (such as `Template`) are listed under **Other kinds**.

| Entity | What you edit |
| --- | --- |
| Domain | Owner, parent domain, type; its systems and subdomains (with **Add system** / **Add subdomain**) |
| System | Owner, domain, type; its components, APIs, resources and data assets (with add buttons), and a **coverage** table of what each part implements and the threat models applying to it |
| Component | Type (service, website, library, cli, mobile-app…), lifecycle, owner, system, parent component; **specifications**, **threat models**, provided and consumed APIs, **code** (repository and path), the **platforms and infrastructure** it is deployed on, the **networks** it runs in or uses, **data assets** and **artifacts** it uses, dependencies and **what it does with each one** (reads from, calls…), subcomponents |
| API | Type, lifecycle, owner, system, and the **definition**: a spec file of the workspace, written as `$text: ../api/orders.openapi.yaml` so Backstage shows it |
| Resource | Type (database, queue, s3-bucket, external-service…), owner, system, networks, data assets, artifacts, platforms and infrastructure it is deployed on, code, dependencies, specifications, threat models |
| Data asset | A Resource of type `data-asset`: classification (public, internal, confidential, restricted), owner, system, the resources storing it, threat models. The components and resources using it are listed under Relations |
| Network | A Resource of type `network`: the threat model **trust zone** it stands for (with its trust rating), parent network, IP ranges, subnetworks, its **site**, and what runs in it |
| Artifact | A Resource of type `artifact` (package, container image, Dockerfile, chart, binary…): artifact type, package URL (purl), **produced by** an entity of the catalog (component, system, team or repository) or supplied by an **external organization**, repository, users |
| Repository | A Resource of type `repository`: provider (GitLab, GitHub, Bitbucket, Perforce, Subversion…), URL or server address, default branch or stream, and the components, resources, artifacts, platforms and infrastructure whose code it **holds** |
| Platform | A Resource of type `platform`: what it runs on (Kubernetes cluster, PaaS, serverless platform…), its **site**, code, what is **deployed** on it, the networks, data assets and artifacts it uses |
| Infrastructure | A Resource of type `infrastructure`: what it runs on (VM, bare-metal server, container host…), its **site**, code, what is **deployed** on it, the networks, data assets and artifacts it uses |
| Site | A Resource of type `site`: a cloud provider region or physical location, with a cloud provider and a region or address, and the networks, platforms and infrastructure it **hosts** |
| Group / User | Type, parent, display name, email, child groups, members; groups also list what they own |
| Location | Type, target and targets, with a picker of the other catalog files of the workspace |

Every page starts with the title and the **description** of the entity, edits the name, namespace, tags, links, labels and annotations, and lists the **relations** pointing to the entity (owns, provided by, consumed by, used by, runs in this network, uses this network, reads from this resource, produces, holds code for, deployed here, hosts, members…). Descriptions also show when hovering entity links and in contents lists.

**Linking specs and threat models.** The form knows the spec files of the workspace (from the other modules) and the entities of the other catalog files:

- **Specifications → Link a spec file…** on a component: an OpenAPI, AsyncAPI, gRPC or OpenCLI file is linked the Backstage way, through an API entity: the API whose definition is that file is added to `providesApis`, or a new API entity is created for it (type from the file, owner, lifecycle and system copied from the component). Markdown specs, Gherkin features and OpenSLO files, and any spec file linked to other entities, go to the `sdd-studio/specs` annotation.
- **Threat models → Apply a threat model…** writes the `sdd-studio/threat-models` annotation. A threat model applied to a system or domain also applies to everything inside it; the pages show the inherited ones and where they come from.
- Paths are written relative to the catalog file (`../specs/payment-service.spec.md`), like Backstage's `$text`. Clicking a linked file opens it in its own editor.

**Creating specs and threat models from the catalog.** Next to the pickers, **New spec file…** (Specifications), **Create the spec file…** (Definition of an API) and **New threat model** (Threat models) create the file for the entity, link it as above and open it. The name starts as the entity title (`Shop API events` for an AsyncAPI spec of *Shop API*) and can be changed; the file goes to the default folder of its kind (`specs/generics`, `specs/features`, `specs/apis`, `specs/protos`, `specs/clis`, `specs/threat-models`, `specs/slos`), with `-2`, `-3`… when the name is taken. The skeleton is filled with what the catalog knows:

| File | Filled from the catalog |
|---|---|
| Markdown spec | Title; a description pointing to the catalog entry (`component:shop-api` in `../catalog/online-shop.catalog-info.yaml`), which stays the source of truth for the owner, system, APIs, dependencies, networks and data and links the other spec files; an empty **Requirements** section with the BCP 14 sentence. Catalog facts are not copied: the spec only gets the requirements the catalog and the specific spec files cannot express. An entity has one markdown spec |
| Feature | Tags, description and the same sentence, with a first scenario to rewrite |
| OpenAPI / AsyncAPI | Title, description, contact (owning team and its email), first link as external docs (OpenAPI), tags (AsyncAPI); empty paths, channels, operations and components |
| gRPC | Package from the system and the name (`online_shop.shop.v1`), an empty service with the description as comment |
| OpenCLI | Title, description, contact, and the usual `--help`, `--version` and exit codes |
| OpenSLO | A Service object named after the entity, with its description; the SLOs are added afterwards in the OpenSLO editor |
| Threat model | Project name, id, description, owner, contact and tags; the part of the catalog it covers (see below) |

A threat model covers the components and resources of the entity (a component and its subcomponents, the parts of a system or of the systems of a domain, the providers of an API, the users of a data asset, network or artifact) and what they talk to: their dependencies, the providers of the APIs they consume and their users.

- **Trust zones** are the networks they run in, with their parent networks. A network already standing for a trust zone keeps its id, name, type and trust rating; the other ones get a trust rating of 50 and their `sdd-studio/trust-zone` annotation points to the new threat model. Components in no network go to a *Not placed yet* trust zone.
- **Components** keep the entity name as id, the title and description, a type from the Backstage type (`service` → `web-service`, `website` → `web-application`, `database`, `queue` → `message-broker`…), and their data assets (`processed` by components, `stored` by resources and by the resources a data asset depends on).
- **Dataflows** go from a component to what it depends on, and to the provider of each API it consumes (named after the API).
- **Assets** are the data assets used, with a confidentiality from their classification (public 10, internal 40, confidential 70, restricted 100). Repositories with a URL become `code` representations. Threats and mitigations start empty.

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: shop-api
  annotations:
    sdd-studio/specs: ../specs/payment-service.spec.md, ../features/shop.feature
    sdd-studio/threat-models: ../threat-models/online-shop.otm.yaml
spec:
  type: service
  lifecycle: production
  owner: checkout-team
  system: online-shop
  providesApis:
    - petstore-api        # API entity with definition: $text: ../api/petstore.openapi.yaml
  dependsOn:
    - resource:card-data  # data asset
```

**Networks and threat models.** A network points to a trust zone of an Open Threat Model file (`sdd-studio/trust-zone: ../threat-models/online-shop.otm.yaml#private`). Components and resources run in networks through `dependsOn` entries, so the Backstage graph shows them too; a network they only use or connect to (the internet reached by a service running in the private network) says so in its relationship, and is not where they run. When a threat model applies to an entity and has a component with the same id (or name), the form compares both sides: *Online shop places Orders database in trust zone Private network, like its networks*. A difference is reported as a problem, with a **Place it like the threat model** button. **Import networks from a threat model…** on the overview creates one network per trust zone that has none yet in the workspace, nested like the trust zones and named after their ids.

**Repositories and artifacts.** A component, API, resource, artifact, network, platform or infrastructure names the repository holding its code and the path inside it (`sdd-studio/repository`, `sdd-studio/repository-path`). The form then writes Backstage's own `backstage.io/source-location` (for example `url:https://gitlab.com/acme/shop/-/tree/main/services/shop-api/`) and keeps it up to date when the repository URL, provider, branch or path changes; a value written by hand is left alone. Web layouts are known for GitLab, GitHub, Gitea and Bitbucket; other providers get the repository URL when there is no sub-path, and Perforce or Subversion servers without a web URL get no source location. An artifact is produced by a component, system, team or repository of the catalog (`sdd-studio/produced-by`) or supplied by an external organization (`sdd-studio/supplier`), and components use it through `dependsOn`.

**Platforms, infrastructure and sites.** A component or resource names the platforms and infrastructure it is **deployed on** (`sdd-studio/deployed-on`, a comma-separated list of Resources of type `platform` or `infrastructure`, e.g. a Kubernetes cluster or a VM), shown as a checklist next to the ones for networks, data assets and artifacts, and as a **Deployed here** list on the platform or infrastructure page. A network, platform or piece of infrastructure can point to the **site** (`sdd-studio/site`) it runs in: a Resource of type `site` standing for a cloud provider region or a physical location, with a cloud provider (`sdd-studio/cloud-provider`: aws, azure, gcp, on-prem…) and a region or address (`sdd-studio/region`).

**Relationships.** A `dependsOn` entry only says that an entity depends on another one; by default a component or resource *runs in* a network and *uses* anything else. When that is not what it does, the field next to the dependency (in the Networks, Data assets and Artifacts checklists, and under **Dependencies** for the other ones) says it: picked from *runs in*, *uses*, *connects to*, *calls*, *reads from*, *writes to*, *reads and writes*, *publishes to*, *subscribes to*, *deploys to*, or typed. It is written in `sdd-studio/relationships`, the relationship before the entry of `dependsOn` it is about, and the default is never written. Only the networks an entity runs in place it: they are compared with the threat model, become its trust zones and are drawn as deployment. Diagram arrows and the page of the other entity (*Uses this network*, *Reads from this resource*) say the relationship. Renaming a dependency updates its relationship, removing it removes the relationship, and a relationship naming no dependency is reported.

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: shop-api
  annotations:
    sdd-studio/relationships: uses resource:internet, reads and writes resource:orders-db
spec:
  dependsOn:
    - resource:private     # runs in the private network
    - resource:internet    # uses the internet
    - resource:orders-db   # reads and writes the database
```

```yaml
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: shop-api-image
  annotations:
    sdd-studio/artifact-type: container-image
    sdd-studio/purl: pkg:docker/acme/shop-api
    sdd-studio/produced-by: shop-api
    sdd-studio/repository: shop-repo
    sdd-studio/repository-path: services/shop-api
    backstage.io/source-location: url:https://gitlab.com/acme/shop/-/tree/main/services/shop-api/
spec:
  type: artifact
  owner: checkout-team
```

- **References** (owner, system, domain, parent, provided APIs, dependencies, members…) are typed or picked from the entities of this file and of the other catalog files of the workspace folder, and written in their short form (`checkout-team`, `resource:orders-db`). Below a single reference, the form shows where it leads (and the file defining it) or why it leads nowhere.
- **Names:** renaming an entity (Enter or leaving the field) also updates the references of this file, keeping how each one is written. New entities get a name made from their title (`Shop API` → `shop-api`), unique for their kind, and the fields Backstage requires: components and APIs start `experimental`, owners default to the owner most used in the file.
- **Deleting** an entity removes the list entries pointing to it (provided APIs, dependencies, members…). Single references (owner, system…) are kept and reported, and the delete button says how many are concerned.

**Checks:** what Backstage rejects (missing `apiVersion`, `kind`, name or required spec fields such as type, lifecycle, owner, definition, children, member of, target; invalid names, namespaces, tags, label and annotation keys; references that are not entity references, lack a kind where Backstage needs one — `dependsOn: [component:x]` — or point to the wrong kind; the same entity twice in a file; parents forming a loop, trust zones not written `file#id`), and warnings for references not defined in the workspace catalog files, entities also defined in another file, unknown lifecycles, linked spec files, threat models, API definitions or location targets that do not exist, trust zones missing from their threat model, networks and threat models placing an entity differently, IP ranges that are not CIDR blocks, package URLs that do not look like purls, references (repository, produced by, deployed on, site…) pointing to the wrong kind of entity, relationships that are not written `relationship kind:name` or name no dependency, and repositories without a URL.

**Diagrams (Mermaid).** The **Diagram** page of the outline exports a chosen part of the catalog as a [Mermaid](https://mermaid.js.org/) flowchart, to draw C4 context (C1) and container (C2) diagrams. It asks four questions:

1. **What the diagram is about:** pick one or more entities from the tree of the outline (Software, Infrastructure, Code and artifacts, Organization), with a filter, a **Select all** per group and, next to an entity that holds others, a button taking it with everything inside it. They get a stronger outline in the diagram.
2. **What else to include:** everything the focus is connected to, and nothing else — entities the catalog records no relationship with are not listed. They come grouped by how they relate: **Around it** (the system, domain or network holding the focus), **Inside it** (what it holds), then **APIs**, **Dependencies**, **Deployment**, **Code and artifacts** and **Ownership**, each row saying what the entity is and how it relates (*provides Petstore API*, *used by Shop API*, *hosts Shop API*). Ticking one also turns on the kind of arrow that explains why it is there, so the diagram says it; **Add all** takes a whole group. The target button next to an entity moves it into the focus, so what *it* connects to shows up in turn.
3. **Anything unrelated to add:** folded away until asked for, the rest of the catalog as the same tree — for entities the catalog does not link to the focus yet.
4. **Look:** what each box says, the direction, and which groups of relationships become arrows.

Then:

- **The hierarchy is nesting, not arrows:** an entity is drawn inside the entity it belongs to (a component in its system, a system in its domain, a subcomponent in its component, a network in its parent network). Leaving an entity out does not lose its parts: they move up to the closest entity that is drawn.
- **The other relationships become labelled arrows,** by group: **APIs** (`provides`, `consumes`), **Dependencies** (`uses`, or the relationship written: `reads from`, `calls`, `uses` a network…), **Deployment** (`runs in` a network, `runs on` a platform, `hosted at` a site), **Code and artifacts** (`code in`, `builds`) and **Ownership** (`owns`), the last three dashed and off by default. Both sides of a relationship (`dependsOn` and `dependencyOf`) give one arrow.
- **What each box says:** the display name alone, or the name with what the entity is (`[Component · service]`) and its description, wrapped to keep boxes narrow. Direction is left to right or top to bottom. The entities the diagram is about keep a thicker outline.
- Shapes and colours come from the kind of entity (APIs are rounded, resources are cylinders, data assets are slanted, networks and sites are hexagons, teams are rounded boxes) and are written in the diagram itself, so it looks the same wherever it is rendered.
- **Copy** puts the Mermaid source on the clipboard; **Save as markdown** writes it to `docs/diagrams/<title>.md` inside a ```` ```mermaid ```` block (GitHub, GitLab and the VS Code markdown preview render it) and opens it, asking first when the file already exists.

Samples exported from `samples/catalog/online-shop.catalog-info.yaml`: `samples/diagrams/online-shop-containers.md` (the system with its components, APIs, database and data asset) and `samples/diagrams/online-shop-deployment.md` (the same parts with the networks, cluster, VM and site they run on).

**Consolidated catalog.** **SDD Software Catalog: Open Consolidated Catalog** (also in the editor title bar of a catalog file, the Explorer context menu of a folder and the SDD Studio menu) shows every catalog file of a workspace folder merged in one form, so you can keep a catalog for shared things (teams, networks, repositories) and one per organization or system, and still work on everything at once:

- The outline, overview, coverage and problems cover all the files. **All catalog files** at the top of the outline narrows it to one file; problems on the overview start with their file.
- References, renames and deletes work across files: renaming a team in the shared file updates the owners written in every other file.
- Each entity page shows its catalog file, with **Move to file…**: the entity is removed from one file and added at the end of the other, and the paths it writes (linked specs, threat models, trust zones, API definitions, location targets) are rewritten for its new folder. Comments inside a moved entity are not kept.
- New entities go to the file of the page they are created from (a data asset created from a component goes to the component's file). The outline **+** has a file choice, and the **Catalog files** section of the overview says where entities created from the overview go, lists the entity and problem counts of each file, and creates new catalog files.
- Edits are written to the file of each entity (only the entities concerned are rewritten) and saved right away, except in files that already had unsaved changes, which are left for you to save. Changes made to the files elsewhere (text editor, git, new files) show up in the view. A file with syntax errors is reported and its entities are left out until it is fixed.

**SDD Software Catalog: Software Catalog** lists the catalog files of the workspace (see [Spec catalogs](#spec-catalogs)), and **SDD Software Catalog: New Catalog File (Backstage)** asks for the name of a system and creates `<slug>.catalog-info.yaml` with that system.

Settings:

- `sdd.backstage.catalogFolder` (default `specs/catalogs`): default folder for new catalog files in the Software Catalog overview.
- `sdd.backstage.diagramsFolder` (default `docs/diagrams`): folder where the Diagram page saves exported Mermaid diagrams.

Sample: `samples/catalog/online-shop.catalog-info.yaml` (a domain, a system, a service and a CLI, two APIs pointing to the sample OpenAPI and AsyncAPI files, a database, a data asset, two networks standing for the trust zones of the sample threat model, a GitLab repository, an image built by the service, one built by the repository and an external PostgreSQL image, a Kubernetes cluster and a VM deployed on an AWS site, and two teams, linked to the sample markdown spec, feature and threat model).

## Update instructions for AI assistants

Spec files can say at their top how to update them, so that an AI assistant (or a person) editing the text keeps them valid. SDD Studio reads and writes the files as they are: the forms and an assistant can work on the same files.

| Files | What is written at the top |
| --- | --- |
| OpenAPI, AsyncAPI, OpenCLI, threat models (YAML) | A `# yaml-language-server: $schema=…` line linking the JSON schema of the format and version (the YAML extension of VS Code also validates against it), then comment lines with the rules the schema does not cover |
| Software catalog files | The Backstage schema, then the SDD Studio conventions: `sdd-studio/…` annotations, Resource types, networks, artifacts, repositories, paths relative to the file |
| Gherkin features | Comment lines: link to the Gherkin reference and how to write steps, outlines and tags (below `# language:` when there is one) |
| Protocol Buffers | `//` comment lines: link to the language guide, style guide, field numbering and imports |
| OpenSLO | Comment lines linking to the OpenSLO reference (it has no published JSON schema, so no modeline): kinds, how objects reference each other by name, and the fields an SLO and an SLI require |
| Markdown specs | An HTML comment (invisible once rendered): sections, groups, key word headings, one `#####` heading per requirement with its description, titled example scenarios, the Extends line and what not to copy from the spec extended |
| JSON files | JSON has no comments, so only the schema link: `"$schema"` (OpenCLI, threat models) or `"x-json-schema"` (OpenAPI and AsyncAPI, which only allow `x-` extensions) |

Sample header of an OpenAPI file:

```yaml
# yaml-language-server: $schema=https://spec.openapis.org/oas/3.0/schema/2024-10-18
# How to update this file (for people and AI assistants): an OpenAPI 3.0 document, see
#   https://spec.openapis.org/oas/v3.0.4.html.
# - Keep the file valid against the JSON schema of the first line; when you change "openapi", link
#   the schema of that version.
# - Give every operation a unique operationId and at least one response; declare each {parameter} of
#   a path as an "in: path" parameter.
# ...
```

The first rule is the **purpose** of the file: what it is for and what belongs in other files (for an OpenAPI file: owner and consumers in the catalog, behaviour in features, quality targets in the markdown spec, threats in the threat model).

- **New files** created by SDD Studio get the header, unless `sdd.instructions.addToNewFiles` is off.
- **Existing files:** **SDD Studio: Add Update Instructions for AI Assistants** writes it in the active file, or in the files and folders selected in the Explorer (right-click). **SDD Studio: Add Update Instructions for AI Assistants to All Spec Files** (also in the SDD Studio menu) does every spec file of the workspace after a confirmation. Files already open with unsaved changes stay unsaved; the others are saved.
- **Kept up to date:** the header is recognised by its first lines, so running the command again replaces it with the current text instead of adding a second one. The forms refresh a header already present when they edit the file, so the schema link follows a change of OpenAPI or AsyncAPI version.
- Deleting the first entity of a catalog file keeps the header: it is separated from the first entity by a blank line.

Settings:

- `sdd.instructions.addToNewFiles` (default `true`): write update instructions at the top of new spec files.

## Prompts for AI assistants

**SDD Studio: Open Prompts for AI Assistants** (also in the SDD Studio menu) opens a page writing prompts for an LLM assistant such as Claude Code. Each prompt explains how the workspace works (the catalog as the entry point, each fact in the file that owns it), lists the [MCP tools](#api-and-mcp-server-for-ai-assistants) to use and gives the steps to follow. The prompt updates as you type; **Copy** it or **Open in Editor** to adjust it before pasting it in the assistant.

| Prompt | You give | The assistant is asked to |
| --- | --- | --- |
| **New system** | Name, owner and domain (suggested from the catalog), context, and the assets you already know (components, APIs, resources, data assets with their classification, networks, teams) with a quick explanation | Reuse what the catalog holds, write the catalog file first (`create_catalog_file`), then the API definitions, the Gherkin features, the threat model (optional) and, last, a markdown spec with the requirements no other file can hold; check every file; list assumptions and open questions. Specs only, no code |
| **Update specs** | The entities to update, picked from the catalog (components and resources by default, grouped by system), and the change | Read each entity and its files, decide which file owns each part of the change, update the catalog first when entities change, keep interfaces compatible or raise their version, check the entities consuming or depending on them, update the threat model, check the files |
| **Implement specs** | The entities to implement, and notes (stack, where the code goes, what to leave out) | Treat the specs as the source of truth; read the provided and consumed API definitions, features, requirements, threat models and code location; implement the interfaces exactly; turn features and MUST requirements into tests; implement mitigations; run the tests; report a traceability table and the spec problems found |

Options: ask questions (or show the plan) before writing, and include a threat model in a new system. The page keeps your drafts, and warns when the MCP server is off, with a button to configure Claude Code.

## API and MCP server for AI assistants

SDD Studio exposes what it knows to AI assistants (Claude Code, GitHub Copilot…) through an **MCP server**, and to other VS Code extensions through the API returned by its activation. Both offer the same operations:

| MCP tool | API method | What it does |
| --- | --- | --- |
| `describe_spec_kinds` | `describeSpecKinds()` | For each kind of file: its purpose, what it is the source of truth for, what belongs in other files, how the catalog links it, formats, default folder and editing rules; plus the source of truth rules |
| `list_catalog_entities` | `listCatalogEntities()` | Entities of the catalog files, filtered by category or text, with their linked files |
| `get_catalog_entity` | `getCatalogEntity(ref)` | Everything the catalog knows about an entity: owner and contact, system, domain, parts, APIs and their definitions, dependencies, networks, data assets, specs and threat models (inherited ones included) |
| `list_spec_files` | `listSpecFiles()` | Spec files, threat models and catalog files with their key facts, problem counts, errors and the entities linking them |
| `check_spec_file` | `checkSpecFile(path)` | Syntax errors and problems as the forms report them (unsaved changes included), and a warning when no entity links the file |
| `create_catalog_file` | `createCatalogFile(options)` | Creates a catalog file for a new system or domain in the catalog folder, from the given YAML or a system named after the title, with the update instructions header. Spec files can be created for its entities once it is saved |
| `create_spec_file` | `createSpecFile(options)` | Creates a spec file or threat model **for a catalog entity** in the default folder of its kind, from the given content or a skeleton filled from the catalog, with the update instructions header, and links it from the entity like the form does (API definitions through API entities, other files through annotations) |
| `link_spec_file` | `linkSpecFile(options)` | Links an existing spec file or threat model from an entity |

The server tells assistants when they connect how to work: start from the catalog entry, keep each fact in the file that owns it, link files instead of restating them, create files through SDD Studio so they are linked. It refuses to give an entity a second markdown spec or an API a second definition: the assistant is told to update the existing file.

**Review.** By default, files created and catalog changes are left **open and unsaved** for you to review: a new file only exists on disk once you save it, and closing it without saving discards it. Turn on `sdd.api.writeWithoutReview` to let assistants and extensions write and save directly (a catalog file that already had unsaved changes is still left unsaved).

**Connecting.**

- **VS Code chat (GitHub Copilot):** the server is registered with VS Code; nothing to configure.
- **Claude Code:** run **SDD Studio: Configure Claude Code (MCP)**. It adds the server to the `.mcp.json` of the workspace folder, using the environment variables `SDD_STUDIO_MCP_URL` and `SDD_STUDIO_MCP_TOKEN` rather than the address and token themselves, so the file can be committed:

  ```json
  { "mcpServers": { "sdd-studio": { "type": "http", "url": "${SDD_STUDIO_MCP_URL}", "headers": { "Authorization": "Bearer ${SDD_STUDIO_MCP_TOKEN}" } } } }
  ```

  SDD Studio sets these variables in the terminals of its window and for processes started by other extensions, so each VS Code window reaches its own server. Start Claude Code from a terminal opened after SDD Studio started (VS Code marks older terminals as needing a relaunch), and approve the project server when Claude Code asks.
- **Other clients:** **SDD Studio: Copy claude mcp add Command** copies a command with the address and the token. Set `sdd.mcp.port` to keep the address stable.

The server listens on `127.0.0.1` only, answers `POST /mcp` (Streamable HTTP, stateless) and requires the bearer token, generated once and kept in VS Code's secret storage. It also rejects requests whose `Host` is not the loopback address, which keeps web pages out. The **SDD Studio MCP** output channel shows its address.

For extensions:

```ts
const api = await vscode.extensions.getExtension<SddStudioApi>('sdd.sdd-studio')?.activate();
const { brief } = await api!.getCatalogEntity('component:shop-api');
await api!.createSpecFile({ kind: 'gherkin', entity: 'component:shop-api', content: 'Feature: Checkout\n...' });
```

The types are in `src/api/types.ts`.

Settings:

- `sdd.mcp.enabled` (default `true`): run the MCP server.
- `sdd.mcp.port` (default `0`, a free port for each window): port of the MCP server.
- `sdd.api.writeWithoutReview` (default `false`): write and save without leaving changes open for review.

## Spec catalogs

Each module has a catalog page listing its specs: **Features**, **API Specifications** (OpenAPI), **AsyncAPI Specifications**, **gRPC / Protobuf Files**, **CLI Specifications** (OpenCLI), **Specs** (markdown), **Threat Models** (OTM), **Service Level Objectives** (OpenSLO), **Decisions** (ADRs) and **Software Catalog** (Backstage). The [home page](#home-page) and the **SDD Studio** menu in the Explorer title bar open them, each under the name of its page.

- **Browse:** specs are grouped by folder, with their name, tags, key facts, problems and syntax errors. The filter matches names, paths and tags. Click a spec to open it in its visual editor.
- **Create:** type a name. The file name is generated as a slug (`Checkout with a credit card` → `checkout-with-a-credit-card.feature`, `Orders API` → `orders-api.openapi.yaml`, `Order events` → `order-events.asyncapi.yaml`, `Acme deploy tool` → `acme-deploy-tool.opencli.json`, `Payment service` → `payment-service.spec.md`, `Online shop` → `online-shop.otm.yaml` or `online-shop.catalog-info.yaml`, `Checkout service` → `checkout-service.openslo.yaml`, and with underscores for proto files: `Order service` → `order_service.proto`) and can still be edited. For OpenAPI, AsyncAPI, OpenCLI and threat models, choose YAML or JSON. Pick an existing folder or type a new path, which is created for you.
- **Organise:** create subfolders inline, drag a spec onto a folder to move it (or use **Move to folder…**), reveal it in the Explorer, or delete it (with confirmation).

## Development

```bash
npm install
npm run build       # bundles dist/extension.js and dist/webview/*
npm run watch       # rebuild on change
npm test            # unit tests (Gherkin, OpenAPI, AsyncAPI, Protobuf, OpenCLI, markdown spec, threat model, OpenSLO and software catalog cores, helpers)
npm run typecheck
npm run package     # produces sdd-studio-<version>.vsix
```

Press **F5** in VS Code to launch an Extension Development Host with the `samples/` folder.

### Architecture

```
src/
  extension.ts                  registers every module, returns the API
  api/
    types.ts                    API for other extensions (SddStudioApi)
    service.ts                  the API: kinds and purposes, catalog entities, spec files, creating, linking and checking files, review or direct write
    mcpServer.ts                MCP tools and server instructions over Streamable HTTP on 127.0.0.1 (token, Host check), no VS Code dependency
    index.ts                    runs the server with the settings, VS Code MCP provider, terminal environment, Claude Code commands
  modules/
    types.ts                    SddModule interface
    */core/instructions.ts      update instructions of each format (schema link, docs, rules)
    gherkin/
      index.ts                  module entry: custom editor + commands
      core/                     VS Code-independent, unit tested
        model.ts                JSON model shared by host and webview
        parse.ts                .feature text → model (@cucumber/gherkin)
        serialize.ts            model → canonical .feature text
        parameters.ts           <parameter> detection, Examples helpers
        dialects.ts             i18n keywords, language translation
        files.ts                feature file naming and template
        summary.ts              catalog row of a .feature file
        protocol.ts             host ⇄ visual editor messages
      host/
        GherkinEditorProvider.ts  CustomTextEditorProvider, document sync
        featureKind.ts          features in the spec catalog, step suggestions
      webview/                  React UI of the visual editor
    openapi/
      index.ts                  module entry: form editor, spec detection, commands
      core/openapi.ts           operations, $refs, problems, starter template
      core/summary.ts           OpenAPI detection and catalog row
      host/apiSpecKind.ts       API specs in the spec catalog
      webview/                  React UI: outline, pages
    asyncapi/
      index.ts                  module entry: form editor, spec detection, commands
      core/asyncapi.ts          2.x / 3.0 channels, operations, messages, renames, problems, template
      core/summary.ts           AsyncAPI detection and catalog row
      host/asyncSpecKind.ts     AsyncAPI specs in the spec catalog
      webview/                  React UI: outline, general, channel/operation and component pages
    proto/
      index.ts                  module entry: form editor with the proto engine, commands
      core/parse.ts             .proto text → syntax tree keeping source positions and comments
      core/edits.ts             targeted edits on the text (rename, set type/number/option, add, delete, move)
      core/analysis.ts          type resolution, renames with references, checks, numbering, template
      core/document.ts          text + tree used by the form, summary.ts: catalog row
      host/imports.ts           import resolution and types of the workspace proto files
      host/protoKind.ts         proto files in the spec catalog
      webview/                  React UI: outline, general, service/RPC, message and enum pages
    opencli/
      index.ts                  module entry: form editor, spec detection, commands
      core/opencli.ts           command tree (current and older layouts), arity, usage and help text, checks, template
      core/summary.ts           OpenCLI detection and catalog row
      host/cliSpecKind.ts       CLI specs in the spec catalog
      webview/                  React UI: command tree, general and command pages
    spec/
      index.ts                  module entry: form editor with the markdown engine, spec detection, commands
      core/parse.ts             markdown → outline (title, Extends line, description, sections, requirements under key word headings or in lists, with descriptions and examples) with line ranges
      core/keywords.ts          RFC 2119 key words: detection, synonyms, changing the level, composing sentences
      core/edits.ts             line edits that add or remove sections, groups and examples as they get or lose content
      core/inherit.ts           the specs extended: inherited requirements, overrides, disagreements, checks
      core/summary.ts           detection, checks, catalog row, template
      host/specKind.ts          markdown specs in the spec catalog
      host/context.ts           the specs of the workspace and the requirements the edited spec inherits
      webview/                  React UI: outline and the single spec page
    otm/
      index.ts                  module entry: form editor, threat model detection, commands
      core/otm.ts               elements and id references, renames and deletes with their references, checks, template
      core/summary.ts           OTM detection and catalog row
      host/otmKind.ts           threat models in the spec catalog
      webview/                  React UI: outline, project page (threat register) and one page per kind of element
    openslo/
      index.ts                  module entry: form editor, OpenSLO detection, commands
      core/model.ts             kinds (Service, SLO, SLI, DataSource, AlertPolicy, AlertCondition, AlertNotificationTarget), objects and name references
      core/edits.ts             new objects, renames and deletes with their references, template
      core/analysis.ts          checks, core/summary.ts: detection and catalog row
      host/openSloKind.ts       OpenSLO files in the spec catalog
      webview/                  React UI: outline, overview and one page per object
    prompts/
      index.ts                  module entry: prompt page command
      core/prompts.ts           prompts for a new system, spec updates and implementation, referring to the MCP tools
      host/PromptsPanel.ts      prompt page: catalog entities, copy, open as document, MCP status
      webview/                  React UI: tabs, new system form with assets, entity picker, prompt preview
    studio/
      index.ts                  module entry: home page and view commands
      core/home.ts              order of the kinds on the page, core/protocol.ts: its messages
      host/kinds.ts             counts and problems of every registered spec index, opening the catalog page of a kind
      host/StudioPanel.ts       home page: the catalog, every kind of spec and the AI assistant pages
      host/StudioTreeView.ts    SDD Studio views of the Activity Bar: the home button, the documents (every kind unfolding to its files) and the other pages
      webview/                  React UI: hero, cards per kind with what the workspace holds
    backstage/
      index.ts                  module entry: form editor with the multi-document YAML engine, commands
      core/model.ts             entity kinds, entity references, relative paths, hierarchy, specs and threat models of an entity, network placements, source locations
      core/edits.ts             new entities, renames and deletes with their references, linking spec files and threat models, network import and placement, source location sync
      core/consolidated.ts      consolidated catalog: merging files, splitting edits per file, moving entities between files
      core/analysis.ts          checks, core/summary.ts: detection, catalog row, template
      core/brief.ts             what the catalog knows about an entity, threat model draft (trust zones, components, dataflows, assets) for new files
      core/scaffold.ts          text of spec files and threat models created from the catalog
      host/catalogKind.ts       catalog files in the spec catalog
      host/newSpecFile.ts       creates those files in the default folder of their kind
      host/context.ts           spec files, threat model trust zones and catalog entities of the workspace, existence of referenced files
      host/ConsolidatedCatalogPanel.ts  every catalog file of a folder in one form, edits written and saved per file
      webview/                  React UI: hierarchy outline, overview (coverage) and one page per kind of entity
  host/
    catalog/                    generic spec catalog: SpecKind, SpecIndex (and the registry of every module's index), CatalogPanel, file operations
    instructionsCommands.ts     commands writing update instructions in existing spec files
    StructuredSpecEditorProvider.ts  form editor applying targeted edits (YAML/JSON engine by default, pluggable)
    webviewHtml.ts, textEdits.ts  webview HTML shell, minimal text edits
  shared/                       code shared by host and webviews
    structured/                 targeted edits on YAML/JSON text (set, delete, rename key, move array item) and multi-document YAML files, JSON Schema & $ref helpers, editor messages
    instructions.ts             update instructions at the top of spec files: rendering per comment style, finding, adding, refreshing
    purposes.ts                 purpose of each kind of file, what belongs elsewhere, source of truth rules
    mcpTools.ts                 names of the MCP server and its tools
    catalog.ts, files.ts, naming.ts  catalog messages, paths, slugs
  webview/
    catalog/                    React UI of the catalog pages
    structured/                 form editor frame, fields, outline parts, schema editor, document sync
    components/                 UI pieces shared by modules (grid, chips, buttons, styles)
```

To add a module (for example ADRs, or another YAML/JSON format):

1. Create `src/modules/<name>/` with a `core/` model, a host provider and a webview.
2. Export an `SddModule`.
3. Add it to the list in `src/extension.ts`, add a webview entry point in `esbuild.mjs`, and add its `contributes` entries to `package.json`.
4. To get a catalog page, describe the spec with a `SpecKind` (file glob, summary, template, update instructions, editor) and register a `SpecIndex` and `CatalogPanel` for it.
5. For a YAML/JSON format, reuse `StructuredSpecEditorProvider` on the host and `useStructuredDocument`, `EditorFrame`, the fields and `SchemaEditor` from `src/webview/structured` in the webview: the module only writes its pages.
6. For another text format, give `StructuredSpecEditorProvider` an `engine` (parse the text, apply the module's edits to it) and `useStructuredDocument` a matching `LocalEngine`, as the Protobuf module does.
