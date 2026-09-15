import {
  ProtoSyntaxError,
  type FieldLabel,
  type ProtoEnum,
  type ProtoEnumValue,
  type ProtoExtend,
  type ProtoField,
  type ProtoFile,
  type ProtoMessage,
  type ProtoOneof,
  type ProtoOption,
  type ProtoReserved,
  type ProtoRpc,
  type ProtoService,
  type RpcSide,
  type Span,
} from './model';

interface Tok {
  kind: 'ident' | 'int' | 'float' | 'string' | 'symbol';
  text: string;
  start: number;
  end: number;
}

interface Comment {
  start: number;
  end: number;
  text: string;
}

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER = /(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
const LABELS = new Set(['optional', 'repeated', 'required']);

function tokenize(text: string, lineOf: (offset: number) => [number, number]) {
  const tokens: Tok[] = [];
  const comments: Comment[] = [];
  let i = 0;
  const fail = (message: string, at: number): never => {
    const [line, column] = lineOf(at);
    throw new ProtoSyntaxError(message, line, column);
  };

  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === '\uFEFF') {
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? text.length : text[end - 1] === '\r' ? end - 1 : end;
      comments.push({ start: i, end: stop, text: text.slice(i + 2, stop) });
      i = stop;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) fail('Unterminated comment', i);
      comments.push({ start: i, end: end + 2, text: text.slice(i + 2, end) });
      i = end + 2;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\n') fail('Unterminated string', i);
        j += text[j] === '\\' ? 2 : 1;
      }
      if (j >= text.length) fail('Unterminated string', i);
      tokens.push({ kind: 'string', text: text.slice(i, j + 1), start: i, end: j + 1 });
      i = j + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      IDENT.lastIndex = i;
      const word = IDENT.exec(text)![0];
      tokens.push({ kind: 'ident', text: word, start: i, end: i + word.length });
      i += word.length;
    } else if (/\d/.test(c) || (c === '.' && /\d/.test(text[i + 1] ?? ''))) {
      NUMBER.lastIndex = i;
      const number = NUMBER.exec(text)![0];
      const kind = /^0[xX]/.test(number) || /^\d+$/.test(number) ? 'int' : 'float';
      tokens.push({ kind, text: number, start: i, end: i + number.length });
      i += number.length;
    } else if ('{}[]()<>;,=.-+:/'.includes(c)) {
      tokens.push({ kind: 'symbol', text: c, start: i, end: i + 1 });
      i++;
    } else {
      fail(`Unexpected character "${c}"`, i);
    }
  }
  return { tokens, comments };
}

/** Decodes a quoted proto string literal (escapes included). */
export function unquote(literal: string): string {
  const body = literal.slice(1, -1);
  return body.replace(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{1,3}|.)/g, (_, e: string) => {
    switch (e[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case 'x': return String.fromCharCode(parseInt(e.slice(1), 16));
      case 'u':
      case 'U': return String.fromCodePoint(parseInt(e.slice(1), 16));
      default: return /^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8)) : e;
    }
  });
}

/** Proto string literal for a text. */
export function quote(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
}

function parseInteger(text: string): number {
  if (/^0[xX]/.test(text)) return parseInt(text.slice(2), 16);
  if (/^0[0-7]+$/.test(text)) return parseInt(text, 8);
  return Number(text);
}

function commentText(raw: Comment[], source: string): string {
  const lines: string[] = [];
  for (const c of raw) {
    if (source.startsWith('//', c.start)) {
      lines.push(c.text.replace(/^\/?\s?/, '').replace(/\s+$/, ''));
    } else {
      const inner = c.text.replace(/^\*+/, '').split(/\r?\n/).map((l) => l.replace(/^\s*\*? ?/, '').replace(/\s+$/, ''));
      while (inner.length && !inner[0]) inner.shift();
      while (inner.length && !inner[inner.length - 1]) inner.pop();
      lines.push(...inner);
    }
  }
  return lines.join('\n');
}

