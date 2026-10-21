import type { InputOutputAdapter } from '@yeoman/types';
import type { ConflicterOptions } from '@yeoman/conflicter';
import createdLogger from 'debug';
import type { Store } from 'mem-fs';
import type { MemFsEditorFile } from 'mem-fs-editor';
import { createCommitTransform } from 'mem-fs-editor/transform';
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
  // The conflicter is loaded by the commit only.
  const { createConflicterTransform, createYoResolveTransform, forceYoFiles } = await import('@yeoman/conflicter');
  await sharedFs.pipeline(
    { filter: (file: MemFsEditorFile) => isFilePending(file) || file.path.endsWith('.yo-resolve') },
    createYoResolveTransform(),
    forceYoFiles(),
    createConflicterTransform(adapter, conflicterOptions),
    createCommitTransform(),
  );
};
