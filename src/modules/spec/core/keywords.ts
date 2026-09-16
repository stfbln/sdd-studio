/**
 * Requirement levels of BCP 14 (RFC 2119, clarified by RFC 8174): the key words only carry their
 * meaning when written in capitals.
 */

export type Keyword = 'MUST' | 'MUST NOT' | 'SHOULD' | 'SHOULD NOT' | 'MAY';

export const KEYWORDS: Keyword[] = ['MUST', 'MUST NOT', 'SHOULD', 'SHOULD NOT', 'MAY'];

/** Other key words of RFC 2119, read as the level they are equivalent to. */
export const SYNONYMS: Record<string, Keyword> = {
  SHALL: 'MUST',
  REQUIRED: 'MUST',
  'SHALL NOT': 'MUST NOT',
  RECOMMENDED: 'SHOULD',
  'NOT RECOMMENDED': 'SHOULD NOT',
  OPTIONAL: 'MAY',
};

export const KEYWORD_MEANINGS: Record<Keyword, string> = {
  MUST: 'Absolute requirement',
  'MUST NOT': 'Absolute prohibition',
  SHOULD: 'Recommended: exceptions need a valid reason and their implications understood',
  'SHOULD NOT': 'Not recommended: allowed only for a valid reason, with implications understood',
  MAY: 'Truly optional',
};

/** What each level means, after RFC 2119: written under the `####` heading of the requirements using it. */
export const KEYWORD_DEFINITIONS: Record<Keyword, string> = {
  MUST: 'An absolute requirement of the specification (also written REQUIRED or SHALL).',
  'MUST NOT': 'An absolute prohibition of the specification (also written SHALL NOT).',
  SHOULD:
    'Recommended: there may exist valid reasons in particular circumstances to ignore the requirement, but the full implications must be understood and carefully weighed before choosing a different course (also written RECOMMENDED).',
  'SHOULD NOT':
    'Not recommended: there may exist valid reasons in particular circumstances when the behavior is acceptable or even useful, but the full implications should be understood and the case carefully weighed before implementing it (also written NOT RECOMMENDED).',
  MAY: 'Truly optional: an implementation can include the item or leave it out, and still works with one that made the other choice (also written OPTIONAL).',
};

/** Heading of the requirements written without a key word in capitals. */
export const NO_KEYWORD_HEADING = 'No key word';
export const NO_KEYWORD_DEFINITION = 'Requirements without a BCP 14 key word in capitals: their level is not stated.';

export const levelDefinition = (keyword: Keyword | undefined) => (keyword ? KEYWORD_DEFINITIONS[keyword] : NO_KEYWORD_DEFINITION);

/** The conformance sentence and the definitions of the key words are written in italics. */
export const italic = (text: string) => `*${text}*`;

/** A paragraph without the italics around it, to recognize a text written with or without them. */
export const withoutItalic = (text: string) => /^([*_])(?![*_])([\s\S]*[^\s\\])\1$/.exec(text)?.[2] ?? text;

/** The definition of a key word as written under its `####` heading. */
export const levelIntro = (keyword: Keyword | undefined) => italic(levelDefinition(keyword));

/** Order the levels are written in: MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, then the requirements without a key word. */
export const levelRank = (keyword: Keyword | undefined) => (keyword ? KEYWORDS.indexOf(keyword) : KEYWORDS.length);

/** Icon written in front of each level in its `####` heading ("#### ✅ MUST"), from the sdd.spec.keywordIcons setting. */
export type KeywordIcons = Record<Keyword | typeof NO_KEYWORD_HEADING, string>;

export const DEFAULT_KEYWORD_ICONS: KeywordIcons = { MUST: '✅', 'MUST NOT': '⛔', SHOULD: '👍', 'SHOULD NOT': '👎', MAY: '🆗', [NO_KEYWORD_HEADING]: '❔' };

/** Icons from a setting: each one on one line, the default where none is given; an empty one writes no icon. */
export function keywordIcons(setting: unknown): KeywordIcons {
  const icons = { ...DEFAULT_KEYWORD_ICONS };
  if (!setting || typeof setting !== 'object') return icons;
  for (const level of Object.keys(icons) as (keyof KeywordIcons)[]) {
    const value = (setting as Record<string, unknown>)[level];
    if (typeof value === 'string') icons[level] = value.replace(/\s+/g, ' ').trim();
  }
  return icons;
}

/** "#### ✅ MUST", or "#### MUST" without an icon. */
export function levelHeading(keyword: Keyword | undefined, icons: KeywordIcons): string {
  const name = keyword ?? NO_KEYWORD_HEADING;
  return `#### ${icons[name] ? `${icons[name]} ` : ''}${name}`;
}

