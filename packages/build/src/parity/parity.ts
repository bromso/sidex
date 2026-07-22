export type ParityStatus = 'done' | 'partial' | 'stubbed' | 'unwired' | 'missing';

export interface ParitySignals {
	stub_service?: string | string[];
	contrib?: string | string[];
}

export interface ParityEntry {
	id: string;
	area: string;
	status: ParityStatus;
	summary: string;
	signals?: ParitySignals;
	evidence?: string[];
	since?: string;
}

export interface ParityIgnore {
	stub_service?: string;
	contrib?: string;
	reason: string;
}

export interface ParityData {
	entries: ParityEntry[];
	ignore?: ParityIgnore[];
}

export interface RepoSnapshot {
	/** Names of `class Null*` service stubs found under packages/workbench/src. */
	stubClasses: string[];
	/** `contrib/<name>` paths referenced by an uncommented import in an entry file. */
	importedContribs: string[];
	/** Every `contrib/<name>` directory that exists in the tree. */
	contribDirs: string[];
}

export interface Violation {
	id: string;
	message: string;
	files: string[];
}

export function toArray(v: string | string[] | undefined): string[] {
	if (v === undefined) {
		return [];
	}
	return Array.isArray(v) ? v : [v];
}

export function checkParity(data: ParityData, snapshot: RepoSnapshot): Violation[] {
	const violations: Violation[] = [];

	for (const entry of data.entries) {
		const stubs = toArray(entry.signals?.stub_service);
		for (const stub of stubs) {
			const exists = snapshot.stubClasses.includes(stub);
			if ((entry.status === 'done' || entry.status === 'partial') && exists) {
				violations.push({
					id: entry.id,
					message: `claims '${entry.status}' but Null stub '${stub}' is still registered`,
					files: entry.evidence ?? []
				});
			}
			if (entry.status === 'stubbed' && !exists) {
				violations.push({
					id: entry.id,
					message: `claims 'stubbed' but Null stub '${stub}' was not found (implemented? update the matrix)`,
					files: entry.evidence ?? []
				});
			}
		}

		const contribs = toArray(entry.signals?.contrib);
		for (const contrib of contribs) {
			const imported = snapshot.importedContribs.includes(contrib);
			if ((entry.status === 'done' || entry.status === 'partial') && !imported) {
				violations.push({
					id: entry.id,
					message: `claims '${entry.status}' but '${contrib}' is imported in no entry file (unwired)`,
					files: entry.evidence ?? []
				});
			}
			if ((entry.status === 'unwired' || entry.status === 'stubbed' || entry.status === 'missing') && imported) {
				violations.push({
					id: entry.id,
					message: `claims '${entry.status}' but '${contrib}' is now imported — promote it`,
					files: entry.evidence ?? []
				});
			}
		}
	}

	return violations;
}
