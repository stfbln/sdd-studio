import { useEffect, useMemo, useState } from 'react';
import { AutoTextarea } from '../../../webview/components/AutoTextarea';
import { IconButton } from '../../../webview/components/IconButton';
import { requestFocus } from '../../../webview/focus';
import { onHostMessage, vscode } from '../../../webview/vscode';
import type { PromptsHostMessage, PromptsState, PromptsWebviewMessage } from '../core/protocol';
import {
  ASSET_CATEGORIES,
  implementMissing,
  implementPrompt,
  newSystemMissing,
  newSystemPrompt,
  scanRepoMissing,
  scanRepoPrompt,
  updateSpecsMissing,
  updateSpecsPrompt,
  type ImplementInput,
  type NewSystemInput,
  type PromptEntity,
  type ScanRepoInput,
  type SystemAsset,
} from '../core/prompts';
import { EntityPicker } from './EntityPicker';

type Tab = 'newSystem' | 'update' | 'implement' | 'scanRepo';

/** Drafts of the four prompts, kept in the webview state (they survive hiding the page and reloads). */
interface Drafts {
  tab: Tab;
  newSystem: NewSystemInput;
  update: { refs: string[]; change: string; askQuestions: boolean };
  implement: { refs: string[]; notes: string; askQuestions: boolean };
  scanRepo: ScanRepoInput;
}

const TABS: { id: Tab; label: string; icon: string; hint: string }[] = [
  { id: 'newSystem', label: 'New system', icon: 'add', hint: 'Design the catalog entry and the specs of a new system from its context and assets.' },
  { id: 'update', label: 'Update specs', icon: 'edit', hint: 'Change the specs of catalog entities, keeping each fact in the file that owns it.' },
  { id: 'implement', label: 'Implement specs', icon: 'code', hint: 'Write the code of catalog entities from their specs, with tests tracing back to them.' },
  { id: 'scanRepo', label: 'From existing code', icon: 'search', hint: 'Scan a repository and create the catalog entries and specs for what it already contains.' },
];

const emptyAsset = (): SystemAsset => ({ category: 'component', name: '', type: '', description: '' });

const INITIAL: Drafts = {
  tab: 'newSystem',
  newSystem: { name: '', owner: '', domain: '', context: '', assets: [emptyAsset()], askQuestions: true, threatModel: true },
  update: { refs: [], change: '', askQuestions: false },
  implement: { refs: [], notes: '', askQuestions: true },
  scanRepo: { notes: '', askQuestions: true, threatModel: true },
};

const post = (message: PromptsWebviewMessage) => vscode.postMessage(message);

function loadDrafts(): Drafts {
  const saved = vscode.getState() as Partial<Drafts> | undefined;
  return { ...INITIAL, ...saved, newSystem: { ...INITIAL.newSystem, ...saved?.newSystem } };
}

