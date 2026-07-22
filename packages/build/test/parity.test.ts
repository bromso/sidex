import { describe, expect, test } from 'bun:test';
import { checkParity, type ParityData, type RepoSnapshot } from '../src/parity/parity';

const emptySnapshot: RepoSnapshot = { stubClasses: [], importedContribs: [], contribDirs: [] };

describe('checkParity — stub signals', () => {
	test('flags a done row whose stub class is still registered', () => {
		const data: ParityData = {
			entries: [
				{
					id: 'notebooks',
					area: 'Notebooks',
					status: 'done',
					summary: 'x',
					signals: { stub_service: 'NullNotebookEditorService' }
				}
			]
		};
		const snapshot: RepoSnapshot = { ...emptySnapshot, stubClasses: ['NullNotebookEditorService'] };
		const violations = checkParity(data, snapshot);
		expect(violations).toHaveLength(1);
		expect(violations[0].id).toBe('notebooks');
		expect(violations[0].message).toContain('stub');
	});

	test('accepts a stubbed row whose stub class exists', () => {
		const data: ParityData = {
			entries: [
				{
					id: 'notebooks',
					area: 'Notebooks',
					status: 'stubbed',
					summary: 'x',
					signals: { stub_service: 'NullNotebookEditorService' }
				}
			]
		};
		const snapshot: RepoSnapshot = { ...emptySnapshot, stubClasses: ['NullNotebookEditorService'] };
		expect(checkParity(data, snapshot)).toHaveLength(0);
	});

	test('flags a stubbed row whose stub class has disappeared (stale)', () => {
		const data: ParityData = {
			entries: [
				{
					id: 'notebooks',
					area: 'Notebooks',
					status: 'stubbed',
					summary: 'x',
					signals: { stub_service: 'NullNotebookEditorService' }
				}
			]
		};
		expect(checkParity(data, emptySnapshot)).toHaveLength(1);
	});

	test('handles stub_service as an array (tracks every listed class)', () => {
		const data: ParityData = {
			entries: [
				{
					id: 'notebooks',
					area: 'Notebooks',
					status: 'stubbed',
					summary: 'x',
					signals: { stub_service: ['NullNotebookService', 'NullNotebookEditorService'] }
				}
			]
		};
		const snapshot: RepoSnapshot = {
			...emptySnapshot,
			stubClasses: ['NullNotebookService', 'NullNotebookEditorService']
		};
		expect(checkParity(data, snapshot)).toHaveLength(0);
	});
});

describe('checkParity — contrib signals', () => {
	const done = (contrib: string): ParityData => ({
		entries: [{ id: 'comments', area: 'Comments', status: 'done', summary: 'x', signals: { contrib } }]
	});

	test('flags a done row whose contrib is imported in no entry file', () => {
		const violations = checkParity(done('contrib/comments'), emptySnapshot);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain('unwired');
	});

	test('accepts a done row whose contrib is imported', () => {
		const snapshot: RepoSnapshot = { ...emptySnapshot, importedContribs: ['contrib/comments'] };
		expect(checkParity(done('contrib/comments'), snapshot)).toHaveLength(0);
	});

	test('flags an unwired row whose contrib is now imported (promote)', () => {
		const data: ParityData = {
			entries: [
				{ id: 'comments', area: 'Comments', status: 'unwired', summary: 'x', signals: { contrib: 'contrib/comments' } }
			]
		};
		const snapshot: RepoSnapshot = { ...emptySnapshot, importedContribs: ['contrib/comments'] };
		const violations = checkParity(data, snapshot);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain('promote');
	});

	test('accepts an unwired row whose contrib is imported nowhere', () => {
		const data: ParityData = {
			entries: [
				{ id: 'comments', area: 'Comments', status: 'unwired', summary: 'x', signals: { contrib: 'contrib/comments' } }
			]
		};
		expect(checkParity(data, emptySnapshot)).toHaveLength(0);
	});
});
