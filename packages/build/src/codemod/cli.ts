#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import { LAYERS, type Layer, rewriteSource } from './rewrite-imports';

const repoRoot = path.resolve(import.meta.dir, '../../../..');
const dryRun = process.argv.includes('--dry-run');

const layerRoots = Object.fromEntries(LAYERS.map(l => [l, path.join(repoRoot, 'packages', l, 'src')])) as Record<
	Layer,
	string
>;

for (const [layer, root] of Object.entries(layerRoots)) {
	if (!fs.existsSync(root)) {
		console.error(`error: ${root} not found — move ${layer} into place first`);
		process.exit(2);
	}
}

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...walk(full));
		} else if (full.endsWith('.ts')) {
			out.push(full);
		}
	}
	return out;
}

let changedFiles = 0;
let scanned = 0;

for (const root of Object.values(layerRoots)) {
	for (const file of walk(root)) {
		scanned++;
		const code = fs.readFileSync(file, 'utf-8');
		const out = rewriteSource(code, file, layerRoots);
		if (out !== null) {
			changedFiles++;
			if (!dryRun) {
				fs.writeFileSync(file, out);
			}
		}
	}
}

console.log(
	`${dryRun ? '[dry-run] ' : ''}Scanned ${scanned} files, ${changedFiles} ${dryRun ? 'would change' : 'changed'}`
);
