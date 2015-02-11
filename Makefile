.PHONY: tests
tests:
	node_modules/.bin/istanbul cover node_modules/.bin/_mocha -- -R spec
	node_modules/.bin/istanbul report lcovonly
	cat coverage/lcov.info | node_modules/.bin/coveralls
	rm -rf coverage