/** Parses a .proto file (proto2, proto3 and editions). Throws a ProtoSyntaxError. */
export function parseProto(text: string): ProtoFile {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (offset: number): [number, number] => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return [lo + 1, offset - lineStarts[lo] + 1];
  };

  const { tokens, comments } = tokenize(text, lineOf);
  let pos = 0;

  const peek = (n = 0): Tok | undefined => tokens[pos + n];
  const fail = (message: string, tok = peek()): never => {
    const [line, column] = lineOf(tok ? tok.start : text.length);
    throw new ProtoSyntaxError(message, line, column);
  };
  const describe = (tok: Tok | undefined) => (tok ? `"${tok.text}"` : 'the end of the file');
  const isSymbol = (tok: Tok | undefined, s: string) => tok?.kind === 'symbol' && tok.text === s;
  const isWord = (tok: Tok | undefined, word?: string) => tok?.kind === 'ident' && (word === undefined || tok.text === word);
  const next = (): Tok => {
    const tok = tokens[pos];
    if (!tok) fail('Unexpected end of file');
    pos++;
    return tok;
  };
  const symbol = (s: string): Tok => (isSymbol(peek(), s) ? next() : fail(`Expected "${s}" but found ${describe(peek())}`));
  const word = (what = 'a name'): Tok => (isWord(peek()) ? next() : fail(`Expected ${what} but found ${describe(peek())}`));
  const keyword = (w: string): Tok => (isWord(peek(), w) ? next() : fail(`Expected "${w}" but found ${describe(peek())}`));
  const integer = (): { value: number; span: Span } => {
    const negative = isSymbol(peek(), '-') ? next() : undefined;
    const tok = peek();
    if (tok?.kind !== 'int') fail(`Expected a number but found ${describe(tok)}`);
    next();
    return { value: (negative ? -1 : 1) * parseInteger(tok!.text), span: { start: negative?.start ?? tok!.start, end: tok!.end } };
  };
  const previousEnd = () => tokens[pos - 1].end;

  function leading(start: number) {
    let lo = 0;
    let hi = comments.length - 1;
    let index = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (comments[mid].end <= start) {
        index = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const block: Comment[] = [];
    let cursor = start;
    for (let i = index; i >= 0; i--) {
      const c = comments[i];
      const gap = text.slice(c.end, cursor);
      if (/\S/.test(gap) || (gap.match(/\n/g)?.length ?? 0) > 1) break;
      const lineStart = text.lastIndexOf('\n', c.start - 1) + 1;
      if (/\S/.test(text.slice(lineStart, c.start))) break;
      block.unshift(c);
      cursor = c.start;
    }
    return { docStart: block[0]?.start ?? start, comment: commentText(block, text) };
  }

  const node = (start: Tok) => ({ span: { start: start.start, end: previousEnd() }, line: lineOf(start.start)[0], ...leading(start.start) });

  function typeName(): { text: string; span: Span } {
    const start = peek();
    if (isSymbol(start, '.')) next();
    word('a type');
    while (isSymbol(peek(), '.')) {
      next();
      word('a type');
    }
    const span = { start: start!.start, end: previousEnd() };
    return { text: text.slice(span.start, span.end).replace(/\s+/g, ''), span };
  }

  function optionName(): string {
    const start = peek()!.start;
    const part = () => {
      if (isSymbol(peek(), '(')) {
        next();
        typeName();
        symbol(')');
      } else {
        word('an option name');
      }
    };
    part();
    while (isSymbol(peek(), '.')) {
      next();
      part();
    }
    return text.slice(start, previousEnd()).replace(/\s+/g, '');
  }

  function constant(): Span {
    const first = peek();
    if (!first) fail('Expected a value');
    if (isSymbol(first, '{') || isSymbol(first, '[')) {
      const stack: string[] = [];
      do {
        const tok = next();
        if (isSymbol(tok, '{') || isSymbol(tok, '[')) stack.push(tok.text === '{' ? '}' : ']');
        else if (isSymbol(tok, '}') || isSymbol(tok, ']')) {
          if (stack.pop() !== tok.text) fail(`Unexpected "${tok.text}"`, tok);
        }
      } while (stack.length);
    } else if (first!.kind === 'string') {
      while (peek()?.kind === 'string') next();
    } else {
      if (isSymbol(first, '-') || isSymbol(first, '+')) next();
      const tok = peek();
      if (tok?.kind === 'ident') typeName();
      else if (tok?.kind === 'int' || tok?.kind === 'float') next();
      else fail(`Expected a value but found ${describe(tok)}`);
    }
    return { start: first!.start, end: previousEnd() };
  }

  function optionStatement(): ProtoOption {
    const start = keyword('option');
    const name = optionName();
    symbol('=');
    const valueSpan = constant();
    symbol(';');
    return { ...node(start), name, value: text.slice(valueSpan.start, valueSpan.end), valueSpan };
  }

  function inlineOptions(): { options: ProtoOption[]; optionsSpan?: Span } {
    if (!isSymbol(peek(), '[')) return { options: [] };
    const open = next();
    const options: ProtoOption[] = [];
    do {
      const start = peek()!;
      const name = optionName();
      symbol('=');
      const valueSpan = constant();
      options.push({
        span: { start: start.start, end: valueSpan.end },
        docStart: start.start,
        comment: '',
        line: lineOf(start.start)[0],
        name,
        value: text.slice(valueSpan.start, valueSpan.end),
        valueSpan,
      });
    } while (isSymbol(peek(), ',') && next());
    const close = symbol(']');
    return { options, optionsSpan: { start: open.start, end: close.end } };
  }

  function reserved(): ProtoReserved {
    const start = keyword('reserved');
    const items: string[] = [];
    const first = peek();
    const kind = first?.kind === 'string' || first?.kind === 'ident' ? 'names' : 'numbers';
    const quoted = first?.kind === 'string';
    do {
      if (kind === 'names') {
        const tok = next();
        if (tok.kind !== (quoted ? 'string' : 'ident')) fail('Expected a field name', tok);
        items.push(quoted ? unquote(tok.text) : tok.text);
      } else {
        const from = integer();
        if (isWord(peek(), 'to')) {
          next();
          const to = isWord(peek(), 'max') ? (next(), 'max') : String(integer().value);
          items.push(`${from.value} to ${to}`);
        } else {
          items.push(String(from.value));
        }
      }
    } while (isSymbol(peek(), ',') && next());
    const itemsSpan = { start: first!.start, end: previousEnd() };
    symbol(';');
    return { ...node(start), kind, items, itemsSpan, quoted };
  }

  function field(oneof?: string): ProtoField {
    const start = peek()!;
    let label: ProtoField['label'];
    if (isWord(start) && LABELS.has(start.text) && (isWord(peek(1)) || isSymbol(peek(1), '.'))) {
      next();
      label = { value: start.text as FieldLabel, span: { start: start.start, end: start.end } };
    }

    if (isWord(peek(), 'group') && isWord(peek(1)) && isSymbol(peek(2), '=')) {
      next();
      const name = next();
      symbol('=');
      const number = integer();
      const { options, optionsSpan } = inlineOptions();
      const body = symbol('{');
      const group = messageBody(name.text, body);
      return {
        ...node(start),
        span: { start: start.start, end: group.body.end + 1 },
        kind: 'group',
        name: name.text,
        nameSpan: { start: name.start, end: name.end },
        label,
        type: name.text,
        typeSpan: { start: name.start, end: name.end },
        number: number.value,
        numberSpan: number.span,
        options,
        optionsSpan,
        oneof,
      };
    }

    let kind: ProtoField['kind'] = 'field';
    let mapKey: string | undefined;
    let mapValue: string | undefined;
    let typeSpan: Span;
    if (isWord(peek(), 'map') && isSymbol(peek(1), '<')) {
      kind = 'map';
      const mapTok = next();
      symbol('<');
      mapKey = typeName().text;
      symbol(',');
      mapValue = typeName().text;
      symbol('>');
      typeSpan = { start: mapTok.start, end: previousEnd() };
    } else {
      typeSpan = typeName().span;
    }
    const name = word('a field name');
    symbol('=');
    const number = integer();
    const { options, optionsSpan } = inlineOptions();
    symbol(';');
    return {
      ...node(start),
      kind,
      name: name.text,
      nameSpan: { start: name.start, end: name.end },
      label,
      type: kind === 'map' ? `map<${mapKey}, ${mapValue}>` : text.slice(typeSpan.start, typeSpan.end).replace(/\s+/g, ''),
      typeSpan,
      mapKey,
      mapValue,
      number: number.value,
      numberSpan: number.span,
      options,
      optionsSpan,
      oneof,
    };
  }

  /** `name {` ahead, i.e. a block declaration rather than a field using a keyword as type. */
  const blockAhead = () => isWord(peek(1)) && isSymbol(peek(2), '{');

  function oneofDecl(message: ProtoMessage): ProtoOneof {
    const start = keyword('oneof');
    const name = word();
    const open = symbol('{');
    const options: ProtoOption[] = [];
    while (!isSymbol(peek(), '}')) {
      if (isSymbol(peek(), ';')) next();
      else if (isWord(peek(), 'option')) options.push(optionStatement());
      else message.fields.push(field(name.text));
    }
    const close = symbol('}');
    return { ...node(start), name: name.text, nameSpan: { start: name.start, end: name.end }, body: { start: open.end, end: close.start }, options };
  }

  function extensionsDecl(): string {
    const start = keyword('extensions');
    while (!isSymbol(peek(), ';')) next();
    const end = peek()!.start;
    symbol(';');
    return text.slice(start.end, end).trim();
  }

  function extendDecl(): ProtoExtend {
    const start = keyword('extend');
    const target = typeName().text;
    symbol('{');
    const fields: ProtoField[] = [];
    while (!isSymbol(peek(), '}')) {
      if (isSymbol(peek(), ';')) next();
      else fields.push(field());
    }
    symbol('}');
    return { ...node(start), target, fields };
  }

  function messageBody(name: string, open: Tok): ProtoMessage {
    const message = {
      name,
      fields: [],
      oneofs: [],
      messages: [],
      enums: [],
      options: [],
      reserved: [],
      extensions: [],
      extends: [],
    } as unknown as ProtoMessage;
    while (!isSymbol(peek(), '}')) {
      const tok = peek();
      if (!tok) fail(`Missing "}" to close message ${name}`);
      if (isSymbol(tok, ';')) next();
      else if (isWord(tok, 'message') && blockAhead()) message.messages.push(messageDecl());
      else if (isWord(tok, 'enum') && blockAhead()) message.enums.push(enumDecl());
      else if (isWord(tok, 'oneof') && blockAhead()) message.oneofs.push(oneofDecl(message));
      else if (isWord(tok, 'extend') && !isSymbol(peek(2), '=')) message.extends.push(extendDecl());
      else if (isWord(tok, 'option')) message.options.push(optionStatement());
      else if (isWord(tok, 'reserved') && !isSymbol(peek(2), '=')) message.reserved.push(reserved());
      else if (isWord(tok, 'extensions') && !isSymbol(peek(2), '=')) message.extensions.push(extensionsDecl());
      else message.fields.push(field());
    }
    const close = symbol('}');
    message.body = { start: open.end, end: close.start };
    return message;
  }

  function messageDecl(): ProtoMessage {
    const start = keyword('message');
    const name = word('a message name');
    const open = symbol('{');
    const message = messageBody(name.text, open);
    return { ...message, ...node(start), nameSpan: { start: name.start, end: name.end } };
  }

  function enumDecl(): ProtoEnum {
    const start = keyword('enum');
    const name = word('an enum name');
    const open = symbol('{');
    const values: ProtoEnumValue[] = [];
    const options: ProtoOption[] = [];
    const reservedList: ProtoReserved[] = [];
    while (!isSymbol(peek(), '}')) {
      const tok = peek();
      if (!tok) fail(`Missing "}" to close enum ${name.text}`);
      if (isSymbol(tok, ';')) next();
      else if (isWord(tok, 'option') && !isSymbol(peek(1), '=')) options.push(optionStatement());
      else if (isWord(tok, 'reserved') && !isSymbol(peek(1), '=')) reservedList.push(reserved());
      else {
        const valueName = word('an enum value');
        symbol('=');
        const number = integer();
        const inline = inlineOptions();
        symbol(';');
        values.push({
          ...node(valueName),
          name: valueName.text,
          nameSpan: { start: valueName.start, end: valueName.end },
          number: number.value,
          numberSpan: number.span,
          ...inline,
        });
      }
    }
    const close = symbol('}');
    return {
      ...node(start),
      name: name.text,
      nameSpan: { start: name.start, end: name.end },
      body: { start: open.end, end: close.start },
      values,
      options,
      reserved: reservedList,
    };
  }

  function rpcSide(): RpcSide {
    const open = symbol('(');
    const stream = isWord(peek(), 'stream') && (isWord(peek(1)) || isSymbol(peek(1), '.'));
    if (stream) next();
    const type = typeName().text;
    const close = symbol(')');
    return { type, stream, span: { start: open.start, end: close.end } };
  }

  function serviceDecl(): ProtoService {
    const start = keyword('service');
    const name = word('a service name');
    const open = symbol('{');
    const rpcs: ProtoRpc[] = [];
    const options: ProtoOption[] = [];
    while (!isSymbol(peek(), '}')) {
      const tok = peek();
      if (!tok) fail(`Missing "}" to close service ${name.text}`);
      if (isSymbol(tok, ';')) next();
      else if (isWord(tok, 'option')) options.push(optionStatement());
      else if (isWord(tok, 'rpc')) {
        const rpcStart = next();
        const rpcName = word('an rpc name');
        const request = rpcSide();
        keyword('returns');
        const response = rpcSide();
        const rpcOptions: ProtoOption[] = [];
        let body: Span | undefined;
        if (isSymbol(peek(), '{')) {
          const bodyOpen = next();
          while (!isSymbol(peek(), '}')) {
            if (isSymbol(peek(), ';')) next();
            else if (isWord(peek(), 'option')) rpcOptions.push(optionStatement());
            else fail(`Expected "option" or "}" but found ${describe(peek())}`);
          }
          body = { start: bodyOpen.end, end: symbol('}').start };
        } else {
          symbol(';');
        }
        rpcs.push({ ...node(rpcStart), name: rpcName.text, nameSpan: { start: rpcName.start, end: rpcName.end }, request, response, body, options: rpcOptions });
      } else {
        fail(`Expected "rpc", "option" or "}" but found ${describe(tok)}`);
      }
    }
    const close = symbol('}');
    return { ...node(start), name: name.text, nameSpan: { start: name.start, end: name.end }, body: { start: open.end, end: close.start }, rpcs, options };
  }

  const file: ProtoFile = { imports: [], options: [], messages: [], enums: [], services: [], extends: [], length: text.length };
  while (pos < tokens.length) {
    const tok = peek()!;
    if (isSymbol(tok, ';')) {
      next();
    } else if (isWord(tok, 'syntax') || isWord(tok, 'edition')) {
      next();
      symbol('=');
      const value = peek();
      if (value?.kind !== 'string') fail(`Expected a quoted version but found ${describe(value)}`);
      next();
      symbol(';');
      file.syntax = { ...node(tok), keyword: tok.text as 'syntax' | 'edition', value: unquote(value!.text), valueSpan: { start: value!.start, end: value!.end } };
    } else if (isWord(tok, 'package')) {
      next();
      const name = typeName();
      symbol(';');
      file.package = { ...node(tok), name: name.text, nameSpan: name.span };
    } else if (isWord(tok, 'import')) {
      next();
      const modifier = isWord(peek(), 'public') || isWord(peek(), 'weak') ? (next().text as 'public' | 'weak') : undefined;
      const path = peek();
      if (path?.kind !== 'string') fail(`Expected a quoted file path but found ${describe(path)}`);
      next();
      symbol(';');
      file.imports.push({ ...node(tok), path: unquote(path!.text), modifier });
    } else if (isWord(tok, 'option')) {
      file.options.push(optionStatement());
    } else if (isWord(tok, 'message')) {
      file.messages.push(messageDecl());
    } else if (isWord(tok, 'enum')) {
      file.enums.push(enumDecl());
    } else if (isWord(tok, 'service')) {
      file.services.push(serviceDecl());
    } else if (isWord(tok, 'extend')) {
      file.extends.push(extendDecl());
    } else {
      fail(`Expected a declaration (message, enum, service, import...) but found ${describe(tok)}`);
    }
  }
  return file;
}
