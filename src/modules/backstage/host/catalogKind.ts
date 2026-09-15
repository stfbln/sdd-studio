import type { SpecKind } from '../../../host/catalog/SpecKind';
import type { JsonObject } from '../../../shared/structured/edits';
import { parseYamlDocuments } from '../../../shared/structured/yamlDocuments';
import { analyzeCatalog } from '../core/analysis';
import { catalogInstructions } from '../core/instructions';
import { looksLikeCatalog, newCatalogTemplate, summarizeCatalog } from '../core/summary';

/** Backstage catalog files (`catalog-info.yaml`), one entity per YAML document. */
export const catalogKind: SpecKind<JsonObject[]> = {
  info: {
    kind: 'backstage',
    title: 'Software Catalog',
    singular: 'catalog file',
    plural: 'catalog files',
    icon: 'type-hierarchy',
    namePlaceholder: 'e.g. Online shop (the system described by the file)',
    formats: [{ label: 'Backstage YAML', extension: '.catalog-info.yaml' }],
    acceptedExtensions: ['.yaml', '.yml'],
  },
  panelViewType: 'sdd.backstage.catalogOverview',
  editorViewType: 'sdd.backstage.editor',
  folderSetting: 'sdd.backstage.catalogFolder',
  defaultFolder: 'catalog',
  include: '**/*.{yaml,yml}',
  fileExtensions: ['.yaml', '.yml'],
  accepts: looksLikeCatalog,
  summarize: (fileName, text) => {
    const { summary, entities } = summarizeCatalog(fileName, text);
    return { summary, extra: entities };
  },
  template: (name) => newCatalogTemplate(name),
  check: (_fileName, text) => {
    const result = parseYamlDocuments(text);
    if (!result.ok) return result.errors.map((e) => ({ severity: 'error', message: `${e.line ? `Line ${e.line}: ` : ''}${e.message}` }));
    return analyzeCatalog(result.value).map(({ severity, message }) => ({ severity, message }));
  },
  instructions: catalogInstructions,
};
