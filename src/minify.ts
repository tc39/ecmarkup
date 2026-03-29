import { minify as htmlMinify } from 'html-minifier-terser';
import * as CleanCSS from 'clean-css';
import { optimize as svgoOptimize, type Config as SvgoConfig, type PluginConfig } from 'svgo';
import { minify as terserMinify } from 'terser';
import * as path from 'path';

type GeneratedFiles = Map<string | null, string | Buffer>;
type Log = (str: string) => void;

const htmlMinifierOptions = {
  caseSensitive: true,
  collapseBooleanAttributes: true,
  collapseWhitespace: true,
  decodeEntities: true,
  html5: true,
  minifyCSS: true,
  minifyJS: true,
  removeAttributeQuotes: true,
  removeComments: true,
  removeEmptyAttributes: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  sortAttributes: true,
  sortClassName: true,
  useShortDoctype: true,
};

const cleanCss = new CleanCSS({ level: 2 });

const svgoConfig: SvgoConfig = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: { overrides: { removeViewBox: false } },
    } as PluginConfig,
  ],
};

export async function minifyGeneratedFiles(
  files: GeneratedFiles,
  log?: Log,
): Promise<GeneratedFiles> {
  const result: GeneratedFiles = new Map();

  for (const [key, value] of files) {
    const ext = key != null ? path.extname(key) : null;

    if (ext === '.html' || key === null) {
      const html = typeof value === 'string' ? value : value.toString('utf-8');
      log?.(`Minifying ${key ?? 'stdout'}...`);
      const minified = await htmlMinify(html, htmlMinifierOptions);
      result.set(key, minified);
    } else if (ext === '.css') {
      const css = typeof value === 'string' ? value : value.toString('utf-8');
      log?.(`Minifying ${key}...`);
      const output = cleanCss.minify(css);
      result.set(key, output.styles);
    } else if (ext === '.svg') {
      const svg = typeof value === 'string' ? value : value.toString('utf-8');
      log?.(`Minifying ${key}...`);
      const optimized = svgoOptimize(svg, svgoConfig);
      result.set(key, optimized.data);
    } else if (ext === '.js') {
      const js = typeof value === 'string' ? value : value.toString('utf-8');
      log?.(`Minifying ${key}...`);
      const output = await terserMinify(js);
      result.set(key, output.code!);
    } else {
      result.set(key, value);
    }
  }

  return result;
}
