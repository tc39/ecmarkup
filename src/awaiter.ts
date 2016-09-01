import Promise = require("bluebird");
export = function (thisArg: any, _arguments: any, P: PromiseConstructorLike, generator: any) {
  return (<any>Promise).coroutine(generator, { yieldHandler: Promise.cast }).apply(thisArg, _arguments);
};