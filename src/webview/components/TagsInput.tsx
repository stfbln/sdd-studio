import { ChipsInput } from './ChipsInput';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

const normalize = (raw: string) =>
  raw
    .split(/[\s,]+/)
    .map((t) => t.replace(/^@+/, '').trim())
    .filter(Boolean)
    .map((t) => '@' + t);

/** Chip-style editor for Gherkin tags; "@" is added automatically. */
export function TagsInput({ tags, onChange, placeholder = 'Add tag' }: Props) {
  return <ChipsInput values={tags} onChange={onChange} placeholder={placeholder} icon="tag" normalize={normalize} />;
}
