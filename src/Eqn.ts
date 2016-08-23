import Algorithm = require('./Algorithm');
import emd = require('ecmarkdown');
import utils = require('./utils');
import Spec = require('./Spec');
import Biblio = require('./Biblio');

/*@internal*/
class Eqn extends Algorithm {
  aoid: string | null;
  id: string | null;

  constructor(spec: Spec, node: HTMLElement) {
    super(spec, node);
    this.aoid = node.getAttribute('aoid');
    this.id = utils.getParentClauseId(node);

    if (this.aoid) {
      this.spec.biblio.add(<Biblio.AlgorithmBiblioEntry>{
        type: 'op',
        aoid: this.aoid,
        refId: this.id
      });
    }
  }

  build() {
    let contents = emd.document(this.node.innerHTML).slice(3, -4);

    if (utils.shouldInline(this.node)) {
      const classString = this.node.getAttribute('class');
      let classes: string[];

      if (classString) {
        classes = classString.split(' ');
      } else {
        classes = [];
      }

      if (classes.indexOf('inline') === -1) {
        this.node.setAttribute('class', classes.concat(['inline']).join(' '));
      }
    } else {
      contents = '<div>' + contents.split(/\r?\n/g)
                                   .filter(s => s.trim().length > 0)
                                   .join('</div><div>') + '</div>';
    }

    this.node.innerHTML = contents;

  }
}

/*@internal*/
export = Eqn;