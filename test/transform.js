'use strict';
/* eslint-disable max-nested-callbacks, eslint-comments/disable-enable-pair */

const assert = require('assert');
const through = require('through2');
const {pipeline} = require('stream');
const {
  fileIsModified,
  createEachFileTransform,
  createYoRcTransform,
  createConflicterStatusTransform
} = require('../lib/util/transform');
const sinon = require('sinon');

const passthroughFunction = function (file, _, cb) {
  this.push(file);
  cb();
};

describe('Transform stream', () => {
  let unmodifiedFile;
  let newFile;
  let modifiedFile;
  let newDeletedFile;
  let yoRcFile;
  let yoRcGlobalFile;
  let conflicterSkippedFile;

  let stream;
  let files;
  const unmodifiedFilesCount = 2;

  let sinonTransformPre;
  let sinonTransformPost;

  beforeEach(() => {
    unmodifiedFile = {path: 'unmodifiedFile'};
    newFile = {state: 'modified', isNew: true, path: 'newFile'};
    modifiedFile = {state: 'modified', path: 'modifiedFile'};
    newDeletedFile = {state: 'deleted', isNew: true, path: 'newDeletedFile'};
    yoRcFile = {state: 'modified', path: '.yo-rc.json'};
    yoRcGlobalFile = {state: 'modified', path: '.yo-rc-global.json'};
    conflicterSkippedFile = {state: 'modified', path: 'conflicterSkippedFile', conflicter: 'skip'};

    files = [
      unmodifiedFile,
      newFile,
      modifiedFile,
      newDeletedFile,
      yoRcFile,
      yoRcGlobalFile,
      conflicterSkippedFile
    ];

    sinonTransformPre = sinon.stub().callsFake(passthroughFunction);
    sinonTransformPost = sinon.stub().callsFake(passthroughFunction);

    stream = through.obj();
    files.forEach(file => stream.write(file));
    stream.end();
  });

  describe('fileIsModified()', () => {
    it('should return false for unmodified file', () => {
      assert.equal(fileIsModified(unmodifiedFile), false);
    });

    it('should return true for modified file', () => {
      assert.equal(fileIsModified(modifiedFile), true);
    });

    it('should return true for new file', () => {
      assert.equal(fileIsModified(newFile), true);
    });

    it('should return false for new file that have been deleted', () => {
      assert.equal(fileIsModified(newFile), true);
    });
  });

  describe('createEachFileTransform()', () => {
    let sinonTransform;

    describe('sync functions', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform);
        pipeline(stream, through.obj(sinonTransformPre), transform, through.obj(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every modified file and forward them through', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length - unmodifiedFilesCount);
        assert.equal(sinonTransformPost.callCount, files.length);
      });
    });

    describe('executeUnmodified option', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform, {executeUnmodified: true});
        pipeline(stream, through.obj(sinonTransformPre), transform, through.obj(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every file and forward every file', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length);
        assert.equal(sinonTransformPost.callCount, files.length);
      });
    });

    describe('false forwardUmodified option', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform, {forwardUmodified: false});
        pipeline(stream, through.obj(sinonTransformPre), transform, through.obj(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every modified file and forward modified files', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length - unmodifiedFilesCount);
        assert.equal(sinonTransformPost.callCount, files.length - unmodifiedFilesCount);
      });
    });

    describe('executeUnmodified and false forwardUmodified options', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform, {passUmodified: true, executeUnmodified: true});
        pipeline(stream, through.obj(sinonTransformPre), transform, through.obj(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every modified file and forward every file', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length);
        assert.equal(sinonTransformPost.callCount, files.length);
      });
    });

    describe('false autoForward option', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform, {autoForward: false});
        pipeline(stream, through.obj(sinonTransformPre), transform, through.obj(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every modified file and forward every file', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length - unmodifiedFilesCount);
        assert.equal(sinonTransformPost.callCount, 0);
      });
    });

    describe('false autoForward and executeUnmodified option', () => {
      beforeEach(done => {
        sinonTransform = sinon.stub();

        const transform = createEachFileTransform(sinonTransform, {autoForward: false, executeUnmodified: true});
        pipeline(stream, through.obj(sinonTransformPre), transform, through.obj(sinonTransformPost), error => {
          done(error);
        });
      });

      it('should call the function for every modified file and forward every file', () => {
        assert.equal(sinonTransformPre.callCount, files.length);
        assert.equal(sinonTransform.callCount, files.length);
        assert.equal(sinonTransformPost.callCount, 0);
      });
    });
  });

  describe('createYoRcTransform()', () => {
    beforeEach(done => {
      [yoRcFile, yoRcGlobalFile].forEach(file => {
        assert.equal(file.conflicter, undefined);
      });
      pipeline(stream, through.obj(sinonTransformPre), createYoRcTransform(), through.obj(sinonTransformPost), error => {
        done(error);
      });
    });

    it('should call the function for every modified file and forward them through', () => {
      assert.equal(sinonTransformPre.callCount, files.length);
      assert.equal(sinonTransformPost.callCount, files.length);
      files.forEach(file => {
        if ([yoRcFile, yoRcGlobalFile].includes(file)) {
          assert.equal(file.conflicter, 'force');
        }
      });
    });
  });

  describe('createConflicterStatusTransform()', () => {
    let adapter;
    beforeEach(done => {
      adapter = {skip: sinon.fake()};
      pipeline(stream, through.obj(sinonTransformPre), createConflicterStatusTransform(adapter), through.obj(sinonTransformPost), error => {
        done(error);
      });
    });

    it('should forward modified and not skipped files', () => {
      assert.equal(sinonTransformPre.callCount, files.length);
      assert.equal(sinonTransformPost.callCount, files.length - unmodifiedFilesCount - 1);
      files.forEach(file => {
        assert.equal(file.conflicter, undefined);
        assert.equal(file.binary, undefined);
        assert.equal(file.conflicterChanges, undefined);
        assert.equal(file.conflicterLog, undefined);
      });
    });
  });
});
