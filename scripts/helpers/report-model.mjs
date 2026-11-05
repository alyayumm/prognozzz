import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

export function createReportModelLoader() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const cache = new Map();
  const load = path => {
    const absolute = resolve(root, path.endsWith('.ts') ? path : `${path}.ts`);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {};
    cache.set(absolute, exports);
    const source = readFileSync(absolute, 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    runInThisContext(`(function(exports, require) { ${js}\n})`, { filename: absolute })(exports, name => load(resolve(dirname(absolute), name)));
    return exports;
  };
  return load;
}
