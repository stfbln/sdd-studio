import * as vscode from 'vscode';
import { registeredSpecIndexes } from '../host/catalog/registry';
import { indexOf, readText } from '../host/catalog/specFiles';
import type { SpecIndex } from '../host/catalog/SpecIndex';
import type { SpecKind } from '../host/catalog/SpecKind';
import { defaultFolder, exists, newFileText, toUri } from '../host/catalog/workspaceFiles';
import { replaceText } from '../host/textEdits';
import { entityBrief, entityLinkEdits, linkConflict, newSpecFileRequest, suggestedTitle } from '../modules/backstage/core/brief';
import { entitiesOf, formatRef, keyOf, knownEntities, matchEntities, parseRef, SPEC_FILE_KINDS, type EntitySummary, type SpecFileKind } from '../modules/backstage/core/model';
import { scaffoldSpecFile } from '../modules/backstage/core/scaffold';
import { computeCatalogContext, entitiesOfEntry } from '../modules/backstage/host/context';
import { folderError, joinPath, normalizeFolder } from '../shared/files';
import { refreshInstructions } from '../shared/instructions';
import { slugify, withArticle } from '../shared/naming';
import { SOURCE_OF_TRUTH_RULES, SPEC_PURPOSES, type PurposeKind } from '../shared/purposes';
import type { JsonObject, SpecEdit } from '../shared/structured/edits';
import { applyYamlDocumentEdits, parseYamlDocuments } from '../shared/structured/yamlDocuments';
import {
  SDD_STUDIO_API_VERSION,
  type CatalogEntity,
  type CatalogFileResult,
  type CreateCatalogFileOptions,
  type CreateSpecOptions,
  type EntityDetails,
  type LinkSpecOptions,
  type SddStudioApi,
  type SpecCheckResult,
  type SpecFileEntry,
  type SpecKindsDescription,
  type WriteResult,
} from './types';

/** Lets other extensions and AI assistants write and save without leaving the changes open for review. */
export const WRITE_WITHOUT_REVIEW_SETTING = 'sdd.api.writeWithoutReview';

const workspaceFolders = () => vscode.workspace.workspaceFolders ?? [];
const folderName = (workspace: number) => workspaceFolders()[workspace]?.name ?? '';
const isSpecFileKind = (kind: string): kind is SpecFileKind => Object.hasOwn(SPEC_FILE_KINDS, kind);

/** An entity of a catalog file, as indexed from disk. */
interface IndexedEntity extends EntitySummary {
  workspace: number;
}

/** An entity in its catalog document (with unsaved changes), ready to be read or linked. */
interface OpenEntity {
  workspace: number;
  document: vscode.TextDocument;
  spec: unknown;
  index: number;
  context: Awaited<ReturnType<typeof computeCatalogContext>>;
  summary: EntitySummary;
  ref: string;
}

/** Workspace index of a folder name; undefined when no name is given. */
function workspaceNamed(name: string | undefined): number | undefined {
  if (!name) return undefined;
  const folders = workspaceFolders();
  const found = folders.find((f) => f.name === name) ?? folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`No workspace folder is named "${name}". Open folders: ${folders.map((f) => f.name).join(', ') || 'none'}.`);
  return found.index;
}

const refOf = (summary: EntitySummary) => formatRef(summary, undefined);

/** Reference of the entity a relation points to ("system:default/shop" -> "system:shop"). */
function relationRef(summary: EntitySummary, field: string): string | undefined {
  const match = /^([^:]+):([^/]+)\/(.+)$/.exec(summary.relations.find((r) => r.field === field)?.target ?? '');
  return match ? formatRef({ kind: match[1], namespace: match[2], name: match[3] }, undefined) : undefined;
}

