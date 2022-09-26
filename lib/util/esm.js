const path = require('path');
const {pathToFileURL} = require('url');

module.exports = {
  requireOrImport(fileToImport) {
    if (['.cjs', 'cts'].includes(path.extname(fileToImport))) {
      return require(fileToImport);
    }
    if (['.mjs', '.mts'].includes(path.extname(fileToImport))) {
      // eslint-disable-next-line node/no-unsupported-features/es-syntax
      return import(pathToFileURL(fileToImport));
    }
    try {
      return require(fileToImport);
    } catch (error) {
      if (error.code !== 'ERR_REQUIRE_ESM') {
        throw error;
      }
      // eslint-disable-next-line node/no-unsupported-features/es-syntax
      return import(pathToFileURL(fileToImport));
    }
  }
};
