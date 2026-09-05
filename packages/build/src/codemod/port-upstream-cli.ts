#!/usr/bin/env bun
/**
 * Copies files from an upstream VS Code checkout (src/vs layout) into the
 * matching @sidex layer package, rewriting cross-layer relative imports to
 * `@sidex/<layer>/...` and `.../nls.js` imports to `@sidex/base/nls.js`.
 *
 * Usage:
 *   bun packages/build/src/codemod/port-upstream-cli.ts --upstream .cache/vscode-1.115.0 \
 *     base/common/controlFlow.ts workbench/contrib/mergeEditor/browser/model
 *
 * Paths are relative to <upstream>/src/vs. Directories are copied recursively
 * (.ts and .css only). Existing destination files are overwritten. Same-layer
 * relative imports are left untouched: the directory depth under
 * packages/<layer>/src mirrors src/vs/<layer>, so they still resolve.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LAYERS, type Layer, layerOf, rewriteSource } from './rewrite-imports';

const repoRoot = path.resolve(import.meta.dir, '../../../..');
const args = process.argv.slice(2);
const upstreamFlag = args.indexOf('--upstream');
if (upstreamFlag === -1 || !args[upstreamFlag + 1]) {
	console.error('usage: port-upstream-cli.ts --upstream <vscode checkout> <src/vs-relative path>...');
	process.exit(2);
}
const upstream = path.resolve(repoRoot, args[upstreamFlag + 1]);
const targets = args.filter((_, i) => i !== upstreamFlag && i !== upstreamFlag + 1);
const vsRoot = path.join(upstream, 'src', 'vs');
if (!fs.existsSync(vsRoot)) {
	console.error(`error: ${vsRoot} not found`);
	process.exit(2);
}
const layerRoots = Object.fromEntries(LAYERS.map(l => [l, path.join(vsRoot, l)])) as Record<Layer, string>;

// Matches `from '../../nls.js'` (any number of ../ segments) in import/export/dynamic-import position.
const NLS_RE = /((?:\bfrom|\bimport)\s*\(?\s*)(['"])(?:\.\.\/)+nls\.js\2/g;

function portFile(relPath: string): void {
	const src = path.join(vsRoot, relPath);
	const layer = layerOf(src, layerRoots);
	if (!layer) {
		throw new Error(`${relPath} is not inside a layer (base/platform/editor/workbench)`);
	}
	const rest = path.relative(layerRoots[layer], src);
	const dest = path.join(repoRoot, 'packages', layer, 'src', rest);
	let code = fs.readFileSync(src, 'utf8');
	if (relPath.endsWith('.ts')) {
		code = rewriteSource(code, src, layerRoots) ?? code;
		code = code.replace(NLS_RE, '$1$2@sidex/base/nls.js$2');
	}
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, code);
	console.log(`${relPath} -> ${path.relative(repoRoot, dest)}`);
}

function walk(relDir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(path.join(vsRoot, relDir), { withFileTypes: true })) {
		const rel = path.posix.join(relDir, entry.name);
		if (entry.isDirectory()) {
			out.push(...walk(rel));
		} else if (entry.name.endsWith('.ts') || entry.name.endsWith('.css')) {
			out.push(rel);
		}
	}
	return out.sort();
}

for (const target of targets) {
	const abs = path.join(vsRoot, target);
	if (!fs.existsSync(abs)) {
		console.error(`error: ${abs} not found`);
		process.exit(2);
	}
	const files = fs.statSync(abs).isDirectory() ? walk(target) : [target];
	for (const f of files) {
		portFile(f);
	}
}