function toCatalogEntity(summary: EntitySummary, workspace: number): CatalogEntity {
  return {
    ref: refOf(summary),
    kind: summary.kind,
    category: summary.category,
    ...(summary.type ? { type: summary.type } : {}),
    ...(summary.title ? { title: summary.title } : {}),
    ...(summary.description ? { description: summary.description } : {}),
    ...(relationRef(summary, 'system') ? { system: relationRef(summary, 'system') } : {}),
    ...(relationRef(summary, 'owner') ? { owner: relationRef(summary, 'owner') } : {}),
    workspaceFolder: folderName(workspace),
    file: summary.file,
    ...(summary.definition ? { definition: summary.definition } : {}),
    specs: summary.specs,
    threatModels: summary.threatModels,
  };
}

function flattenRule(rule: string | string[]): string {
  return typeof rule === 'string' ? rule : [rule[0], ...rule.slice(1).map((item) => `- ${item}`)].join('\n');
}

/**
 * What SDD Studio offers other extensions and AI assistants: the purpose of each kind of file, the
 * software catalog as the entry point, and creating, linking and checking spec files.
 */
export class SddStudioService implements SddStudioApi {
  readonly version = SDD_STUDIO_API_VERSION;

  describeSpecKinds(): SpecKindsDescription {
    const indexes = [...registeredSpecIndexes()].sort((a, b) => Number(b.kind.info.kind === 'backstage') - Number(a.kind.info.kind === 'backstage'));
    return {
      sourceOfTruth: SOURCE_OF_TRUTH_RULES,
      kinds: indexes.map(({ kind }) => {
        const purpose = SPEC_PURPOSES[kind.info.kind as PurposeKind];
        const fileName = `example${kind.info.formats[0].extension}`;
        const instructions = kind.instructions(fileName, kind.template(kind.info.singular, fileName));
        return {
          kind: kind.info.kind,
          title: kind.info.title,
          purpose: purpose.summary,
          owns: purpose.owns,
          elsewhere: purpose.elsewhere,
          linkedFrom: purpose.linkedFrom,
          formats: kind.info.formats,
          defaultFolder: defaultFolder(kind),
          // The purpose is given above.
          editingRules: instructions.rules.map(flattenRule).filter((rule) => !rule.startsWith('Purpose:')),
          ...(instructions.docs ? { docs: instructions.docs } : {}),
          ...(instructions.schema ? { schema: instructions.schema } : {}),
        };
      }),
    };
  }

  async listCatalogEntities(options: { workspaceFolder?: string; category?: string; query?: string } = {}): Promise<CatalogEntity[]> {
    const category = options.category?.toLowerCase();
    const query = options.query?.toLowerCase();
    return (await this.indexedEntities(workspaceNamed(options.workspaceFolder)))
      .map((e) => toCatalogEntity(e, e.workspace))
      .filter((e) => !category || e.category.toLowerCase() === category || e.kind.toLowerCase() === category)
      .filter((e) => !query || [e.ref, e.title, e.description].some((text) => text?.toLowerCase().includes(query)));
  }

  async getCatalogEntity(ref: string, options: { workspaceFolder?: string } = {}): Promise<EntityDetails> {
    const target = await this.openEntity(ref, options.workspaceFolder);
    const brief = entityBrief(target.spec, target.index, target.context);
    if (!brief) throw new Error(`${target.ref} could not be read in ${target.summary.file}.`);
    return { entity: toCatalogEntity(target.summary, target.workspace), brief };
  }

  async listSpecFiles(options: { workspaceFolder?: string; kind?: string } = {}): Promise<SpecFileEntry[]> {
    const workspace = workspaceNamed(options.workspaceFolder);
    const links = await this.linksByFile(workspace);
    const files: SpecFileEntry[] = [];
    for (const index of registeredSpecIndexes()) {
      if (options.kind && index.kind.info.kind !== options.kind) continue;
      for (const { summary } of await index.all()) {
        if (workspace !== undefined && summary.workspace !== workspace) continue;
        files.push({
          kind: index.kind.info.kind,
          workspaceFolder: folderName(summary.workspace),
          path: summary.path,
          name: summary.name,
          details: summary.details,
          ...(summary.problems !== undefined ? { problems: summary.problems } : {}),
          ...(summary.error ? { error: summary.error } : {}),
          linkedFrom: links.get(`${summary.workspace}:${summary.path}`) ?? [],
        });
      }
    }
    return files.sort((a, b) => a.workspaceFolder.localeCompare(b.workspaceFolder) || a.path.localeCompare(b.path));
  }

