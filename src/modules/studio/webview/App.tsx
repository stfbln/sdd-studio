import { useEffect, useState, type ReactNode } from 'react';
import { onHostMessage, vscode } from '../../../webview/vscode';
import { groupKinds } from '../core/home';
import type { StudioAction, StudioHostMessage, StudioKind, StudioState, StudioWebviewMessage } from '../core/protocol';

const post = (message: StudioWebviewMessage) => vscode.postMessage(message);
const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

/** The home page: what the workspace holds, and every page of the extension one click away. */
export function App() {
  const [state, setState] = useState<StudioState | null>(null);

  useEffect(() => {
    const dispose = onHostMessage<StudioHostMessage>((message) => {
      if (message.type === 'state') {
        const { type: _type, ...next } = message;
        setState(next);
      }
    });
    post({ type: 'ready' });
    return dispose;
  }, []);

  if (!state) return <div className="loading">Loading…</div>;
  const { catalog, specs } = groupKinds(state.kinds);
  const run = (action: StudioAction) => () => post({ type: 'run', action });

  return (
    <div className="studio">
      <header className="hero">
        <span className="codicon codicon-library hero-icon" aria-hidden="true" />
        <div className="hero-text">
          <h1>SDD Studio</h1>
          <p className="hero-tagline">
            Specification-driven development: the software catalog says what exists, every fact lives in the one file that owns it, and the forms keep
            plain files on disk.
          </p>
          {state.hasWorkspace && <p className="hint">{state.workspaces.join(' · ')}</p>}
        </div>
      </header>

      {!state.hasWorkspace ? (
        <p className="empty">Open a folder or workspace to work on its specs.</p>
      ) : (
        <>
          <Section title="Catalog" hint="Start here: what exists, who owns it and which file describes each entity.">
            {catalog && <KindCard kind={catalog} featured />}
            <Card
              icon="layers"
              title="Consolidated Catalog"
              description="Every catalog file of a workspace folder merged in one form, to work on all its entities at once."
              onClick={run('consolidatedCatalog')}
              featured
            />
          </Section>

          <Section title="Specifications" hint="One page per format, listing its files by folder, with the problems found and a form to create new ones.">
            {specs.map((kind) => (
              <KindCard key={kind.kind} kind={kind} />
            ))}
          </Section>

          <Section title="AI assistants" hint="Everything an assistant needs to read the catalog and keep the specs in the file that owns them.">
            <Card
              icon="sparkle"
              title="Prompts"
              description="Build a prompt for an assistant: design a new system, update specs, implement them or scan an existing repository."
              onClick={run('prompts')}
            />
            <Card
              icon="comment-discussion"
              title="Update instructions"
              description="Write, at the top of every spec file of the workspace, what it is for and the rules to follow when changing it."
              onClick={run('instructions')}
            />
            <Card
              icon="plug"
              title="Configure Claude Code (MCP)"
              description="Add the MCP server of this window to .mcp.json, so Claude Code can read the catalog and create linked spec files."
              onClick={run('configureClaudeCode')}
            />
          </Section>
        </>
      )}

      <footer className="studio-footer">
        <button type="button" className="link-button" onClick={run('settings')}>
          <span className="codicon codicon-settings-gear" aria-hidden="true" />
          Settings
        </button>
      </footer>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="studio-section">
      <h2>{title}</h2>
      <p className="hint">{hint}</p>
      <div className="cards">{children}</div>
    </section>
  );
}

/** The overview page of one kind of spec, with what the workspace holds of it. */
function KindCard({ kind, featured }: { kind: StudioKind; featured?: boolean }) {
  return (
    <Card
      icon={kind.icon}
      title={kind.title}
      description={kind.purpose}
      featured={featured}
      onClick={() => post({ type: 'openOverview', kind: kind.kind })}
      footer={
        <>
          <span className={kind.count ? 'card-count' : 'muted'}>{kind.count ? plural(kind.count, kind.singular, kind.plural) : `No ${kind.plural} yet`}</span>
          {!!kind.problems && (
            <span className="card-problems">
              <span className="codicon codicon-warning" aria-hidden="true" />
              {plural(kind.problems, 'problem')}
            </span>
          )}
        </>
      }
    />
  );
}

interface CardProps {
  icon: string;
  title: string;
  description: string;
  footer?: ReactNode;
  /** Bigger card, for the pages a workspace starts from. */
  featured?: boolean;
  onClick(): void;
}

function Card({ icon, title, description, footer, featured, onClick }: CardProps) {
  return (
    <button type="button" className={`card${featured ? ' card-featured' : ''}`} onClick={onClick}>
      <span className={`codicon codicon-${icon} card-icon`} aria-hidden="true" />
      <span className="card-title">{title}</span>
      <span className="card-description">{description}</span>
      {footer && <span className="card-footer">{footer}</span>}
    </button>
  );
}
