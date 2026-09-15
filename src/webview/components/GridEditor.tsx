import type { ClipboardEvent, KeyboardEvent, ReactNode } from 'react';
import { requestFocus } from '../focus';
import { IconButton } from './IconButton';

interface Props {
  /** Unique key, used to move focus between cells. */
  gridKey: string;
  /** Full matrix, header included when `headerRow` is set. */
  rows: string[][];
  onChange: (rows: string[][]) => void;
  headerRow?: boolean;
  /** Name given to the header cell of a newly added column. */
  newColumnName?: (rows: string[][]) => string;
  columnWarning?: (column: number) => string | undefined;
  rowTitle?: (row: number) => string | undefined;
  headerPlaceholder?: string;
  footer?: ReactNode;
}

/** Spreadsheet-like table editor: Enter moves down, pasting TSV or Gherkin/Markdown tables fills cells. */
export function GridEditor({
  gridKey,
  rows,
  onChange,
  headerRow = false,
  newColumnName,
  columnWarning,
  rowTitle,
  headerPlaceholder = 'column',
  footer,
}: Props) {
  const columns = Math.max(0, ...rows.map((r) => r.length));
  const matrix = rows.map((r) => Array.from({ length: columns }, (_, c) => r[c] ?? ''));
  const widths = Array.from({ length: columns }, (_, c) => Math.max(6, ...matrix.map((r) => r[c].length + 1)));
  const focusKey = (r: number, c: number) => `${gridKey}:${r}:${c}`;
  const isHeader = (r: number) => headerRow && r === 0;
  const blankRow = () => Array.from({ length: columns }, () => '');

  const setCell = (r: number, c: number, value: string) =>
    onChange(matrix.map((row, i) => (i === r ? row.map((v, j) => (j === c ? value : v)) : row)));

  const addRow = (index = matrix.length) => {
    onChange([...matrix.slice(0, index), blankRow(), ...matrix.slice(index)]);
    requestFocus(focusKey(index, 0));
  };

  const addColumn = () => {
    const name = newColumnName?.(matrix) ?? '';
    const next = matrix.length ? matrix.map((row, r) => [...row, isHeader(r) ? name : '']) : [[name]];
    onChange(next);
    requestFocus(focusKey(0, columns), { select: true });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.shiftKey) {
      if (r > 0) requestFocus(focusKey(r - 1, c));
    } else if (r < matrix.length - 1) {
      requestFocus(focusKey(r + 1, c));
    } else {
      onChange([...matrix, blankRow()]);
      requestFocus(focusKey(r + 1, c));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const pasted = parseClipboardTable(e.clipboardData.getData('text/plain'));
    if (!pasted) return;
    e.preventDefault();
    const width = Math.max(columns, c + Math.max(...pasted.map((p) => p.length)));
    const next = matrix.map((row) => [...row, ...Array.from({ length: width - columns }, () => '')]);
    if (headerRow && width > columns && next.length) {
      for (let j = columns; j < width; j++) next[0][j] = newColumnName?.(next) ?? '';
    }
    while (next.length < r + pasted.length) next.push(Array.from({ length: width }, () => ''));
    pasted.forEach((line, i) => line.forEach((value, j) => (next[r + i][c + j] = value)));
    onChange(next);
  };

  return (
    <div className="grid-container">
      {columns > 0 && (
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr className="grid-column-actions">
                <th />
                {Array.from({ length: columns }, (_, c) => (
                  <th key={c}>
                    <IconButton
                      icon="close"
                      label="Remove column"
                      className="btn-tiny"
                      onClick={() => onChange(matrix.map((row) => row.filter((_, j) => j !== c)))}
                    />
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, r) => (
                <tr key={r} className={isHeader(r) ? 'grid-header' : ''} title={rowTitle?.(r)}>
                  <td className="grid-index">{isHeader(r) ? '' : headerRow ? r : r + 1}</td>
                  {row.map((value, c) => {
                    const warning = columnWarning?.(c);
                    return (
                      <td key={c} className={warning ? 'grid-warn' : ''} title={warning}>
                        <input
                          className="grid-cell"
                          data-focus-key={focusKey(r, c)}
                          value={value}
                          size={widths[c]}
                          placeholder={isHeader(r) ? headerPlaceholder : ''}
                          spellCheck={false}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, r, c)}
                          onPaste={(e) => onPaste(e, r, c)}
                        />
                      </td>
                    );
                  })}
                  <td className="grid-row-actions">
                    {!isHeader(r) && (
                      <>
                        <IconButton
                          icon="copy"
                          label="Duplicate row"
                          className="btn-tiny"
                          onClick={() => onChange([...matrix.slice(0, r + 1), [...row], ...matrix.slice(r + 1)])}
                        />
                        <IconButton
                          icon="trash"
                          label="Delete row"
                          className="btn-tiny"
                          onClick={() => onChange(matrix.filter((_, i) => i !== r))}
                        />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid-footer">
        {columns > 0 && <IconButton icon="add" label="Row" showLabel onClick={() => addRow()} />}
        <IconButton icon="add" label="Column" showLabel onClick={addColumn} />
        {footer}
      </div>
    </div>
  );
}

/** Accepts tab-separated text (spreadsheets) or pipe tables (Gherkin/Markdown). Returns null for plain text. */
export function parseClipboardTable(text: string): string[][] | null {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!normalized.includes('\t') && !normalized.includes('\n')) return null;
  const lines = normalized.split('\n');
  if (lines.every((l) => l.trim().startsWith('|'))) {
    return lines
      .filter((l) => !(/^[\s|:-]+$/.test(l) && l.includes('-'))) // Markdown separator line
      .map((l) =>
        l
          .trim()
          .replace(/^\||\|$/g, '')
          .split(/(?<!\\)\|/)
          .map((cell) => cell.trim().replace(/\\\|/g, '|').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')),
      );
  }
  return lines.map((l) => l.split('\t'));
}
