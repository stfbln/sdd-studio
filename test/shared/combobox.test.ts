import { describe, expect, it } from 'vitest';
import { filterOptions } from '../../src/webview/components/Combobox';

const options = [
  { value: 'team-a', label: 'Team A', detail: 'Group' },
  { value: 'user:jdoe', label: 'John Doe', detail: 'User · user:jdoe' },
  { value: 'platform-team', label: 'Platform', detail: 'Group' },
];

describe('filterOptions', () => {
  it('keeps every option when nothing is typed', () => {
    expect(filterOptions(options, '')).toEqual(options);
    expect(filterOptions(options, '  ')).toEqual(options);
  });

  it('finds options containing the text, ignoring case, those starting with it first', () => {
    expect(filterOptions(options, 'TEAM').map((o) => o.value)).toEqual(['team-a', 'platform-team']);
    expect(filterOptions(options, 'doe').map((o) => o.value)).toEqual(['user:jdoe']);
  });

  it('matches the detail, without ranking it first', () => {
    expect(filterOptions(options, 'user').map((o) => o.value)).toEqual(['user:jdoe']);
    expect(filterOptions(options, 'group').map((o) => o.value)).toEqual(['team-a', 'platform-team']);
  });

  it('returns nothing when no option matches', () => {
    expect(filterOptions(options, 'orders')).toEqual([]);
  });
});
