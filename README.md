This is an in-development branch for https://github.com/tc39/ecma262/pull/545.

It can be used by running `npm i --save tc39/ecmarkup#structured-header` in the ecma262 directory.

Don't worry about build warnings for now; I haven't yet taught the linter about the new syntax.

## Format

This expects abstract operations to be of the form

```
<emu-clause id="some-id" type="abstract operation">
  <h1>
    AbstractOp (
      _x_ : a Foo,
      optional _y_ : unknown,
    )
  </h1>
  <dl class='header'>
    <dt>description</dt>
    <dd>It is an example.</dd>
  </dl>
  <emu-alg>
    1. Step.
  </emu-alg>
</emu-clause>
```

It also supports

- `type="numeric method"`, treated exactly like `"abstract operation"`,
- `type="host-defined abstract operation"`, ditto except for the generated prose,
- `type="internal method"`, which expects a `for` `<dt>`
- `type="concrete method"`, ditto.


Notable differences from the format in 545:

- No support for built-in functions
- No support for the out-of-band headers for SDOs that 545 uses (or SDOs at all, for the moment)
- `op kind` is replaced by `type=` in the clause (actually it will still parse `op kind`, but the intent is to use `type`)
- `name` is inferred from the `h1`
- Numeric methods do not use `for` (it is trivial to infer from the name)
- There is a syntax for typed parameter lists, instead of a `parameters` `<dt>`. The syntax is parsed if and only if the `h1` is multiline as above. Note that there is a special `"unknown"` type, for places that type information is not yet specified.
- No support for `returns` or `has access to`: these are silently dropped, but I expect they and all other unknown keys will be an error in the ultimate version.
