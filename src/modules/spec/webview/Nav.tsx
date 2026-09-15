import { useMemo } from 'react';
import { NavItem } from '../../../webview/structured/NavParts';
import { groupKey, mergeInherited } from '../core/inherit';
import { allRequirements, type SpecAnchor } from '../core/summary';
import { groupId, inheritedGroupId, scrollToAnchor, useSpec } from './state';

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });

/** Outline of the page: clicking scrolls to the part, the part in view is highlighted. */
export function Nav({ current }: { current: SpecAnchor }) {
  const { model, issues, context, openAsText } = useSpec();
  const others = model.sections.filter((s) => s.kind === 'other');
  const groups = model.requirements?.groups ?? [];
  const inherited = useMemo(() => mergeInherited(model, context?.inheritance), [model, context]);
  const issuesAt = (anchor: SpecAnchor) => issues.filter((i) => i.location.anchor === anchor);
  /** Own requirements, and the inherited ones that apply on top of them. */
  const counts = (own: number, name: string | null) => {
    const extra = inherited.byGroup.get(groupKey(name))?.length ?? 0;
    return (
      <>
        <span className="op-label muted">{own}</span>
        {extra > 0 && (
          <span className="op-label muted" title={`${extra} inherited`}>
            +{extra}
          </span>
        )}
      </>
    );
  };

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
        {counts(allRequirements(model).length, null)}
      </NavItem>
      {groups.map((g, i) => (
        <NavItem key={i} depth={1} active={false} onClick={() => scrollTo(groupId(i))}>
          <span className="codicon codicon-symbol-namespace" aria-hidden="true" />
          <span className="path-label">{g.heading.text}</span>
          {counts(g.items.length, g.heading.text)}
        </NavItem>
      ))}
      {inherited.extraGroups.map((name, i) => (
        <NavItem key={name} depth={1} active={false} onClick={() => scrollTo(inheritedGroupId(i))}>
          <span className="codicon codicon-type-hierarchy-super" aria-hidden="true" title="Only in the specs this one extends" />
          <span className="path-label">{name}</span>
          {counts(0, name)}
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
