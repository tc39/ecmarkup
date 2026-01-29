import type { OptionDefinition } from 'command-line-usage';
import * as commandLineArgs from 'command-line-args';

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

export function parse<T extends readonly OptionDefinition[]>(
  options: T,
  printHelp: () => void,
): ArgsFromOptions<T> {
  const def = options.find(o => o.defaultOption);
  if (!def?.multiple) {
    // this is just so I don't have to think about how to handle `--` in other cases
    // not an inherent limitation
    throw new Error('ecmarkup arg-parser requires a default option for now');
  }

  const argv = process.argv.slice(2);

  let notParsed: string[] = [];
  const dashDashIndex = argv.indexOf('--');
  if (dashDashIndex !== -1) {
    notParsed = argv.splice(dashDashIndex + 1);
    argv.pop();
  }

  let args: ArgsFromOptions<T>;
  try {
    // @ts-ignore the types are wrong about mutability
    args = commandLineArgs(options, { argv });
  } catch (e) {
    if (e != null && typeof e === 'object' && 'name' in e && e.name === 'UNKNOWN_OPTION') {
      fail(`Unknown option ${(e as unknown as { optionName: string }).optionName}`);
    }
    throw e;
  }

  // @ts-ignore it's fine
  args[def.name] = (args[def.name] || []).concat(notParsed);

  if (
    (args as unknown as { help?: boolean }).help ||
    (argv.length === 0 && notParsed.length === 0)
  ) {
    printHelp();
    process.exit(0);
  }

  return args;
}

// here follows some typescript shenanigans for inferring the type of of the parsed arguments from the argument specification

type Multiples<T> = T extends unknown
  ? Extract<T, { multiple: true } | { lazyMultiple: true }>
  : never;
type Defaulted<T> = T extends unknown ? Extract<T, { defaultValue: unknown }> : never;
type Optional<T> = T extends unknown ? Exclude<T, Multiples<T> | Defaulted<T>> : never;

type ReturnTypeOrNull<T> = T extends (...args: unknown[]) => unknown ? ReturnType<T> : null;
// prettier-ignore
type ArgTypeForKey<T extends readonly OptionDefinition[], key extends string> =
  ReturnTypeOrNull<Extract<T[number], { name: key; type?: unknown }>['type']>;

// spread is from https://stackoverflow.com/a/49683575
type OptionalPropertyNames<T> = {
  [K in keyof T]-?: {} extends { [P in K]: T[K] } ? K : never;
}[keyof T];

type SpreadProperties<L, R, K extends keyof L & keyof R> = {
  [P in K]: L[P] | Exclude<R[P], undefined>;
};

type Id<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;

type SpreadTwo<L, R> = Id<
  Pick<L, Exclude<keyof L, keyof R>> &
    Pick<R, Exclude<keyof R, OptionalPropertyNames<R>>> &
    Pick<R, Exclude<OptionalPropertyNames<R>, keyof L>> &
    SpreadProperties<L, R, OptionalPropertyNames<R> & keyof L>
>;

type Spread<A extends readonly unknown[]> = A extends [infer L, ...infer R]
  ? SpreadTwo<L, Spread<R>>
  : unknown;

// this type is wrong: if you specify the flag but omit the argument you get `null`, not the default value
// you should check those manually
type ArgsFromOptions<T extends readonly OptionDefinition[]> = Spread<
  [
    {
      [key in Multiples<T[number]>['name']]: ArgTypeForKey<T, key>[];
    },
    {
      [key in Defaulted<T[number]>['name']]: ArgTypeForKey<T, key>;
    },
    {
      [key in Optional<T[number]>['name']]?: ArgTypeForKey<T, key>;
    },
  ]
>;
