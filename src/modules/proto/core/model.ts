/**
 * Syntax tree of a .proto file. Every node keeps its source offsets so the form can
 * change one token (a name, a type, a number...) without rewriting the rest of the file.
 * The tree is plain data: it is sent as is to the webview.
 */

/** Offsets in the text, `end` excluded. */
export interface Span {
  start: number;
  end: number;
}

interface NodeBase {
  /** First token of the statement to its `;` or `}` included. */
  span: Span;
  /** Start of the leading comment block (same as span.start without comment). */
  docStart: number;
  /** Leading comment, without comment markers. */
  comment: string;
  /** 1-based line of the first token. */
  line: number;
}

/** `option name = value;` statement, or `name = value` inside `[...]`. */
export interface ProtoOption extends NodeBase {
  /** As written, e.g. `java_package` or `(google.api.http)`. */
  name: string;
  /** Source text of the value, e.g. `"com.acme"`, `true`, `{ get: "/v1" }`. */
  value: string;
  valueSpan: Span;
}

export interface ProtoImport extends NodeBase {
  path: string;
  modifier?: 'public' | 'weak';
}

export interface Token {
  text: string;
  span: Span;
}

export type FieldLabel = 'optional' | 'repeated' | 'required';

export interface ProtoField extends NodeBase {
  kind: 'field' | 'map' | 'group';
  name: string;
  nameSpan: Span;
  label?: { value: FieldLabel; span: Span };
  /** Type as written: `string`, `Order.Item`, `.acme.v1.Order`, `map<string, int32>`; group name for groups. */
  type: string;
  typeSpan: Span;
  mapKey?: string;
  mapValue?: string;
  number: number;
  numberSpan: Span;
  options: ProtoOption[];
  /** `[` to `]` of the inline options. */
  optionsSpan?: Span;
  /** Name of the enclosing oneof. */
  oneof?: string;
}

export interface ProtoOneof extends NodeBase {
  name: string;
  nameSpan: Span;
  body: Span;
  options: ProtoOption[];
}

export interface ProtoReserved extends NodeBase {
  kind: 'numbers' | 'names';
  /** Ranges as written ("4", "9 to 11", "20 to max") or names without quotes. */
  items: string[];
  /** Text between `reserved` and `;`. */
  itemsSpan: Span;
  /** Editions write reserved names as identifiers instead of strings. */
  quoted: boolean;
}

export interface ProtoEnumValue extends NodeBase {
  name: string;
  nameSpan: Span;
  number: number;
  numberSpan: Span;
  options: ProtoOption[];
  optionsSpan?: Span;
}

export interface ProtoEnum extends NodeBase {
  name: string;
  nameSpan: Span;
  /** From after `{` to the `}` excluded. */
  body: Span;
  values: ProtoEnumValue[];
  options: ProtoOption[];
  reserved: ProtoReserved[];
}

/** `extend Foo { ... }` and `extensions 100 to 199;`, shown but not edited by the form. */
export interface ProtoExtend extends NodeBase {
  target: string;
  fields: ProtoField[];
}

export interface ProtoMessage extends NodeBase {
  name: string;
  nameSpan: Span;
  body: Span;
  /** All fields in order, oneof members included (see `field.oneof`). */
  fields: ProtoField[];
  oneofs: ProtoOneof[];
  messages: ProtoMessage[];
  enums: ProtoEnum[];
  options: ProtoOption[];
  reserved: ProtoReserved[];
  extensions: string[];
  extends: ProtoExtend[];
}

export interface RpcSide {
  type: string;
  stream: boolean;
  /** `(` to `)` included. */
  span: Span;
}

export interface ProtoRpc extends NodeBase {
  name: string;
  nameSpan: Span;
  request: RpcSide;
  response: RpcSide;
  /** Undefined when the rpc ends with `;` instead of `{ ... }`. */
  body?: Span;
  options: ProtoOption[];
}

export interface ProtoService extends NodeBase {
  name: string;
  nameSpan: Span;
  body: Span;
  rpcs: ProtoRpc[];
  options: ProtoOption[];
}

export interface ProtoFile {
  /** `syntax = "proto3";` or `edition = "2023";` */
  syntax?: NodeBase & { keyword: 'syntax' | 'edition'; value: string; valueSpan: Span };
  package?: NodeBase & { name: string; nameSpan: Span };
  imports: ProtoImport[];
  options: ProtoOption[];
  messages: ProtoMessage[];
  enums: ProtoEnum[];
  services: ProtoService[];
  extends: ProtoExtend[];
  /** Length of the text, for insertions at the end. */
  length: number;
}

/** Where an element lives: `["message:Order", "field:id"]`. The file itself is `[]`. */
export type ProtoPath = string[];

export interface ProtoProblem {
  message: string;
  line?: number;
}

export class ProtoSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(message);
  }
}
