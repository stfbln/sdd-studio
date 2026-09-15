import { NavItem } from '../../../webview/structured/NavParts';
import type { AdrAnchor } from '../core/summary';
import { scrollToAnchor, useAdr } from './state';

const ITEMS: { anchor: AdrAnchor; icon: string; label: string }[] = [
  { anchor: 'context', icon: 'question', label: 'Context and Problem Statement' },
  { anchor: 'drivers', icon: 'compass', label: 'Decision Drivers' },
  { anchor: 'options', icon: 'list-unordered', label: 'Considered Options' },
  { anchor: 'matrix', icon: 'table', label: 'Options Comparison' },
  { anchor: 'outcome', icon: 'target', label: 'Decision Outcome' },
  { anchor: 'prosCons', icon: 'thumbsup', label: 'Pros and Cons' },
  { anchor: 'more', icon: 'info', label: 'More Information' },
];

/** Outline of the page: clicking scrolls to the part, the part in view is highlighted. */
export function Nav({ current }: { current: AdrAnchor }) {
  const { model, issues } = useAdr();
  const issuesAt = (anchor: AdrAnchor) => issues.filter((i) => i.location.anchor === anchor);

  return (
    <nav className="nav" aria-label="ADR outline">
      <NavItem active={current === 'overview'} onClick={() => scrollToAnchor('overview')} issues={issuesAt('overview')}>
        <span className="codicon codicon-notebook" aria-hidden="true" />
        <span className="path-label">{model.title?.text || 'Overview'}</span>
      </NavItem>
      {ITEMS.map(({ anchor, icon, label }) => (
        <NavItem key={anchor} active={current === anchor} onClick={() => scrollToAnchor(anchor)} issues={issuesAt(anchor)}>
          <span className={`codicon codicon-${icon}`} aria-hidden="true" /> {label}
          {anchor === 'drivers' && <span className="op-label muted">{model.drivers?.list.items.length ?? 0}</span>}
          {anchor === 'options' && <span className="op-label muted">{model.options?.list.items.length ?? 0}</span>}
        </NavItem>
      ))}
    </nav>
  );
}
