import { NavItem } from '../../../webview/structured/NavParts';
import { allRequirements, type SpecAnchor } from '../core/summary';
import { groupId, scrollToAnchor, useSpec } from './state';

/** Outline of the page: clicking scrolls to the part, the part in view is highlighted. */
export function Nav({ current }: { current: SpecAnchor }) {
  const { model, issues, openAsText } = useSpec();
  const others = model.sections.filter((s) => s.kind === 'other');
  const groups = model.requirements?.groups ?? [];
  const issuesAt = (anchor: SpecAnchor) => issues.filter((i) => i.location.anchor === anchor);

  return (
    <nav className="nav" aria-label="Spec outline">
      <NavItem active={current === 'overview'} onClick={() => scrollToAnchor('overview')} issues={issuesAt('overview')}>
        <span className="codicon codicon-book" aria-hidden="true" />
        <span className="path-label">{model.title?.text || 'Overview'}</span>
      </NavItem>
      <NavItem active={current === 'context'} onClick={() => scrollToAnchor('context')} issues={issuesAt('context')}>
        <span className="codicon codicon-globe" aria-hidden="true" /> Context
        {!model.context?.text && <span className="op-label muted">empty</span>}
      </NavItem>
      <NavItem active={current === 'requirements'} onClick={() => scrollToAnchor('requirements')} issues={issuesAt('requirements')}>
        <span className="codicon codicon-checklist" aria-hidden="true" /> Requirements
        <span className="op-label muted">{allRequirements(model).length}</span>
      </NavItem>
      {groups.map((g, i) => (
        <NavItem key={i} depth={1} active={false} onClick={() => document.getElementById(groupId(i))?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
          <span className="codicon codicon-symbol-namespace" aria-hidden="true" />
          <span className="path-label">{g.heading.text}</span>
          <span className="op-label muted">{g.items.length}</span>
        </NavItem>
      ))}

      {others.length > 0 && (
        <div className="nav-group">
          <div className="nav-heading">
            <span>Other sections</span>
            <span className="count">{others.length}</span>
          </div>
          {others.map((s) => (
            <NavItem key={s.heading.line} active={false} onClick={() => openAsText(s.heading.line + 1)}>
              <span className="codicon codicon-go-to-file" aria-hidden="true" title="Open in the text editor" />
              <span className="path-label">{s.heading.text}</span>
            </NavItem>
          ))}
        </div>
      )}
    </nav>
  );
}
