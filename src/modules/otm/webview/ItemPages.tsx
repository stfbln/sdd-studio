import { IconButton } from '../../../webview/components/IconButton';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { CheckboxField, ChipsField, Field, Section, TextAreaField, TextField } from '../../../webview/structured/fields';
import {
  analyzeOtm,
  appendEdit,
  assetUses,
  COLLECTION_LABELS,
  COMPONENT_TYPES,
  deleteImpact,
  deleteItemEdits,
  itemId,
  itemsOf,
  labelOf,
  newItem,
  parentOf,
  RISK_HINTS,
  STRIDE,
  threatUses,
  type OtmCollection,
  type ThreatUse,
} from '../core/otm';
import {
  AssetsSection,
  AttributesSection,
  CreateButton,
  EndpointField,
  IdField,
  ItemLink,
  ParentField,
  RepresentationsSection,
  RequiredInput,
  RiskField,
  ThreatsSection,
} from './controls';
import { itemLocation, sameLocation, useOtm } from './state';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Title (the element's name), delete button and the problems of the element. */
function ItemHeader({ collection, index }: { collection: OtmCollection; index: number }) {
  const { spec, edit, navigate } = useOtm();
  const { singular, icon } = COLLECTION_LABELS[collection];
  const { removed, broken } = deleteImpact(spec, collection, index);
  const consequence = broken ? ` (${plural(broken, 'reference')} will point to nothing)` : removed ? ` (also removes ${plural(removed, 'link')} to it)` : '';
  const issues = analyzeOtm(spec).filter((i) => sameLocation(i.location, itemLocation(collection, index)));
  return (
    <>
      <div className="page-title-row">
        <span className={`codicon codicon-${icon}`} aria-hidden="true" />
        <RequiredInput path={[collection, index, 'name']} placeholder={`${singular} name`} className="title-input grow" />
        <IconButton
          icon="trash"
          label={`Delete ${singular.toLowerCase()}${consequence}`}
          onClick={() => {
            edit(deleteItemEdits(spec, collection, index));
            navigate({ kind: 'project' });
          }}
        />
      </div>
      <p className="muted small">{singular}</p>
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={navigate} />}
    </>
  );
}

/** Components and trust zones placed inside a trust zone or component, with a quick way to add one. */
function ContainsSection({ collection, index }: { collection: 'trustZones' | 'components'; index: number }) {
  const { spec, edit, navigate } = useOtm();
  const id = itemId(itemsOf(spec, collection)[index] ?? {});
  const kind = collection === 'trustZones' ? 'trustZone' : 'component';
  const children = (['trustZones', 'components'] as const).flatMap((list) =>
    itemsOf(spec, list).flatMap((item, i) => {
      const parent = parentOf(item);
      return parent?.kind === kind && parent.id === id && id ? [{ list, index: i }] : [];
    }),
  );
  return (
    <Section title="Contains" icon="type-hierarchy-sub" count={children.length}>
      {children.length === 0 && <p className="muted">Nothing placed in this {COLLECTION_LABELS[collection].singular.toLowerCase()} yet.</p>}
      {children.map((child) => (
        <div key={`${child.list}${child.index}`} className="list-row">
          <span className={`codicon codicon-${COLLECTION_LABELS[child.list].icon}`} aria-hidden="true" />
          <ItemLink collection={child.list} index={child.index} />
        </div>
      ))}
      {id && (
        <div className="list-row">
          <CreateButton
            collection="components"
            label="Add component here"
            onCreate={(name) => {
              const count = itemsOf(spec, 'components').length;
              edit(appendEdit(spec, ['components'], { ...newItem(spec, 'components', name), parent: { [kind]: id } }));
              navigate(itemLocation('components', count));
            }}
          />
        </div>
      )}
    </Section>
  );
}

function UseRow({ use, show }: { use: ThreatUse; show: 'element' | 'threat' }) {
  const { spec } = useOtm();
  return (
    <div className="use-row">
      <span className={`codicon codicon-${COLLECTION_LABELS[use.collection].icon}`} aria-hidden="true" />
      <ItemLink collection={use.collection} index={use.index} />
      {show === 'threat' && (
        <>
          <span className="muted">·</span>
          <ItemLink collection="threats" id={use.threat} />
        </>
      )}
      <span className={`state-badge state-${use.state.toLowerCase()}`}>{use.state || 'no state'}</span>
      {show === 'element' && use.mitigations.length > 0 && (
        <span className="muted small">
          {use.mitigations.map((m) => `${labelOf(spec, 'mitigations', m.mitigation)} (${m.state || '?'})`).join(', ')}
        </span>
      )}
    </div>
  );
}

