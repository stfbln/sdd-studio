import type { Draft } from 'immer';
import { createContext, useContext } from 'react';
import type { DialectKeywords, GherkinDocumentModel } from '../core/model';

export interface EditorActions {
  /** Applies an immer recipe to the whole document. */
  update(recipe: (doc: Draft<GherkinDocumentModel>) => void | GherkinDocumentModel): void;
  /** Applies an immer recipe to the node with this id (feature, rule, scenario, step, examples...). */
  edit<T>(id: string, recipe: (node: Draft<T>) => void): void;
  remove(id: string): void;
  move(id: string, delta: number): void;
  duplicate(id: string): void;
  openAsText(line?: number): void;
  changeLanguage(language: string): void;
}

export interface CollapseState {
  collapsed: ReadonlySet<string>;
  toggle(id: string): void;
}

export const ActionsContext = createContext<EditorActions | null>(null);
export const DialectContext = createContext<DialectKeywords | null>(null);
export const SuggestionsContext = createContext<string[]>([]);
export const CollapseContext = createContext<CollapseState>({ collapsed: new Set(), toggle: () => {} });

export function useActions(): EditorActions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('ActionsContext missing');
  return actions;
}

export function useDialect(): DialectKeywords {
  const dialect = useContext(DialectContext);
  if (!dialect) throw new Error('DialectContext missing');
  return dialect;
}