  async checkSpecFile(path: string, options: { workspaceFolder?: string } = {}): Promise<SpecCheckResult> {
    const file = await this.resolveFile(path, options.workspaceFolder);
    const read = await readText(file.uri);
    if (!read) throw new Error(`${file.path} does not exist in ${folderName(file.workspace)}.`);
    const index = indexOf(file.uri, read.text);
    if (!index) throw new Error(`${file.path} is not a file SDD Studio knows. ${this.kindsHint()}`);
    const linkedFrom = (await this.linksByFile(file.workspace)).get(`${file.workspace}:${file.path}`) ?? [];
    const problems = index.kind.check(file.uri.path, read.text);
    if (isSpecFileKind(index.kind.info.kind) && !linkedFrom.length) {
      problems.push({ severity: 'warning', message: 'No catalog entity links this file: link it from the entity it describes (link_spec_file), the catalog entry is the entry point.' });
    }
    return { kind: index.kind.info.kind, workspaceFolder: folderName(file.workspace), path: file.path, unsaved: !!read.document?.isDirty, problems, linkedFrom };
  }

  async createCatalogFile(options: CreateCatalogFileOptions): Promise<CatalogFileResult> {
    const index = this.catalogIndex();
    const { kind } = index;
    const title = options.title.trim();
    if (!title) throw new Error('A title is required: the name of the system or domain the file describes.');
    if (!workspaceFolders().length) throw new Error('No folder is open.');
    const workspace = workspaceNamed(options.workspaceFolder) ?? 0;
    const folder = normalizeFolder(options.folder ?? defaultFolder(kind));
    const { path, uri } = await this.newFileLocation(kind, workspace, folder, title);
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    if (options.content !== undefined && !kind.accepts(fileName, options.content)) {
      throw new Error('The content is not a Backstage catalog file: each YAML document needs apiVersion: backstage.io/v1alpha1.');
    }
    const text = newFileText(kind, fileName, options.content ?? kind.template(title, fileName));
    const parsed = parseYamlDocuments(text);
    const result = {
      workspaceFolder: folderName(workspace),
      path,
      entities: parsed.ok ? entitiesOf(parsed.value).map((e) => formatRef(e, undefined)) : [],
      problems: kind.check(fileName, text),
    };
    if (!this.writeWithoutReview()) {
      await this.openForReview(uri, text);
      return {
        ...result,
        saved: false,
        message: `${path} is open in the editor for the user to review. It does not exist on disk until the user saves it, and its entities are only known to the other tools once saved: ask the user to review and save it before creating spec files for them. Do not write it yourself.`,
      };
    }
    await this.writeNew(uri, text);
    await index.refresh(uri);
    return { ...result, saved: true, message: `${path} is written.` };
  }