export function TrustZonePage({ index }: { index: number }) {
  const base = ['trustZones', index];
  return (
    <div className="page">
      <ItemHeader collection="trustZones" index={index} />
      <Section title="Trust zone" icon="shield">
        <div className="form-grid">
          <IdField collection="trustZones" index={index} />
          <TextField path={[...base, 'type']} label="Type" mono placeholder="e.g. internet, private, dmz" />
          <ParentField collection="trustZones" index={index} />
          <TextAreaField path={[...base, 'description']} label="Description" />
        </div>
      </Section>
      <Section title="Risk" icon="pulse">
        <RiskField path={[...base, 'risk', 'trustRating']} label="Trust rating" hint={RISK_HINTS.trustRating} />
      </Section>
      <ContainsSection collection="trustZones" index={index} />
      <RepresentationsSection collection="trustZones" index={index} />
      <AttributesSection path={[...base, 'attributes']} />
    </div>
  );
}

export function ComponentPage({ index }: { index: number }) {
  const { spec } = useOtm();
  const base = ['components', index];
  const id = itemId(itemsOf(spec, 'components')[index] ?? {});
  const flows = itemsOf(spec, 'dataflows').flatMap((flow, i) => {
    const out = !!id && flow.source === id;
    const into = !!id && flow.destination === id;
    return out || into ? [{ index: i, other: String((out ? flow.destination : flow.source) ?? ''), out, both: flow.bidirectional === true }] : [];
  });
  return (
    <div className="page">
      <ItemHeader collection="components" index={index} />
      <Section title="Component" icon="server-process">
        <div className="form-grid">
          <IdField collection="components" index={index} />
          <TextField path={[...base, 'type']} label="Type" required mono list="otm-component-types" hint="Kind of component, e.g. a component definition of your threat modeling tool." />
          <ParentField collection="components" index={index} />
          <ChipsField path={[...base, 'tags']} label="Tags" placeholder="Add tag" />
          <TextAreaField path={[...base, 'description']} label="Description" />
        </div>
        <datalist id="otm-component-types">
          {COMPONENT_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Section>
      <AssetsSection
        columns={[
          { label: 'Processed', path: [...base, 'assets', 'processed'] },
          { label: 'Stored', path: [...base, 'assets', 'stored'] },
        ]}
        container={[...base, 'assets']}
        hint="Assets this component handles in memory (processed) or keeps (stored)."
      />
      <ThreatsSection collection="components" index={index} />
      <Section title="Dataflows" icon="arrow-swap" count={flows.length}>
        {flows.length === 0 && <p className="muted">No dataflow starts or ends here.</p>}
        {flows.map((flow) => (
          <div key={flow.index} className="list-row">
            <span className={`codicon codicon-${flow.both ? 'arrow-both' : flow.out ? 'arrow-right' : 'arrow-left'}`} aria-hidden="true" title={flow.both ? 'Both ways' : flow.out ? 'Outgoing' : 'Incoming'} />
            <ItemLink collection="dataflows" index={flow.index} />
            <span className="muted">{flow.out ? 'to' : 'from'}</span>
            <ItemLink collection={itemsOf(spec, 'components').some((c) => c.id === flow.other) ? 'components' : 'trustZones'} id={flow.other} />
          </div>
        ))}
      </Section>
      <ContainsSection collection="components" index={index} />
      <RepresentationsSection collection="components" index={index} />
      <AttributesSection path={[...base, 'attributes']} />
    </div>
  );
}

export function DataflowPage({ index }: { index: number }) {
  const { spec, edit } = useOtm();
  const base = ['dataflows', index];
  const flow = itemsOf(spec, 'dataflows')[index] ?? {};
  return (
    <div className="page">
      <ItemHeader collection="dataflows" index={index} />
      <Section title="Dataflow" icon="arrow-swap">
        <div className="form-grid">
          <IdField collection="dataflows" index={index} />
          <Field label="Direction">
            <span className="field-row">
              <CheckboxField path={[...base, 'bidirectional']} label="Both ways" hint="The information flows in both directions." />
              <IconButton
                icon="arrow-swap"
                label="Swap source and destination"
                showLabel
                onClick={() =>
                  edit([
                    { op: 'set', path: [...base, 'source'], value: String(flow.destination ?? '') },
                    { op: 'set', path: [...base, 'destination'], value: String(flow.source ?? '') },
                  ])
                }
              />
            </span>
          </Field>
          <EndpointField index={index} end="source" />
          <EndpointField index={index} end="destination" />
          <ChipsField path={[...base, 'tags']} label="Tags" placeholder="Add tag" />
          <TextAreaField path={[...base, 'description']} label="Description" />
        </div>
      </Section>
      <AssetsSection columns={[{ label: 'Carried', path: [...base, 'assets'] }]} hint="Assets that travel through this dataflow." />
      <ThreatsSection collection="dataflows" index={index} />
      <AttributesSection path={[...base, 'attributes']} />
    </div>
  );
}

export function AssetPage({ index }: { index: number }) {
  const { spec } = useOtm();
  const base = ['assets', index];
  const uses = assetUses(spec, itemId(itemsOf(spec, 'assets')[index] ?? {}));
  return (
    <div className="page">
      <ItemHeader collection="assets" index={index} />
      <Section title="Asset" icon="database">
        <div className="form-grid">
          <IdField collection="assets" index={index} />
          <TextAreaField path={[...base, 'description']} label="Description" placeholder="The sensitive information, e.g. credit card numbers" />
        </div>
      </Section>
      <Section title="Risk" icon="pulse">
        <div className="form-grid risk-grid">
          <RiskField path={[...base, 'risk', 'confidentiality']} label="Confidentiality" hint={RISK_HINTS.confidentiality} />
          <RiskField path={[...base, 'risk', 'integrity']} label="Integrity" hint={RISK_HINTS.integrity} />
          <RiskField path={[...base, 'risk', 'availability']} label="Availability" hint={RISK_HINTS.availability} />
          <TextAreaField path={[...base, 'risk', 'comment']} label="Comment" placeholder="Why these values" />
        </div>
      </Section>
      <Section title="Used by" icon="references" count={uses.length}>
        {uses.length === 0 && <p className="muted">Not used yet: mark it on components (processed, stored) or dataflows (carried).</p>}
        {uses.map((use) => (
          <div key={`${use.collection}${use.index}`} className="list-row">
            <span className={`codicon codicon-${COLLECTION_LABELS[use.collection].icon}`} aria-hidden="true" />
            <ItemLink collection={use.collection} index={use.index} />
            <span className="muted">{use.how}</span>
          </div>
        ))}
      </Section>
      <AttributesSection path={[...base, 'attributes']} />
    </div>
  );
}

export function ThreatPage({ index }: { index: number }) {
  const { spec } = useOtm();
  const base = ['threats', index];
  const id = itemId(itemsOf(spec, 'threats')[index] ?? {});
  const uses = id ? threatUses(spec).filter((u) => u.threat === id) : [];
  return (
    <div className="page">
      <ItemHeader collection="threats" index={index} />
      <Section title="Threat" icon="bug">
        <div className="form-grid">
          <IdField collection="threats" index={index} />
          <ChipsField path={[...base, 'categories']} label="Categories" placeholder="e.g. Spoofing" suggestions={STRIDE} />
          <ChipsField path={[...base, 'cwes']} label="CWEs" placeholder="e.g. CWE-79" />
          <ChipsField path={[...base, 'tags']} label="Tags" placeholder="Add tag" />
          <TextAreaField path={[...base, 'description']} label="Description" placeholder="What an attacker could do" />
        </div>
      </Section>
      <Section title="Risk" icon="pulse">
        <div className="form-grid risk-grid">
          <RiskField path={[...base, 'risk', 'likelihood']} label="Likelihood" hint={RISK_HINTS.likelihood} />
          <TextAreaField path={[...base, 'risk', 'likelihoodComment']} label="Likelihood comment" />
          <RiskField path={[...base, 'risk', 'impact']} label="Impact" hint={RISK_HINTS.impact} />
          <TextAreaField path={[...base, 'risk', 'impactComment']} label="Impact comment" />
        </div>
      </Section>
      <Section title="Found on" icon="references" count={uses.length}>
        {uses.length === 0 && <p className="muted">Not linked yet: link it from the Threats section of a component or dataflow.</p>}
        {uses.map((use) => (
          <UseRow key={`${use.collection}${use.index}-${use.instance}`} use={use} show="element" />
        ))}
      </Section>
      <AttributesSection path={[...base, 'attributes']} />
    </div>
  );
}

export function MitigationPage({ index }: { index: number }) {
  const { spec } = useOtm();
  const base = ['mitigations', index];
  const id = itemId(itemsOf(spec, 'mitigations')[index] ?? {});
  const uses = id ? threatUses(spec).flatMap((u) => u.mitigations.filter((m) => m.mitigation === id).map((m) => ({ ...u, state: m.state }))) : [];
  return (
    <div className="page">
      <ItemHeader collection="mitigations" index={index} />
      <Section title="Mitigation" icon="check-all">
        <div className="form-grid">
          <IdField collection="mitigations" index={index} />
          <RiskField path={[...base, 'riskReduction']} label="Risk reduction" hint={RISK_HINTS.riskReduction} />
          <TextAreaField path={[...base, 'description']} label="Description" placeholder="What is done to reduce the risk" />
        </div>
      </Section>
      <Section title="Applied to" icon="references" count={uses.length}>
        {uses.length === 0 && <p className="muted">Not applied yet: add it to a threat on a component or dataflow.</p>}
        {uses.map((use, i) => (
          <UseRow key={i} use={use} show="threat" />
        ))}
      </Section>
      <AttributesSection path={[...base, 'attributes']} />
    </div>
  );
}
