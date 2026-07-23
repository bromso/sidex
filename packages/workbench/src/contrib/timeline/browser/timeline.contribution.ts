/*---------------------------------------------------------------------------------------------
 *  SideX: registers the Timeline view into the Explorer and the generic openDiff command.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '@sidex/base/common/uri.js';
import * as nls from '@sidex/base/nls.js';
import { CommandsRegistry } from '@sidex/platform/commands/common/commands.js';
import { SyncDescriptor } from '@sidex/platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '@sidex/platform/instantiation/common/instantiation.js';
import { Registry } from '@sidex/platform/registry/common/platform.js';
import { Extensions, IViewDescriptor, IViewsRegistry } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VIEW_CONTAINER } from '../../files/browser/explorerViewlet.js';
import { TimelinePane } from './timelinePane.js';

// The service registers itself via registerSingleton on import.
import './timelineService.js';

const viewDescriptor: IViewDescriptor = {
	id: TimelinePane.ID,
	name: TimelinePane.NAME,
	ctorDescriptor: new SyncDescriptor(TimelinePane),
	order: 2,
	canToggleVisibility: true,
	canMoveView: true,
	hideByDefault: false
};

Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews([viewDescriptor], VIEW_CONTAINER);

// A single generic "open a diff between two resources" command used by all providers.
CommandsRegistry.registerCommand('timeline.openDiff', async (accessor: ServicesAccessor, ...args: unknown[]) => {
	const [left, right, label] = args as [URI, URI, string | undefined];
	if (!left || !right) {
		return;
	}
	const editorService = accessor.get(IEditorService);
	await editorService.openEditor({
		original: { resource: left },
		modified: { resource: right },
		label: label ?? nls.localize('timelineDiff', 'Timeline Comparison'),
		options: { pinned: true }
	});
});
