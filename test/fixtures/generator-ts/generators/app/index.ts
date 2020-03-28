const Generator = require("yeoman-generator");

class DummyTsGenerator extends Generator {
  constructor(args, opts){
    super(args, opts);
  }

  exec() {
	    this.env.done = true;
  }
}

module.exports = DummyTsGenerator;
