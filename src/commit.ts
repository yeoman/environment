import { Duplex, type PipelineSource } from 'node:stream';
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
export const commitSharedFsTask = async ({
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
  const editor = createMemFsEditor(sharedFs);
  await sharedFs.pipeline(
    { filter: (file: MemFsEditorFile) => isFilePending(file) || file.path.endsWith('.yo-resolve') },
    createYoResolveTransform(),
    forceYoFiles(),
    createConflicterTransform(adapter, conflicterOptions),
    Duplex.from(async function* (source: AsyncGenerator<MemFsEditorFile>) {
      for await (const file of source) {
        await editor.commitFileAsync(file);
        yield file;
      }
    }),
  );
};
