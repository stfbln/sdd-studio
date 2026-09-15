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

/** The boilerplate of RFC 8174, with links to the RFCs. */
export const CONFORMANCE_NOTICE =
  'The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.';

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
