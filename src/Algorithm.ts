import Builder = require('./Builder');
import emd = require('ecmarkdown');

/*@internal*/
class Algorithm extends Builder {
  build() {
    const contents = this.node.innerHTML;
    let html = emd.document(contents);
    this.node.innerHTML = html;
  }
}

/*@internal*/
export = Algorithm;