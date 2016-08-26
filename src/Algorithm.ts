import Builder = require('./Builder');
import emd = require('ecmarkdown');

/*@internal*/
class Algorithm extends Builder {
  build() {
    const contents = this.node.innerHTML;
    const html = emd.document(contents);
    this.node.innerHTML = html;
  }
}

/*@internal*/
export = Algorithm;