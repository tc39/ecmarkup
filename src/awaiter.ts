import Promise = require("bluebird");
export = function (thisArg: any, _arguments: any, P: PromiseConstructorLike, generator: any) {
  return (<any>Promise).coroutine(generator, {
    yieldHandler(value: any) { return Promise.cast(value); }
  }).apply(thisArg, _arguments);
};