/** Longest first, so that "MUST NOT" is not read as MUST. */
const LEVEL_NAMES = [...KEYWORDS, ...Object.keys(SYNONYMS), NO_KEYWORD_HEADING].sort((a, b) => b.length - a.length);

/**
 * The level a `####` heading stands for, whatever icon is written in front of it: `{ keyword }` for a
 * key word or a synonym ("#### ✅ MUST", "#### Shall"), `{}` for the requirements without one
 * ("#### ❔ No key word"), undefined for another heading. The icon is anything without letters or
 * digits, or anything followed by a space when the key word is written in capitals.
 */
export function levelOfHeading(text: string): { keyword?: Keyword } | undefined {
  const heading = text.trim().replace(/\s+/g, ' ');
  for (const name of LEVEL_NAMES) {
    const at = heading.length - name.length;
    const written = heading.slice(at);
    if (at < 0 || written.toUpperCase() !== name.toUpperCase()) continue;
    const icon = heading.slice(0, at);
    // "#### Things you may" or "#### Smust" name no level.
    const named = !/[\p{L}\p{N}]/u.test(icon) || (icon.endsWith(' ') && (name === NO_KEYWORD_HEADING || written === name));
    if (!named) continue;
    if (name === NO_KEYWORD_HEADING) return {};
    return { keyword: KEYWORDS.includes(name as Keyword) ? (name as Keyword) : SYNONYMS[name] };
  }
  return undefined;
}

/** The boilerplate of RFC 8174, with links to the RFCs. */
export const CONFORMANCE_NOTICE =
  'The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.';

/** The conformance sentence as written at the start of the Requirements section. */
export const WRITTEN_NOTICE = italic(CONFORMANCE_NOTICE);

export const isConformanceNotice = (paragraph: string) => /\bkey ?words\b[\s\S]*\b(RFC ?2119|BCP ?14)\b/i.test(paragraph);

const WORDS = ['MUST NOT', 'SHALL NOT', 'SHOULD NOT', 'NOT RECOMMENDED', 'MUST', 'SHALL', 'SHOULD', 'RECOMMENDED', 'REQUIRED', 'MAY', 'OPTIONAL'];
const pattern = (words: string[], flags = '') => new RegExp(`(?<![\\w-])(${words.map((w) => w.replace(' ', '[ \\t]+')).join('|')})(?![\\w-])`, flags);
const UPPERCASE = pattern(WORDS);
const LOWERCASE = pattern(['must not', 'shall not', 'should not', 'must', 'shall', 'should', 'may'], 'i');

export interface KeywordMatch {
  /** As written, e.g. "SHALL". */
  written: string;
  keyword: Keyword;
  index: number;
}

/** First key word in capitals. */
export function findKeyword(text: string): KeywordMatch | undefined {
  const match = UPPERCASE.exec(text);
  if (!match) return undefined;
  const written = match[1].replace(/[ \t]+/, ' ');
  return { written, keyword: (SYNONYMS[written] ?? written) as Keyword, index: match.index };
}

/** A key word written in lowercase ("must"), when there is none in capitals. */
export function lowercaseKeyword(text: string): string | undefined {
  if (findKeyword(text)) return undefined;
  return LOWERCASE.exec(text)?.[1];
}

/** Sets the level of a requirement: replaces its key word, or a lowercase one, or starts with it. */
export function withKeyword(text: string, keyword: string): string {
  const upper = UPPERCASE.exec(text);
  const match = upper ?? LOWERCASE.exec(text);
  if (match) return text.slice(0, match.index) + keyword + text.slice(match.index + match[1].length);
  return `${keyword} ${text}`;
}

/** What comes before the key word ("The service"), when short enough to reuse. */
export function subjectOf(text: string): string | undefined {
  const match = findKeyword(text);
  const subject = match && text.slice(0, match.index).trim();
  return subject && !subject.includes('\n') && subject.length <= 60 ? subject : undefined;
}

/**
 * Sentence added from the form: kept as typed when it has a key word, otherwise
 * "<subject> <KEYWORD> <text>" ("Take card payments" → "The service MUST take card payments").
 */
export function composeRequirement(keyword: Keyword, text: string, subject: string): string {
  const typed = text.trim();
  if (!typed || findKeyword(typed)) return typed;
  if (LOWERCASE.test(typed)) return withKeyword(typed, keyword);
  const rest = /^[A-Z][a-z]/.test(typed) ? typed[0].toLowerCase() + typed.slice(1) : typed;
  return `${subject} ${keyword} ${rest}`;
}
