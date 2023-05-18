import type { PassThrough } from 'node:stream';
import type { InputOutputAdapter } from '@yeoman/types';
import { type ConflicterOptions, createConflicterTransform, createYoResolveTransform, forceYoFiles } from '@yeoman/conflicter';
import type { Store } from 'mem-fs';
import { create as createMemFsEditor, type MemFsEditorFile } from 'mem-fs-editor';
// eslint-disable-next-line n/file-extension-in-import
import { isFilePending } from 'mem-fs-editor/state';
// eslint-disable-next-line n/file-extension-in-import
import { createCommitTransform } from 'mem-fs-editor/transform';

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
  sharedFs: Store<MemFsEditorFile>;
  adapter: InputOutputAdapter;
  conflicterOptions?: ConflicterOptions;
  stream?: PassThrough;
}) => {
  const fs = createMemFsEditor(sharedFs);
  stream = stream ?? fs.store.stream({ filter: file => isFilePending(file) });
  return fs.commit(
    [
      createYoResolveTransform(),
      forceYoFiles(),
      createConflicterTransform(adapter, conflicterOptions),
      // Use custom commit transform due to out of order transform.
      createCommitTransform(fs),
    ],
    stream,
  );
};
