'use strict';

class EnvRec extends Array {
  constructor (parent, namespace) {
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

  push (item) {
    item.location = item.location || '';

    pushKey(this._byType, item.type, item);
    pushKey(this._byLocation, item.location, item);

    if (item.type === 'clause' && item.aoid) {
      const op = {
        type: 'op',
        aoid: item.aoid,
        refId: item.id,
        location: item.location
      };
      this.push(op);
    }

    if (item.type === 'op') {
      this._byAoid[item.aoid] = item;
    }

    if (item.type === 'production') {
      this._byProductionName[item.name] = item;
    }

    if (!item.key) {
      item.key = getKey(item);
    }

    super.push(item);
  }

}

module.exports = class Biblio {
  constructor(location) {
    this._byId = {};
    this._location = location;
    this._root = new EnvRec(null, 'global');
    this._nsToEnvRec = {'global': this._root};

    this.createNamespace(location, 'global');
  }

  byId(id) {
    return this._byId[id];
  }

  byNamespace(ns) {
    const env = this._nsToEnvRec[ns];
    if (!env) {
      throw new Error('Namespace ' + ns + ' not found');
    }

    return env;
  }

  byProductionName(name, ns) {
    ns = ns || this._location;
    return this.lookup(ns, env => env._byProductionName[name]);
  }

  byAoid(aoid, ns) {
    ns = ns || this._location;
    return this.lookup(ns, env => env._byAoid[aoid]);
  }

  inScopeByType(ns, type) {
    let seen = new Set();
    let results = [];
    let current = this._nsToEnvRec[ns];
    while (current) {
      (current._byType[type] || []).forEach(entry => {
        if (!seen.has(entry.key)) {
          seen.add(entry.key);
          results.push(entry);
        }
      });
      current = current._parent;
    }

    return results;
  }

  lookup(ns, cb) {
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

  add(entry, ns) {
    ns = ns || this._location;
    const env = this._nsToEnvRec[ns];
    entry.namespace = ns;
    env.push(entry);
    if (entry.id) {
      this._byId[entry.id] = entry;
    }
  }

  createNamespace(ns, parent) {
    const existingNs = this._nsToEnvRec[ns];
    if (existingNs) {
      if (existingNs._parent._namespace === parent) {
        return existingNs;
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

    let env = new EnvRec(parentEnv, ns);
    this._nsToEnvRec[ns] = env;
  }

  addExternalBiblio(biblio) {
    Object.keys(biblio).forEach(site => {
      biblio[site].forEach(entry => {
        entry.location = site;
        this.add(entry, 'global');
      });
    });
  }

  toJSON() {
    return this.byNamespace(this._location);
  }

  dump() {
    dumpEnv(this._root);
  }
};

function dumpEnv(env) {
  console.log('## ' + env._namespace);
  console.log(env.map(function(entry) {
    return JSON.stringify(entry);
  }).join(', '));

  env._children.forEach(function(child) {
    dumpEnv(child);
  });
}
function pushKey(arr, key, value) {
  if (arr[key] === undefined) {
    arr[key] = [];
  }

  arr[key].push(value);
}

function getKey(item) {
  switch (item.type) {
  case 'clause': return item.title;
  case 'production': return item.name;
  case 'op': return item.aoid;
  case 'term': return item.term;
  case 'table':
  case 'figure':
  case 'example':
  case 'note':
    return item.caption;
  default:
    throw new Error('Can\'t get key for ' + item.type);
  }
}
