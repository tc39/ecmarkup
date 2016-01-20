'use strict';

module.exports = class Biblio extends Array {
  constructor () {
    super();
    this._byId = {};
    this._byType = {};
    this._byLocation = {};
    this._byProductionName = {};
    this._byAoid = {};
  }

  byId(id) {
    return this._byId[id];
  }

  byType(type) {
    return this._byType[type] || [];
  }

  byLocation(location) {
    return this._byLocation[location] || [];
  }

  byProductionName(name) {
    return this._byProductionName[name];
  }

  byAoid(aoid) {
    return this._byAoid[aoid];
  }

  push (item) {
    item.location = item.location || '';

    if (item.id) {
      this._byId[item.id] = item;
    }

    pushKey(this._byType, item.type, item);
    pushKey(this._byLocation, item.location, item);

    if (item.type === 'clause' && item.aoid) {
      const op = {
        type: 'op',
        aoid: item.aoid,
        refId: item.id,
        location: item.location
      }
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

  addExternalBiblio(biblio) {
    Object.keys(biblio).forEach(site => {
      biblio[site].forEach(entry => {
        entry.location = site;
        this.push(entry);
      })
    });
  }

  toJSON() {
    return this.byLocation('');
  }
}

function pushKey(arr, key, value) {
  if (arr[key] === undefined) {
    arr[key] = [];
  }

  arr[key].push(value)
}

function getKey(item) {
  switch(item.type) {
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
      throw new Error("Can't get key for " + item.type);
  }
}
