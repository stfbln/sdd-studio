import * as vscode from 'vscode';
import type { SddModule } from '../types';
import { openOverview } from './host/kinds';
import { StudioPanel } from './host/StudioPanel';
import { KindItem, registerStudioViews } from './host/StudioTreeView';

/** The home page of SDD Studio: the catalog, the overview of every spec format and the AI assistant pages. */
export const studioModule: SddModule = {
  id: 'studio',

  activate(context) {
    context.subscriptions.push(
      StudioPanel.registerSerializer(context),
      ...registerStudioViews(),
      vscode.commands.registerCommand('sdd.studio.open', () => StudioPanel.show(context)),
      // The inline button of a kind in the SDD Studio view, which hands over the row; hidden from the Command Palette.
      vscode.commands.registerCommand('sdd.studio.openOverview', (target: string | KindItem) =>
        openOverview(context, target instanceof KindItem ? target.kind.kind : target),
      ),
    );
  },
};
