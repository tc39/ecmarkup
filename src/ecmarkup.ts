import Spec from './Spec';
import Biblio = require('./Biblio');
import BiblioEntry = Biblio.BiblioEntry;
import utils = require('./utils');
import { CancellationToken } from 'prex';
var __awaiter = require('./awaiter');

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

export async function build(path: string, fetch: (path: string, token: CancellationToken) => PromiseLike<string>, opts?: Options, token = CancellationToken.none): Promise<Spec> {
  const html = await fetch(path, token);
  const doc = utils.htmlToDoc(html);
  const spec = new Spec(path, fetch, doc, opts, /*sourceText*/ html, token);
  await spec.build();
  return spec;
}
