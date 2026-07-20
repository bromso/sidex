import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plugin } from 'vite';
import { createNlsCollector, scanSource, transformSource } from './transform';

export interface NlsPluginOptions {
	/** Absolute path to the directory scanned for localize() calls. */
	sourceRoot: string;
}

function walkDir(dir: string): string[] {
	const results: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...walkDir(full));
		} else {
			results.push(full);
		}
	}
	return results;
}

export function nlsPlugin(options: NlsPluginOptions): Plugin {
	const collector = createNlsCollector();
	const sourceRoot = path.resolve(options.sourceRoot);
	const normalizedRoot = sourceRoot.split(path.sep).join('/');
	let isBuild = false;

	return {
		name: 'vite-plugin-nls',
		enforce: 'pre',

		config(_cfg, env) {
			isBuild = env.command === 'build';
		},

		configureServer(server) {
			server.middlewares.use('/nls.messages.json', (_req, res) => {
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify(collector.entries, null, 2));
			});
		},

		buildStart() {
			if (isBuild) {
				return;
			}
			const files = walkDir(sourceRoot).filter(f => f.endsWith('.ts'));
			let count = 0;
			for (const file of files) {
				count += scanSource(fs.readFileSync(file, 'utf-8'), collector);
			}
			console.log(
				`[vite-plugin-nls] Pre-scanned ${files.length} files, found ${count} NLS entries (${collector.entries.length} unique)`
			);
		},

		transform(code, id) {
			const normalizedId = id.split(path.sep).join('/');
			if (!normalizedId.startsWith(normalizedRoot) || !normalizedId.endsWith('.ts')) {
				return null;
			}
			const out = transformSource(code, collector);
			return out === null ? null : { code: out };
		},

		generateBundle() {
			if (collector.entries.length > 0) {
				this.emitFile({
					type: 'asset',
					fileName: 'nls.messages.json',
					source: JSON.stringify(collector.entries, null, 2)
				});
			}
		}
	};
}
