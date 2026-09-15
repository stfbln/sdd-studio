/** Workspace-relative path helpers shared by all modules (no VS Code dependency). */

const INVALID_SEGMENT = /[\\/:*?"<>|\u0000-\u001f]/;

function segmentError(segment: string): string | undefined {
  if (!segment.trim()) return 'Names cannot be empty';
  if (segment === '.' || segment === '..') return '"." and ".." are not allowed';
  if (INVALID_SEGMENT.test(segment)) return 'Names cannot contain \\ / : * ? " < > |';
  if (segment !== segment.trim()) return 'Names cannot start or end with a space';
  return undefined;
}

/** Folder written with "/" separators; "" is the workspace root. */
export function normalizeFolder(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s !== '')
    .join('/');
}

export function folderError(path: string): string | undefined {
  for (const segment of normalizeFolder(path).split('/').filter(Boolean)) {
    const error = segmentError(segment);
    if (error) return `Folder: ${error}`;
  }
  return undefined;
}

export function fileNameError(fileName: string, extensions: string[] = []): string | undefined {
  const trimmed = fileName.trim();
  if (!trimmed || extensions.some((ext) => trimmed.toLowerCase() === ext.toLowerCase())) return 'A file name is required';
  const error = segmentError(trimmed);
  return error ? `File name: ${error}` : undefined;
}

/** Keeps a known extension, otherwise appends the fallback one. */
export function withExtension(fileName: string, extensions: string[], fallback: string): string {
  const trimmed = fileName.trim();
  return extensions.some((ext) => trimmed.toLowerCase().endsWith(ext.toLowerCase())) ? trimmed : trimmed + fallback;
}

/** Swaps a known extension for another one ("a.openapi.yaml" -> "a.openapi.json"). */
export function replaceExtension(fileName: string, extensions: string[], next: string): string {
  const known = [...extensions].sort((a, b) => b.length - a.length).find((ext) => fileName.toLowerCase().endsWith(ext.toLowerCase()));
  return (known ? fileName.slice(0, -known.length) : fileName) + next;
}

export function joinPath(folder: string, name: string): string {
  const base = normalizeFolder(folder);
  return base ? `${base}/${name}` : name;
}

export function parentFolder(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
