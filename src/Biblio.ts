import type Production from './Production';

type Entries = {
  op?: AlgorithmBiblioEntry[];
  production?: ProductionBiblioEntry[];
  clause?: ClauseBiblioEntry[];
  term?: TermBiblioEntry[];
  table?: FigureBiblioEntry[];
  figure?: FigureBiblioEntry[];
  example?: FigureBiblioEntry[];
  note?: FigureBiblioEntry[];
  step?: StepBiblioEntry[];
};

class EnvRec extends Array<BiblioEntry> {
  _parent: EnvRec | undefined;
  _namespace: string;
  _children: EnvRec[];
  _byType: Entries;
  _byLocation: { [key: string]: BiblioEntry[] };
  _byProductionName: { [key: string]: ProductionBiblioEntry };
  _byAoid: { [key: string]: AlgorithmBiblioEntry };

  constructor(parent: EnvRec | undefined, namespace: string) {
    super();

    this._parent = parent;
    this._children = [];
    if (this._parent) {
      this._parent._children.push(this);
    }

    this._namespace = namespace;
    this._byType = {};
    this._byLocation = {};
    this._byProductionName = {};
    this._byAoid = {};
  }

  // this mutates each item to fill in missing properties
  push(...items: BiblioEntry[]) {
    for (const item of items) {
      pushKey(this._byType, item.type, item);
      pushKey(this._byLocation, item.location, item);

      if (item.type === 'clause' && item.aoid) {
        const op: BiblioEntry = {
          type: 'op',
          aoid: item.aoid,
          refId: item.id,
          location: item.location,
          referencingIds: [],
        };
        this.push(op);
      }

      if (item.type === 'op') {
        this._byAoid[item.aoid] = item;
      }

      if (item.type === 'production') {
        this._byProductionName[item.name] = item;
      }
    }

    return super.push(...items);
  }
}

// Map, etc. returns array.
Object.defineProperty(EnvRec, Symbol.species, { value: Array });

/*@internal*/
export default class Biblio {
  private _byId: { [id: string]: BiblioEntry };
  private _location: string;
  private _root: EnvRec;
  private _nsToEnvRec: { [namespace: string]: EnvRec | undefined };

  constructor(location: string) {
    this._byId = {};
    this._location = location;
    this._root = new EnvRec(undefined, 'global');
    this._nsToEnvRec = { global: this._root };

    this.createNamespace(location, 'global');
  }

  byId(id: string) {
    return this._byId[id];
  }

  byNamespace(ns: string): EnvRec {
    const env = this._nsToEnvRec[ns];
    if (!env) {
      throw new Error('Namespace ' + ns + ' not found');
    }

    return env;
  }

  byProductionName(name: string, ns?: string) {
    ns = ns || this._location;
    return this.lookup(ns, env => env._byProductionName[name]);
  }

  byAoid(aoid: string, ns?: string) {
    ns = ns || this._location;
    return this.lookup(ns, env => env._byAoid[aoid]);
  }

  getDefinedWords(ns: string): Record<string, AlgorithmBiblioEntry | TermBiblioEntry> {
    const result = Object.create(null);

    for (const type of ['term', 'op'] as ('term' | 'op')[]) {
      // note that the `seen` set is not shared across types
      // this is dumb but is the current semantics: ops always clobber terms
      const seen = new Set<string>();
      let current = this._nsToEnvRec[ns];
      while (current) {
        const entries = current._byType[type] || [];
        for (const entry of entries) {
          let keys;
          if (type === 'term') {
            if (entry.term === 'type') {
              // this is a dumb kludge necessitated by ecma262 dfn'ing both "type" and "Type"
              // the latter originally masked the former, so that it didn't actually end up linking all usages of the word "type"
              // we've changed the logic a bit so that masking no longer happens, and consequently the autolinker adds a bunch of spurious links
              // this can be removed once ecma262 no longer dfn's it and we update ecma262-biblio.json
              continue;
            }

            keys = [
              (entry as TermBiblioEntry).term,
              ...((entry as TermBiblioEntry).variants || []),
            ].flatMap(v => {
              const key = v.replace(/\s+/g, ' ');
              if (/^[a-z]/.test(key)) {
                // include capitalized variant of words starting with lowercase letter
                return [key, key[0].toUpperCase() + key.slice(1)];
              }
              return key;
            });
          } else {
            keys = [(entry as AlgorithmBiblioEntry).aoid];
          }

          for (const key of keys) {
            if (!seen.has(key)) {
              seen.add(key);
              result[key] = entry;
            }
          }
        }
        current = current._parent;
      }
    }

    return result;
  }

