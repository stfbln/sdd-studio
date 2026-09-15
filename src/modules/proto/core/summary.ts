import type { SpecDetails } from '../../../shared/catalog';
import { analyzeProto, countRpcs, importInfos, listEnums, listMessages, plural, WELL_KNOWN_IMPORTS } from './analysis';
import { ProtoSyntaxError } from './model';
import { parseProto } from './parse';

/** Syntax error, or the problems of a .proto file (imports of the project are not resolved). */
export function checkProto(text: string): { severity: 'error' | 'warning'; message: string }[] {
  let file;
  try {
    file = parseProto(text);
  } catch (err) {
    return [{ severity: 'error', message: err instanceof ProtoSyntaxError ? `Line ${err.line}: ${err.message}` : String(err) }];
  }
  return analyzeProto(file, unresolvedImports(file)).map(({ severity, message }) => ({ severity, message }));
}

// Imports are not resolved here: types coming from them are not reported as unknown.
const unresolvedImports = (file: ReturnType<typeof parseProto>) => importInfos(file).map((i) => (i.wellKnown ? i : { ...i, resolved: undefined }));

/** Catalog row of a .proto file, and the imports that point to other files of the project. */
export function summarizeProto(text: string): { summary: SpecDetails; localImports: number } {
  let file;
  try {
    file = parseProto(text);
  } catch (err) {
    const message = err instanceof ProtoSyntaxError ? `Line ${err.line}: ${err.message}` : String(err);
    return {
      summary: { name: /^\s*package\s+([\w.]+)/m.exec(text)?.[1] ?? '', tags: [], details: [], error: message },
      localImports: 0,
    };
  }

  const syntax = file.syntax ? (file.syntax.keyword === 'edition' ? `edition ${file.syntax.value}` : file.syntax.value) : 'proto2 (implicit)';
  const localImports = file.imports.filter((i) => !WELL_KNOWN_IMPORTS[i.path] && !i.path.startsWith('google/')).length;
  const imports = unresolvedImports(file);
  const services = file.services;
  return {
    summary: {
      name: services.map((s) => s.name).join(', ') || file.package?.name || '',
      tags: file.package && services.length ? [file.package.name] : [],
      details: [
        syntax,
        ...(services.length ? [plural(services.length, 'service'), plural(countRpcs(services), 'RPC')] : []),
        plural(listMessages(file).length, 'message'),
        ...(listEnums(file).length ? [plural(listEnums(file).length, 'enum')] : []),
      ],
      problems: analyzeProto(file, imports).length,
    },
    localImports,
  };
}
