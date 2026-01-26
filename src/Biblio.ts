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

class EnvRec {
  entries: Array<BiblioEntry>;
  _parent: EnvRec | undefined;
  _namespace: string;
  _children: EnvRec[];
  _byType: Entries;
  _byLocation: { [key: string]: BiblioEntry[] };
  _byProductionName: { [key: string]: ProductionBiblioEntry };
  _byAoid: { [key: string]: AlgorithmBiblioEntry };
  _byAbstractMethodAoid: { [key: string]: ConcreteMethodBiblioEntry[] };
  _keys: Set<String>;

  constructor(parent: EnvRec | undefined, namespace: string) {
    this.entries = [];
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
    this._byAbstractMethodAoid = {};
    this._keys = new Set();
  }

  // this mutates each item to fill in missing properties
  push(...items: BiblioEntry[]) {
    for (const item of items) {
      pushKey(this._byType, item.type, item);
      pushKey(this._byLocation, item.location, item);

      if (item.type === 'op') {
        this._byAoid[item.aoid] = item;
        this._keys.add(item.aoid);
      }

      if (item.type === 'concrete method') {
        this._byAbstractMethodAoid[item.abstractAoid] ??= [];
        this._byAbstractMethodAoid[item.abstractAoid].push(item);
      }

      if (item.type === 'production') {
        this._byProductionName[item.name] = item;
      }

      if (item.type === 'term') {
        for (const key of getKeys(item)) {
          this._keys.add(key);
        }
      }
    }

    return this.entries.push(...items);
  }
}

export default class Biblio {
  private _byId: { [id: string]: BiblioEntry };
  private _location: string;
  private _root: EnvRec;
  private _nsToEnvRec: { [namespace: string]: EnvRec | undefined };

