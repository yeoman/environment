import { type PipelineSource } from 'node:stream';
import type { InputOutputAdapter } from '@yeoman/types';
import { type ConflicterOptions, createConflicterTransform, createYoResolveTransform, forceYoFiles } from '@yeoman/conflicter';
import createdLogger from 'debug';
import type { Store } from 'mem-fs';
import { create as createMemFsEditor, type MemFsEditorFile } from 'mem-fs-editor';
// eslint-disable-next-line n/file-extension-in-import
import { createCommitTransform } from 'mem-fs-editor/transform';
// eslint-disable-next-line n/file-extension-in-import
import { isFilePending } from 'mem-fs-editor/state';

const debug = createdLogger('yeoman:environment:commit');

/**
 * Commits the MemFs to the disc.
 */
export const commitSharedFsTask = async ({
  adapter,
  conflicterOptions,
  sharedFs,
}: {
  adapter: InputOutputAdapter;
  conflicterOptions?: ConflicterOptions;
  sharedFs: Store<MemFsEditorFile>;
}) => {
  debug('Running commitSharedFsTask');
  const editor = createMemFsEditor(sharedFs);
  await sharedFs.pipeline(
    { filter: (file: MemFsEditorFile) => isFilePending(file) || file.path.endsWith('.yo-resolve') },
    createYoResolveTransform(),
    forceYoFiles(),
    createConflicterTransform(adapter, conflicterOptions),
    createCommitTransform(),
  );
};