  private lookup<T>(ns: string, cb: (env: EnvRec) => T) {
    let env = this._nsToEnvRec[ns];
    if (!env) {
      throw new Error('Namespace ' + ns + ' not found');
    }

    while (env) {
      const result = cb(env);
      if (result) {
        return result;
      }
      env = env._parent;
    }

    return undefined;
  }

  add(entry: PartialBiblioEntry, ns?: string | null) {
    ns = ns || this._location;
    const env = this._nsToEnvRec[ns];
    entry.namespace = ns;

    // @ts-ignore
    entry.location = entry.location || '';
    // @ts-ignore
    entry.referencingIds = entry.referencingIds || [];

    env!.push(entry as BiblioEntry);
    if (entry.id) {
      if ({}.hasOwnProperty.call(this, entry.id)) {
        throw new Error('Duplicate biblio entry ' + JSON.stringify(entry.id) + '.');
      }
      this._byId[entry.id] = entry as BiblioEntry;
    }
  }

  createNamespace(ns: string, parent: string) {
    const existingNs = this._nsToEnvRec[ns];
    if (existingNs) {
      if (existingNs._parent!._namespace === parent) {
        return;
      } else {
        throw new Error('Namespace ' + ns + ' already in use.');
      }
    }
    if (!parent) {
      throw new Error('Cannot create namespace without parent');
    }

    const parentEnv = this._nsToEnvRec[parent];

    if (!parentEnv) {
      throw new Error('Cannot find namespace with name ' + parent);
    }

    if (!ns) {
      throw new Error('Cannot create namespace without a name');
    }

    const env = new EnvRec(parentEnv, ns);
    this._nsToEnvRec[ns] = env;
  }

  addExternalBiblio(biblio: BiblioData) {
    Object.keys(biblio).forEach(site => {
      biblio[site].forEach(entry => {
        entry.location = site;
        this.add(entry, 'global');
      });
    });
  }

  toJSON() {
    let root: BiblioEntry[] = [];

    function addEnv(env: EnvRec) {
      root = root.concat(env);
      env._children.forEach(addEnv);
    }
    addEnv(this.byNamespace(this._location));
    return root;
  }

  dump() {
    dumpEnv(this._root);
  }
}

export interface BiblioData {
  [namespace: string]: BiblioEntry[];
}

export interface BiblioEntryBase {
  type: string;
  location: string;
  namespace?: string;
  id?: string;
  aoid?: string | null;
  refId?: string;
  clauseId?: string;
  name?: string;
  title?: string;
  number?: string | number;
  caption?: string;
  term?: string;
  referencingIds: string[];
}

export interface AlgorithmBiblioEntry extends BiblioEntryBase {
  type: 'op';
  aoid: string;
  refId?: string;
}

export interface ProductionBiblioEntry extends BiblioEntryBase {
  type: 'production';
  id?: string;
  name: string;
  /*@internal*/ _instance?: Production;
}

export interface ClauseBiblioEntry extends BiblioEntryBase {
  type: 'clause';
  id: string;
  aoid: string | null;
  title: string;
  titleHTML: string;
  number: string | number;
}

export interface TermBiblioEntry extends BiblioEntryBase {
  type: 'term';
  term: string;
  refId: string;
  variants?: string[];
  id?: string;
}

export interface FigureBiblioEntry extends BiblioEntryBase {
  type: 'table' | 'figure' | 'example' | 'note';
  id: string;
  node: HTMLElement;
  number: string | number;
  clauseId?: string;
  caption?: string;
}

export interface StepBiblioEntry extends BiblioEntryBase {
  type: 'step';
  id: string;
  stepNumbers: number[];
}

export type BiblioEntry =
  | AlgorithmBiblioEntry
  | ProductionBiblioEntry
  | ClauseBiblioEntry
  | TermBiblioEntry
  | FigureBiblioEntry
  | StepBiblioEntry;

// the generic is necessary for this trick to work
// see https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
type Unkey<T> = T extends any ? Omit<T, 'key' | 'keys' | 'location' | 'referencingIds'> : never;

export type PartialBiblioEntry = Unkey<BiblioEntry>;

function dumpEnv(env: EnvRec) {
  console.log('## ' + env._namespace);
  console.log(env.map(entry => JSON.stringify(entry)).join(', '));

  env._children.forEach(child => {
    dumpEnv(child);
  });
}

function pushKey(arr: { [key: string]: BiblioEntry[] }, key: string, value: BiblioEntry) {
  if (arr[key] === undefined) {
    arr[key] = [];
  }

  arr[key].push(value);
}