  async createSpecFile(options: CreateSpecOptions): Promise<WriteResult> {
    if (!isSpecFileKind(options.kind)) throw new Error(`Unknown kind "${options.kind}". ${this.kindsHint()} Catalog entities are added by editing catalog files.`);
    const index = this.indexOfKind(options.kind);
    const { kind } = index;
    const target = await this.openEntity(options.entity, options.workspaceFolder);
    const request = (() => {
      const brief = entityBrief(target.spec, target.index, target.context);
      return brief && newSpecFileRequest(target.spec, target.index, target.context, options.kind, options.title?.trim() || suggestedTitle(options.kind, brief));
    })();
    if (!request) throw new Error(`${target.ref} could not be read in ${target.summary.file}.`);

    const folder = normalizeFolder(options.folder ?? defaultFolder(kind));
    const { path, uri } = await this.newFileLocation(kind, target.workspace, folder, request.title, this.formatOf(kind, options.format));
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    const file = { path, kind: options.kind, name: request.title };

    const conflict = linkConflict(target.spec, target.index, file, target.context);
    if (conflict) throw new Error(conflict);
    if (options.content !== undefined && !kind.accepts(fileName, options.content)) {
      throw new Error(`The content is not ${withArticle(kind.info.singular)} (${fileName}). ${kind.info.kind === 'spec' ? '' : 'Check its version field.'}`.trim());
    }
    const text = newFileText(kind, fileName, options.content ?? scaffoldSpecFile(request, path, /\.json$/i.test(fileName) ? 'json' : 'yaml'));
    // Trust zones of networks only exist in the threat model written from the catalog.
    const edits = entityLinkEdits(target.spec, target.index, file, target.context, options.content === undefined ? request : undefined);
    const problems = kind.check(fileName, text);
    const result = { kind: options.kind, workspaceFolder: folderName(target.workspace), path, entity: target.ref, catalogFile: target.summary.file, problems };

    if (!this.writeWithoutReview()) {
      await this.editCatalog(target.document, edits, false);
      await vscode.commands.executeCommand('vscode.open', target.document.uri, { preview: false, preserveFocus: true });
      await this.openForReview(uri, text);
      return {
        ...result,
        saved: false,
        message: `${path} is open in the editor for the user to review, linked from ${target.summary.file} (also not saved yet). The file does not exist on disk until the user saves it: do not write it yourself, check it with check_spec_file once saved.`,
      };
    }

    await this.writeNew(uri, text);
    const catalogSaved = await this.editCatalog(target.document, edits, true);
    await index.refresh(uri);
    return {
      ...result,
      saved: catalogSaved,
      message: `${path} is written, linked from ${target.summary.file}${catalogSaved ? '' : ', whose unsaved changes (the link included) wait for the user to save them'}.`,
    };
  }

  async linkSpecFile(options: LinkSpecOptions): Promise<WriteResult> {
    const file = await this.resolveFile(options.path, options.workspaceFolder);
    const read = await readText(file.uri);
    if (!read) throw new Error(`${file.path} does not exist in ${folderName(file.workspace)}.`);
    const fileIndex = indexOf(file.uri, read.text);
    const kind = fileIndex?.kind.info.kind;
    if (!fileIndex || !kind || !isSpecFileKind(kind)) throw new Error(`${file.path} is not a spec file or threat model SDD Studio knows. ${this.kindsHint()}`);
    const target = await this.openEntity(options.entity, options.workspaceFolder ?? folderName(file.workspace));
    if (target.workspace !== file.workspace) throw new Error(`${target.ref} is in the workspace folder ${folderName(target.workspace)}, not in ${folderName(file.workspace)}.`);

    const info = { path: file.path, kind, name: '' };
    const conflict = linkConflict(target.spec, target.index, info, target.context);
    if (conflict) throw new Error(conflict);
    const edits = entityLinkEdits(target.spec, target.index, info, target.context);
    const result = { kind, workspaceFolder: folderName(file.workspace), path: file.path, entity: target.ref, catalogFile: target.summary.file, problems: fileIndex.kind.check(file.uri.path, read.text) };
    if (!edits.length || applyYamlDocumentEdits(target.document.getText(), edits) === target.document.getText()) {
      return { ...result, saved: !target.document.isDirty, message: `${target.ref} already links ${file.path}.` };
    }
    if (!this.writeWithoutReview()) {
      await this.editCatalog(target.document, edits, false);
      await vscode.commands.executeCommand('vscode.open', target.document.uri, { preview: false });
      return { ...result, saved: false, message: `The link is added to ${target.summary.file}, open in the editor for the user to review and save.` };
    }
    const saved = await this.editCatalog(target.document, edits, true);
    return { ...result, saved, message: `${target.summary.file} links ${file.path} from ${target.ref}${saved ? '' : ', not saved: the file had other unsaved changes'}.` };
  }

  /* Helpers ------------------------------------------------------------------ */

  private writeWithoutReview(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>(WRITE_WITHOUT_REVIEW_SETTING, false);
  }

