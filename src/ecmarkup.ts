import type { BiblioEntry, ExportedBiblio } from './Biblio';

import Spec from './Spec';
import * as utils from './utils';
import { CancellationToken } from 'prex';

export type { Spec, BiblioEntry };

export class Boilerplate {
  address?: string;
  copyright?: string;
  license?: string;
}

export type EcmarkupError = {
  ruleId: string;
  message: string;
  file?: string;
  source?: string;
  line?: number;
  column?: number;
  nodeType?: string;
};

export interface Options {
  status?: 'proposal' | 'draft' | 'standard';
  version?: string;
  title?: string;
  shortname?: string;
  description?: string;
  stage?: string | null;
  copyright?: boolean;
  date?: Date;
  location?: string;
  maxClauseDepth?: number;
  multipage?: boolean;
  extraBiblios?: ExportedBiblio[];
  contributors?: string;
  toc?: boolean;
  oldToc?: boolean;
  printable?: boolean;
  markEffects?: boolean;
  lintSpec?: boolean;
  cssOut?: never;
  jsOut?: never;
  assets?: 'none' | 'inline' | 'external';
  assetsDir?: string;
  outfile?: string;
  boilerplate?: Boilerplate;
  log?: (msg: string) => void;
  warn?: (err: EcmarkupError) => void;
  committee?: number;
}

export async function build(
  path: string,
  fetch: (path: string, token: CancellationToken) => PromiseLike<string>,
  opts?: Options,
  token = CancellationToken.none,
): Promise<Spec> {
  const html = await fetch(path, token);
  const dom = utils.htmlToDom(html);
  const spec = new Spec(path, fetch, dom, opts ?? {}, /*sourceText*/ html, token);
  await spec.build();
  return spec;
}