export function App() {
  const [state, setState] = useState<PromptsState | null>(null);
  const [drafts, setDrafts] = useState<Drafts>(loadDrafts);

  useEffect(() => {
    const dispose = onHostMessage<PromptsHostMessage>((message) => {
      if (message.type === 'state') {
        const { type: _type, ...next } = message;
        setState(next);
      }
    });
    post({ type: 'ready' });
    return dispose;
  }, []);

  useEffect(() => {
    vscode.setState(drafts);
  }, [drafts]);

  const entities = state?.entities ?? [];
  const byRef = useMemo(() => new Map(entities.map((e) => [e.ref, e])), [entities]);
  const systems = useMemo(() => new Map(entities.filter((e) => e.category === 'system').map((e) => [e.ref, e.title || e.ref])), [entities]);
  const pick = (refs: string[]) => refs.flatMap((ref) => byRef.get(ref) ?? []);

  if (!state) return <div className="loading">Loading…</div>;
  if (!state.hasWorkspace) return <div className="empty">Open a folder or workspace to write prompts for its specs.</div>;

  const set = <K extends keyof Drafts>(key: K, value: Drafts[K]) => setDrafts((d) => ({ ...d, [key]: value }));
  const tab = TABS.find((t) => t.id === drafts.tab)!;

  let form: React.ReactNode;
  let prompt: string;
  let missing: string[];
  switch (drafts.tab) {
    case 'newSystem':
      form = <NewSystemForm value={drafts.newSystem} entities={entities} onChange={(v) => set('newSystem', v)} />;
      prompt = newSystemPrompt(drafts.newSystem);
      missing = newSystemMissing(drafts.newSystem);
      break;
    case 'update': {
      const input = { entities: pick(drafts.update.refs), change: drafts.update.change, askQuestions: drafts.update.askQuestions };
      form = (
        <>
          <EntityPicker title="Entities to update" entities={entities} selected={drafts.update.refs} onChange={(refs) => set('update', { ...drafts.update, refs })} onOpen={(entity) => post({ type: 'openEntity', entity })} />
          <Field label="Change" hint="What should change, and why: new capability, changed rule, new consumer, retired API…">
            <AutoTextarea className="tall" value={drafts.update.change} placeholder="e.g. Orders can be cancelled until they are shipped; the payment is refunded." onChange={(change) => set('update', { ...drafts.update, change })} />
          </Field>
          <Checkbox label="Ask me questions before editing" checked={drafts.update.askQuestions} onChange={(askQuestions) => set('update', { ...drafts.update, askQuestions })} />
        </>
      );
      prompt = updateSpecsPrompt(input, systems);
      missing = updateSpecsMissing(input);
      break;
    }
    case 'implement': {
      const input: ImplementInput = { entities: pick(drafts.implement.refs), notes: drafts.implement.notes, askQuestions: drafts.implement.askQuestions };
      form = (
        <>
          <EntityPicker title="Entities to implement" entities={entities} selected={drafts.implement.refs} onChange={(refs) => set('implement', { ...drafts.implement, refs })} onOpen={(entity) => post({ type: 'openEntity', entity })} />
          <Field label="Notes" hint="Optional: language and frameworks, where the code goes, what to leave out, deadlines for a first slice…">
            <AutoTextarea className="tall" value={drafts.implement.notes} placeholder="e.g. TypeScript with Fastify and Prisma, in services/orders. Payments are mocked for now." onChange={(notes) => set('implement', { ...drafts.implement, notes })} />
          </Field>
          <Checkbox label="Show me the plan before writing code" checked={drafts.implement.askQuestions} onChange={(askQuestions) => set('implement', { ...drafts.implement, askQuestions })} />
        </>
      );
      prompt = implementPrompt(input, systems);
      missing = implementMissing(input);
      break;
    }
    case 'scanRepo': {
      const input = drafts.scanRepo;
      form = (
        <>
          <Field label="Notes" hint="Optional: where to look first, parts to skip, systems already known, naming conventions to follow.">
            <AutoTextarea
              className="tall"
              value={input.notes}
              placeholder="e.g. Focus on services/. Ignore the legacy billing folder, it is being retired."
              onChange={(notes) => set('scanRepo', { ...input, notes })}
            />
          </Field>
          <Checkbox label="Ask me questions before writing files" checked={input.askQuestions} onChange={(askQuestions) => set('scanRepo', { ...input, askQuestions })} />
          <Checkbox label="Include a threat model" checked={input.threatModel} onChange={(threatModel) => set('scanRepo', { ...input, threatModel })} />
        </>
      );
      prompt = scanRepoPrompt(input);
      missing = scanRepoMissing(input);
      break;
    }
  }

  return (
    <div className="prompts">
      <header className="prompts-header">
        <div className="prompts-title">
          <span className="codicon codicon-sparkle" aria-hidden="true" />
          <h1>SDD Prompts</h1>
        </div>
        <McpStatus enabled={state.mcpEnabled} />
      </header>

      <nav className="prompts-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === drafts.tab} className={`prompts-tab ${t.id === drafts.tab ? 'active' : ''}`} onClick={() => set('tab', t.id)}>
            <span className={`codicon codicon-${t.icon}`} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </nav>
      <p className="hint tab-hint">{tab.hint}</p>

      <div className="prompts-body">
        <section className="prompts-form" aria-label="Prompt details">
          {form}
        </section>
        <PromptPreview text={prompt} missing={missing} />
      </div>
    </div>
  );
}

function McpStatus({ enabled }: { enabled: boolean }) {
  return (
    <div className="mcp-status">
      {enabled ? (
        <span className="muted small" title="The prompts tell the assistant to use the tools of the sdd-studio MCP server.">
          <span className="codicon codicon-pass" aria-hidden="true" /> MCP server on
        </span>
      ) : (
        <>
          <span className="warning-text small">
            <span className="codicon codicon-warning" aria-hidden="true" /> The MCP server the prompts rely on is off
          </span>
          <IconButton icon="debug-start" label="Turn it on" showLabel variant="secondary" onClick={() => post({ type: 'enableMcp' })} />
        </>
      )}
      <IconButton icon="plug" label="Configure Claude Code" showLabel variant="secondary" onClick={() => post({ type: 'configureClaudeCode' })} />
    </div>
  );
}