  private kindsHint(): string {
    return `Known kinds: ${registeredSpecIndexes().map((i) => i.kind.info.kind).join(', ')} (see describe_spec_kinds).`;
  }

  private catalogIndex(): SpecIndex<JsonObject[]> {
    return this.indexOfKind('backstage') as SpecIndex<JsonObject[]>;
  }

  private indexOfKind(kind: string): SpecIndex<unknown> {
    const index = registeredSpecIndexes().find((i) => i.kind.info.kind === kind);
    if (!index) throw new Error(`No module handles ${kind} files.`);
    return index;
  }

  private formatOf(kind: SpecKind<unknown>, format: string | undefined): string {
    const { formats } = kind.info;
    if (!format) return formats[0].extension;
    const wanted = format.toLowerCase().replace(/^\./, '');
    const found = formats.find((f) => f.label.toLowerCase() === wanted || f.extension.toLowerCase().replace(/^\./, '') === wanted || f.extension.toLowerCase().endsWith(`.${wanted}`));
    if (!found) throw new Error(`${kind.info.title} are written as ${formats.map((f) => f.label).join(' or ')}.`);
    return found.extension;
  }

  /** A free path for a new file named after `title` in `folder`, adding -2, -3... when the name is taken. */
  private async newFileLocation(kind: SpecKind<unknown>, workspace: number, folder: string, title: string, extension = kind.info.formats[0].extension): Promise<{ path: string; uri: vscode.Uri }> {
    const error = folderError(folder);
    if (error) throw new Error(error);
    const separator = kind.info.fileNameSeparator ?? '-';
    const base = slugify(title, separator) || kind.info.kind;
    let fileName = `${base}${extension}`;
    for (let i = 2; await this.isTaken(toUri(workspace, joinPath(folder, fileName))); i++) fileName = `${base}${separator}${i}${extension}`;
    const path = joinPath(folder, fileName);
    return { path, uri: toUri(workspace, path) };
  }

  /** Opens a new file unsaved, with its text: it is written where it belongs when the user saves it. */
  private async openForReview(uri: vscode.Uri, text: string) {
    const untitled = uri.with({ scheme: 'untitled' });
    await vscode.workspace.openTextDocument(untitled);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(untitled, new vscode.Position(0, 0), text);
    if (!(await vscode.workspace.applyEdit(edit))) throw new Error('VS Code refused to open the new file.');
    await vscode.window.showTextDocument(untitled, { preview: false });
  }