  constructor(location: string) {
    this._byId = {};
    this._location = location;
    // the root namespace holds names defined in external biblios
    this._root = new EnvRec(undefined, 'external');
    this._nsToEnvRec = {
      // @ts-ignore https://github.com/microsoft/TypeScript/issues/38385
      __proto__: null,
      external: this._root,
    };

    this.createNamespace(location, 'external');
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

  byAbstractMethodAoid(aoid: string, ns?: string) {
    ns = ns || this._location;
    return this.lookup(ns, env => env._byAbstractMethodAoid[aoid]);
  }

  getOpNames(ns: string): Set<string> {
    const out = new Set<string>();
    let current = this._nsToEnvRec[ns];
    while (current) {
      const entries = current._byType['op'] || [];
      for (const entry of entries) {
        out.add(entry.aoid);
      }
      current = current._parent;
    }
    return out;
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
            if ((entry as TermBiblioEntry).term === 'type') {
              // this is a dumb kludge necessitated by ecma262 dfn'ing both "type" and "Type"
              // the latter originally masked the former, so that it didn't actually end up linking all usages of the word "type"
              // we've changed the logic a bit so that masking no longer happens, and consequently the autolinker adds a bunch of spurious links
              // this can be removed once ecma262 no longer dfn's it and we update ecma262-biblio.json
              continue;
            }

            keys = getKeys(entry as TermBiblioEntry).flatMap(key => {
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

  /** @internal*/
  add(entry: PartialBiblioEntry & { location?: string }, ns?: string | null) {
    ns = ns || this._location;
    const env = this._nsToEnvRec[ns]!;
    // @ts-ignore
    entry.namespace = ns;
    // @ts-ignore
    entry.location = entry.location || '';
    // @ts-ignore
    entry.referencingIds = entry.referencingIds || [];

    if (entry.id) {
      // no reason to have both
      delete entry.refId;
    }

    env.push(entry as BiblioEntry);
    if (entry.id) {
      if ({}.hasOwnProperty.call(this, entry.id)) {
        throw new Error('Duplicate biblio entry ' + JSON.stringify(entry.id) + '.');
      }
      this._byId[entry.id] = entry as BiblioEntry;
    }
  }

  /** @internal*/
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

  keysForNamespace(ns: string) {
    return this._nsToEnvRec[ns]!._keys;
  }

  // returns the entries from the local namespace
  localEntries() {
    let root: BiblioEntry[] = [];

    function addEnv(env: EnvRec) {
      root = root.concat(env.entries);
      env._children.forEach(addEnv);
    }
    addEnv(this.byNamespace(this._location));
    return root;
  }

  /** @internal*/
  addExternalBiblio(biblio: ExportedBiblio) {
    for (const item of biblio.entries) {
      this.add({ location: biblio.location, ...item }, 'external');
    }
  }

  export(): ExportedBiblio {
    return {
      location: this._location,
      entries: this.byNamespace(this._location).entries.map(e => {
        const copy: PartialBiblioEntry = { ...e };
        // @ts-ignore
        delete copy.namespace;
        // @ts-ignore
        delete copy.location;
        // @ts-ignore
        delete copy.referencingIds;
        for (const key of Object.keys(copy)) {
          // @ts-ignore
          if (key.startsWith('_')) delete copy[key];
        }
        return copy;
      }),
    };
  }

  dump() {
    dumpEnv(this._root);
  }
}

export interface BiblioEntryBase {
  type: string;
  location: string;
  namespace?: string;
  id?: string;
  refId?: string; // the ID of a containing element; only used as a fallback when `id` is not present
  aoid?: string | null;
  referencingIds: string[];
}

export type Type =
  | {
      kind: 'opaque';
      type: string;
    }
  | {
      kind: 'unused';
    }
  | {
      kind: 'completion';
      completionType: 'abrupt';
    }
  | {
      kind: 'completion';
      typeOfValueIfNormal: Type | null;
      completionType: 'normal' | 'mixed';
    }
  | {
      kind: 'list';
      elements: Type | null;
    }
  | {
      kind: 'union';
      types: Exclude<Type, { kind: 'union' }>[];
    }
  | {
      kind: 'record';
      fields: Record<string, Type | null>;
    };
export type Parameter = {
  name: string;
  type: null | Type;
};
export type Signature = {
  parameters: Parameter[];
  optionalParameters: Parameter[];
  return: null | Type;
};
export type AlgorithmType =
  | 'abstract operation'
  | 'abstract method'
  | 'host-defined abstract operation'
  | 'implementation-defined abstract operation'
  | 'syntax-directed operation'
  | 'numeric method';
export interface AlgorithmBiblioEntry extends BiblioEntryBase {
  type: 'op';
  aoid: string;
  kind?: AlgorithmType;
  signature: null | Signature;
  effects: string[];
  skipGlobalChecks?: boolean;
  /** @internal*/ _skipReturnChecks?: boolean;
  /** @internal*/ _node?: Element;
}

export interface ConcreteMethodBiblioEntry extends BiblioEntryBase {
  type: 'concrete method';
  abstractAoid: string;
  for: string;
}

export interface ProductionBiblioEntry extends BiblioEntryBase {
  type: 'production';
  name: string;
  /** @internal*/ _instance?: Production;
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
  variants?: string[];
}

export interface FigureBiblioEntry extends BiblioEntryBase {
  type: 'table' | 'figure' | 'example' | 'note';
  id: string;
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
  | ConcreteMethodBiblioEntry
  | ProductionBiblioEntry
  | ClauseBiblioEntry
  | TermBiblioEntry
  | FigureBiblioEntry
  | StepBiblioEntry;

// see https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
type Unkey<T, S extends string> = T extends any ? Omit<T, S> : never;

type NonExportedKeys = 'location' | 'referencingIds' | 'namespace';
export type PartialBiblioEntry = Unkey<BiblioEntry, NonExportedKeys>;

export type ExportedBiblio = {
  location: string;
  entries: Unkey<PartialBiblioEntry, `_${string}`>[];
};

function dumpEnv(env: EnvRec) {
  console.log('## ' + env._namespace);
  console.log(env.entries.map(entry => JSON.stringify(entry)).join(', '));

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

export function getKeys(entry: TermBiblioEntry): string[] {
  return [entry.term, ...(entry.variants || [])].map(v => v.replace(/\s+/g, ' '));
}
