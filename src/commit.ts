import type { PipelineSource } from 'node:stream';
import type { InputOutputAdapter } from '@yeoman/types';
import { type ConflicterOptions, createConflicterTransform, createYoResolveTransform, forceYoFiles } from '@yeoman/conflicter';
import createdLogger from 'debug';
import type { Store } from 'mem-fs';
import { create as createMemFsEditor, type MemFsEditorFile } from 'mem-fs-editor';
// eslint-disable-next-line n/file-extension-in-import
import { isFilePending } from 'mem-fs-editor/state';

const debug = createdLogger('yeoman:environment:commit');

/**
 * Commits the MemFs to the disc.
 * @param {Stream} [stream] - files stream, defaults to this.sharedFs.stream().
 * @return {Promise}
 */
export const commitSharedFsTask = ({
  adapter,
  conflicterOptions,
  sharedFs,
  stream,
}: {
  adapter: InputOutputAdapter;
  conflicterOptions?: ConflicterOptions;
  sharedFs: Store<MemFsEditorFile>;
  stream?: PipelineSource<any>;
}) => {
  debug('Running commitSharedFsTask');
  const fs = createMemFsEditor(sharedFs);
  stream = stream ?? fs.store.stream({ filter: file => isFilePending(file) });
  return fs.commit([createYoResolveTransform(), forceYoFiles(), createConflicterTransform(adapter, conflicterOptions)], stream);
};