  private async writeNew(uri: vscode.Uri, text: string) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
  }

  /** On disk, or waiting unsaved in an editor. */
  private async isTaken(uri: vscode.Uri): Promise<boolean> {
    return vscode.workspace.textDocuments.some((d) => d.uri.scheme === 'untitled' && d.uri.path === uri.path) || (await exists(uri));
  }

  private async indexedEntities(workspace: number | undefined): Promise<IndexedEntity[]> {
    const entries = await this.catalogIndex().all();
    return entries.filter((e) => workspace === undefined || e.summary.workspace === workspace).flatMap((entry) => entitiesOfEntry(entry).map((e) => ({ ...e, workspace: entry.summary.workspace })));
  }

  /** Entities linking each file ("workspace:path"), through definitions, specs and threat models. */
  private async linksByFile(workspace: number | undefined): Promise<Map<string, string[]>> {
    const links = new Map<string, string[]>();
    for (const entity of await this.indexedEntities(workspace)) {
      for (const path of new Set([entity.definition, ...entity.specs, ...entity.threatModels])) {
        if (!path) continue;
        const key = `${entity.workspace}:${path}`;
        links.set(key, [...(links.get(key) ?? []), refOf(entity)]);
      }
    }
    return links;
  }

  private async openEntity(ref: string, workspaceFolder: string | undefined): Promise<OpenEntity> {
    if (!parseRef(ref)) throw new Error(`"${ref}" is not an entity reference: write [kind:][namespace/]name, e.g. component:shop-api.`);
    const workspace = workspaceNamed(workspaceFolder);
    const matches = matchEntities(ref, await this.indexedEntities(workspace));
    if (!matches.length) throw new Error(`No catalog entity matches "${ref}". Find it with list_catalog_entities, or add it to a catalog file first.`);
    if (matches.length > 1) {
      const several = new Set(matches.map((m) => m.workspace)).size > 1;
      throw new Error(`"${ref}" matches several entities: ${matches.map((m) => `${refOf(m)}${several ? ` (${folderName(m.workspace)})` : ''}`).join(', ')}. Use the full reference${several ? ' and the workspace folder' : ''}.`);
    }
    const [match] = matches;
    const document = await vscode.workspace.openTextDocument(toUri(match.workspace, match.file));
    const parsed = parseYamlDocuments(document.getText());
    if (!parsed.ok) throw new Error(`${match.file} has a syntax error: ${parsed.errors[0]?.message ?? 'unknown'}. Fix it first.`);
    const index = entitiesOf(parsed.value).find((e) => keyOf(e) === match.key)?.index;
    if (index === undefined) throw new Error(`${match.file} no longer defines ${refOf(match)} (unsaved changes?).`);
    const context = await computeCatalogContext(document, this.catalogIndex());
    const summary = knownEntities(parsed.value, context).find((e) => e.index === index) ?? match;
    return { workspace: match.workspace, document, spec: parsed.value, index, context, summary, ref: refOf(summary) };
  }

  /** A workspace-relative path (in the given folder, or the one folder where it exists) or an absolute path. */
  private async resolveFile(path: string, workspaceFolder: string | undefined): Promise<{ uri: vscode.Uri; workspace: number; path: string }> {
    const folders = workspaceFolders();
    const slashed = path.trim().replace(/\\/g, '/');
    const absolute = /^[A-Za-z]:\//.test(slashed) ? `/${slashed}` : slashed.startsWith('/') ? slashed : undefined;
    if (absolute) {
      const windows = /^\/[A-Za-z]:\//.test(absolute);
      const same = (a: string) => (windows ? a.toLowerCase() : a);
      const folder = folders.find((f) => same(absolute).startsWith(same(`${f.uri.path.replace(/\/$/, '')}/`)));
      if (!folder) throw new Error(`${path} is outside the workspace folders.`);
      const relative = absolute.slice(folder.uri.path.replace(/\/$/, '').length + 1);
      return { uri: toUri(folder.index, relative), workspace: folder.index, path: normalizeFolder(relative) };
    }
    const relative = normalizeFolder(slashed);
    const named = workspaceNamed(workspaceFolder);
    if (named !== undefined || folders.length <= 1) {
      if (!folders.length) throw new Error('No folder is open.');
      return { uri: toUri(named ?? 0, relative), workspace: named ?? 0, path: relative };
    }
    const found: number[] = [];
    for (const folder of folders) if (await exists(toUri(folder.index, relative))) found.push(folder.index);
    if (found.length > 1) throw new Error(`${relative} exists in several workspace folders (${found.map(folderName).join(', ')}): give the workspace folder.`);
    const workspace = found[0] ?? 0;
    return { uri: toUri(workspace, relative), workspace, path: relative };
  }

  /** Applies edits to a catalog document as the form does; saves it when asked and it had no other unsaved changes. */
  private async editCatalog(document: vscode.TextDocument, edits: SpecEdit[], save: boolean): Promise<boolean> {
    const wasDirty = document.isDirty;
    if (edits.length) {
      const current = document.getText();
      let text = applyYamlDocumentEdits(current, edits);
      text = refreshInstructions(text, this.catalogIndex().kind.instructions(document.fileName, text));
      if (current.includes('\r\n')) text = text.replace(/\r?\n/g, '\r\n');
      if (!(await replaceText(document, text))) throw new Error('VS Code refused to change the catalog file.');
    }
    if (!save || wasDirty) return !document.isDirty;
    const saved = await document.save();
    if (saved) await this.catalogIndex().refresh(document.uri);
    return saved;
  }
}
