import Promise = require('bluebird');

/**
 * Patch for TypeScript's __awaiter helper. While generally unsupported, it is acceptable to
 * use custom helpers to override TypeScript runtime behavior in a compatible fashion.
 *
 * https://github.com/Microsoft/TypeScript/issues/6737#issuecomment-177007790
 * 
 * We use a custom __awaiter for performance reasons - bluebird is still faster than native promises.
 */
export = function (thisArg: any, _arguments: any, P: PromiseConstructorLike, generator: any) {
  return (<any>Promise).coroutine(generator, { yieldHandler: Promise.cast }).apply(thisArg, _arguments);
};