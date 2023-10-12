const Generator = require("yeoman-generator-5");

class DummyTsGenerator extends Generator {
  constructor(args, opts){
    super(args, opts);
  }

  exec() {
	    this.env.done = true;
  }
}

module.exports = DummyTsGenerator;