function PromptPreview({ text, missing }: { text: string; missing: string[] }) {
  return (
    <section className="prompt-preview" aria-label="Prompt">
      <div className="prompt-toolbar">
        <h2>Prompt</h2>
        <div className="prompt-actions">
          <IconButton icon="copy" label="Copy" showLabel variant="primary" onClick={() => post({ type: 'copy', text })} />
          <IconButton icon="go-to-file" label="Open in Editor" showLabel variant="secondary" onClick={() => post({ type: 'openAsDocument', text })} />
        </div>
      </div>
      {missing.length > 0 && (
        <p className="warning-text small">
          <span className="codicon codicon-info" aria-hidden="true" /> Add {missing.join(' and ')} for a complete prompt.
        </p>
      )}
      <pre className="prompt-text" tabIndex={0}>
        {text}
      </pre>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function NewSystemForm({ value, entities, onChange }: { value: NewSystemInput; entities: PromptEntity[]; onChange: (value: NewSystemInput) => void }) {
  const set = <K extends keyof NewSystemInput>(key: K, v: NewSystemInput[K]) => onChange({ ...value, [key]: v });
  const setAsset = (index: number, asset: SystemAsset) => set('assets', value.assets.map((a, i) => (i === index ? asset : a)));
  const addAsset = () => {
    set('assets', [...value.assets, emptyAsset()]);
    requestFocus(`asset:${value.assets.length}:name`);
  };
  const names = (category: string) => entities.filter((e) => e.category === category).map((e) => e.title || e.ref);

  return (
    <>
      <div className="field-row">
        <Field label="System name">
          <input className="input" value={value.name} placeholder="e.g. Online shop" onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Owner">
          <input className="input" list="prompt-groups" value={value.owner} placeholder="Team owning it" onChange={(e) => set('owner', e.target.value)} />
        </Field>
        <Field label="Domain">
          <input className="input" list="prompt-domains" value={value.domain} placeholder="Business area" onChange={(e) => set('domain', e.target.value)} />
        </Field>
      </div>
      <datalist id="prompt-groups">{names('group').map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="prompt-domains">{names('domain').map((n) => <option key={n} value={n} />)}</datalist>

      <Field label="Context" hint="What the system is for, who uses it, the main flows, constraints (regulation, scale, hosting), what exists already.">
        <AutoTextarea
          className="tall"
          value={value.context}
          placeholder="e.g. Customers browse products, fill a basket and pay by card. Orders go to the warehouse system. PCI DSS applies; 50 orders per second at peak."
          onChange={(context) => set('context', context)}
        />
      </Field>

      <div className="field">
        <span className="field-label">Assets</span>
        <span className="hint">The parts you already know, with a quick explanation. The assistant adds what the design needs.</span>
        <ul className="assets">
          {value.assets.map((asset, index) => {
            const category = ASSET_CATEGORIES.find((c) => c.value === asset.category)!;
            return (
              <li key={index} className="asset">
                <select className="keyword-select" aria-label="Kind of asset" value={asset.category} onChange={(e) => setAsset(index, { ...asset, category: e.target.value as SystemAsset['category'], type: '' })}>
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input className="input" aria-label="Name" data-focus-key={`asset:${index}:name`} value={asset.name} placeholder="Name" onChange={(e) => setAsset(index, { ...asset, name: e.target.value })} />
                <input
                  className="input asset-type"
                  aria-label={asset.category === 'dataAsset' ? 'Classification' : 'Type'}
                  list={`asset-types-${asset.category}`}
                  value={asset.type}
                  placeholder={asset.category === 'dataAsset' ? 'Classification' : 'Type'}
                  onChange={(e) => setAsset(index, { ...asset, type: e.target.value })}
                />
                <AutoTextarea className="asset-description" aria-label="Explanation" value={asset.description} placeholder={`What this ${category.label.toLowerCase()} is for`} onChange={(description) => setAsset(index, { ...asset, description })} />
                <IconButton icon="trash" label="Remove asset" onClick={() => set('assets', value.assets.filter((_, i) => i !== index))} />
              </li>
            );
          })}
        </ul>
        {ASSET_CATEGORIES.map((c) => (
          <datalist key={c.value} id={`asset-types-${c.value}`}>
            {c.types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        ))}
        <div>
          <IconButton icon="add" label="Add asset" showLabel variant="secondary" onClick={addAsset} />
        </div>
      </div>

      <Checkbox label="Ask me questions before writing files" checked={value.askQuestions} onChange={(askQuestions) => set('askQuestions', askQuestions)} />
      <Checkbox label="Include a threat model" checked={value.threatModel} onChange={(threatModel) => set('threatModel', threatModel)} />
    </>
  );
}
