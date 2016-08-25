import Builder = require('./Builder');
import utils = require('./utils');
import parent = utils.parent;
import Biblio = require('./Biblio');

/*@internal*/
class Dfn extends Builder {
  build() {
    const parentClause = parent(this.node, ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX']) as HTMLElement | null;
    if (!parentClause) return;

    const entry: Biblio.TermBiblioEntry = {
      type: 'term',
      term: this.node.textContent!,
      refId: parentClause.id
    };

    if (this.node.hasAttribute('id')) {
      entry.id = this.node.id;
    }

    this.spec.biblio.add(entry, parentClause.getAttribute("namespace"));
  }
}

/*@internal*/
export = Dfn;