import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import Table from 'cli-table';
import dateFormat from 'dateformat';
import prettyBytes from 'pretty-bytes';
import { isBinaryFileSync } from 'isbinaryfile';
import textextensions from 'textextensions';
import binaryextensions from 'binaryextensions';

const isBinary = (filePath, newFileContents) => {
  const extension = path.extname(filePath).replace(/^\./, '') || path.basename(filePath);
  if (binaryextensions.includes(extension)) {
    return true;
  }

  if (textextensions.includes(extension)) {
    return false;
  }

  return (
    (fs.existsSync(filePath) && isBinaryFileSync(filePath)) ||
    (newFileContents && isBinaryFileSync(Buffer.isBuffer(newFileContents) ? newFileContents : Buffer.from(newFileContents)))
  );
};

const binaryDiff = (existingFilePath, newFileContents) => {
  const existingStat = fs.statSync(existingFilePath);
  const table = new Table({
    head: ['', 'Existing', 'Replacement', 'Diff'],
  });

  let sizeDiff;

  if (!newFileContents) {
    newFileContents = Buffer.from([]);
  }

  sizeDiff = existingStat.size > newFileContents.length ? '-' : '+';

  sizeDiff += prettyBytes(Math.abs(existingStat.size - newFileContents.length));

  table.push(
    ['Size', prettyBytes(existingStat.size), prettyBytes(newFileContents.length), sizeDiff],
    ['Last modified', dateFormat(existingStat.mtime), '', ''],
  );

  return table.toString();
};

export { isBinary, binaryDiff };
