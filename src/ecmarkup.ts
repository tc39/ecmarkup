import Spec = require('./Spec');
import Biblio = require('./Biblio');
import BiblioEntry = Biblio.BiblioEntry;
import utils = require('./utils');

export { Spec, BiblioEntry };

export interface Options {
    status?: "proposal" | "draft" | "standard";
    version?: string;
    title?: string;
    shortname?: string;
    stage?: string | null;
    copyright?: boolean;
    date?: Date;
    location?: string;
    contributors?: string;
    toc?: boolean;
    oldToc?: boolean;
    verbose?: boolean;
}

export function build(path: string, fetch: (path: string) => PromiseLike<string>, opts?: Options): PromiseLike<Spec> {
  return fetch(path)
    .then(utils.htmlToDoc)
    .then(doc => {
      return new Spec(path, fetch, doc, opts).build();
    });
}
