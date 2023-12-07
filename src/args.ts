export const options = [
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Display this help message',
  },
  {
    name: 'watch',
    alias: 'w',
    type: Boolean,
    description: 'Rebuild when files change',
  },
  {
    name: 'load-biblio',
    type: String,
    lazyMultiple: true,
    typeLabel: '{underline path}',
    description:
      'An external biblio.json to load; either a path prefixed with "." or "./", or a package name of an installed package that exports a biblio',
  },
  {
    name: 'write-biblio',
    type: String,
    typeLabel: '{underline file}',
    description: 'Path to where the biblio.json should be written',
  },
  {
    name: 'assets',
    type: String,
    typeLabel: 'none|inline|external',
    description:
      'Omit assets, inline them, or add them as external. Default: inline, unless --multipage or --assets-dir are specified, in which case external.',
  },
  {
    name: 'assets-dir',
    type: String,
    typeLabel: '{underline dir}',
    description:
      'The directory in which to place generated assets when using --assets=external. Implies --assets=external. Defaults to [outfile]/assets.',
  },
  {
    name: 'no-toc',
    type: Boolean,
    description: "Don't include the table of contents",
  },
  {
    name: 'old-toc',
    type: Boolean,
    description: 'Use the old table of contents styling',
  },
  {
    name: 'mark-effects',
    type: Boolean,
    description: 'Render markers for effects like "user code" [UC]',
  },
  {
    name: 'lint-spec',
    type: Boolean,
    description: 'Enforce some style and correctness checks',
  },
  {
    name: 'error-formatter',
    type: String,
    typeLabel: '{underline formatter}',
    defaultValue: 'eslint-formatter-codeframe',
    description:
      'The formatter for warnings and errors; either a path prefixed with "." or "./", or package name, of an installed eslint compatible formatter (default: eslint-formatter-codeframe)',
  },
  {
    name: 'multipage',
    type: Boolean,
    description: 'Generate a multipage version of the spec. Implies --assets=external.',
  },
  {
    name: 'strict',
    type: Boolean,
    description: 'Exit with an error if there are warnings. Cannot be used with --watch.',
  },
  {
    name: 'verbose',
    type: Boolean,
    description: 'Display document build progress',
  },
  {
    name: 'version',
    alias: 'v',
    type: Boolean,
    description: 'Display version info',
  },
  {
    name: 'files',
    type: String,
    multiple: true,
    defaultOption: true,
  },

  // removed; still defined here so we can give better errors
  {
    name: 'css-out',
    type: String,
  },
  {
    name: 'js-out',
    type: String,
  },
] as const;
