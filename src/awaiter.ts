import Promise = require("bluebird");

export = function (thisArg: any, _arguments: any, P: PromiseConstructorLike, generator: any) {
    return new (P || (P = Promise))<any>(function (resolve, reject) {
        function fulfilled(value: any) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value: any) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result: any) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};