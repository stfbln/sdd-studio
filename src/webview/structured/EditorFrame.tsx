import type { ReactNode } from 'react';
import type { SpecProblem } from '../../shared/structured/specText';
import { IconButton } from '../components/IconButton';

interface Props {
  icon: string;
  fileName: string;
  /** Shown as a badge, e.g. "yaml" or "proto". */
  format: string;
  /** e.g. "OpenAPI 3.0.3" */
  versionLabel?: string;
  catalogLabel: string;
  errors: SpecProblem[] | null;
  editError?: string;
  drift: boolean;
  onDismissEditError(): void;
  onOpenText(line?: number): void;
  onOpenCatalog(): void;
  /** Explains why the form cannot be used (unsupported version...). */
  unsupported?: string;
  /** Extra toolbar buttons, shown before "Open as text". */
  extraActions?: ReactNode;
  /** Outline shown on the left. */
  nav: ReactNode;
  children: ReactNode;
}

/** Toolbar, banners and the outline/content layout shared by the structured spec editors. */
export function EditorFrame(props: Props) {
  const { errors } = props;
  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-title">
          <span className={`codicon codicon-${props.icon}`} aria-hidden="true" />
          <span className="file-name">{props.fileName}</span>
          <span className="badge">{props.format.toUpperCase()}</span>
          {props.versionLabel && <span className="muted">{props.versionLabel}</span>}
        </div>
        <div className="toolbar-actions">
          {props.extraActions}
          <IconButton icon="go-to-file" label="Open as text" onClick={() => props.onOpenText()} />
          <IconButton icon="list-tree" label={props.catalogLabel} onClick={props.onOpenCatalog} />
        </div>
      </header>

      {errors && <ErrorPanel errors={errors} compact onOpenText={props.onOpenText} />}
      {props.editError && (
        <div className="banner banner-error" role="alert">
          <span className="codicon codicon-error" /> {props.editError}
          <IconButton icon="close" label="Dismiss" onClick={props.onDismissEditError} />
        </div>
      )}
      {props.drift && !errors && (
        <div className="banner" role="status">
          <span className="codicon codicon-info" /> The first change made here will also normalize some formatting of this file (for example
          spacing inside inline lists). Comments and key order are kept.
        </div>
      )}

      {props.unsupported ? (
        <div className="unsupported">
          <span className="codicon codicon-warning" />
          <p>{props.unsupported}</p>
          <IconButton icon="go-to-file" label="Open as text" showLabel variant="primary" onClick={() => props.onOpenText()} />
        </div>
      ) : (
        <div className={`layout ${errors ? 'readonly' : ''}`} inert={errors ? true : undefined}>
          {props.nav}
          <main className="content-pane">{props.children}</main>
        </div>
      )}
    </div>
  );
}

export function ErrorPanel({ errors, compact, onOpenText }: { errors: SpecProblem[]; compact?: boolean; onOpenText(line?: number): void }) {
  return (
    <div className={`error-panel ${compact ? 'compact' : ''}`} role="alert">
      <div className="error-title">
        <span className="codicon codicon-error" aria-hidden="true" />
        <span>
          The file has syntax errors. Fix them in the text editor to resume form editing{compact ? ' (showing the last valid version, read-only).' : '.'}
        </span>
        <IconButton icon="go-to-file" label="Open as text" showLabel variant="primary" onClick={() => onOpenText(errors[0]?.line)} />
      </div>
      <ul>
        {errors.slice(0, 20).map((e, i) => (
          <li key={i}>
            {e.line && (
              <button type="button" className="link-button" onClick={() => onOpenText(e.line)}>
                Line {e.line}
              </button>
            )}{' '}
            {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProblemsList<Location>({ issues, onNavigate }: { issues: { severity: 'error' | 'warning'; message: string; location: Location }[]; onNavigate(location: Location): void }) {
  return (
    <div className="problems" role="list">
      {issues.map((issue, i) => (
        <button key={i} type="button" role="listitem" className={`problem problem-${issue.severity}`} onClick={() => onNavigate(issue.location)}>
          <span className={`codicon codicon-${issue.severity}`} aria-hidden="true" />
          {issue.message}
        </button>
      ))}
    </div>
  );
}
