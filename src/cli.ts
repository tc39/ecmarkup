const args = require('./args').parse();

// requires after arg checking to avoid expensive load times
import ecmarkup = require('./ecmarkup');
import Spec = require('./Spec');
import path = require('path');
import fs = require('fs');
import utils = require('./utils');
import debounce = require('promise-debounce');

const jsDependencies = ['menu.js', 'findLocalReferences.js'];

function readFile(file: string) {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(file, "utf8", (err, data) => err ? reject(err) : resolve(data));
  });
}

function writeFile(file: string, content: string) {
  return new Promise<void>((resolve, reject) => {
    fs.writeFile(file, content, "utf8", err => err ? reject(err) : resolve());
  });
}

async function copyFile(src: string, dest: string) {
  const content = await readFile(src);
  await writeFile(dest, content);
}

async function concatJs() {
  const dependencies = await Promise.all(jsDependencies
    .map(dependency => readFile(path.join(__dirname, "../js/" + dependency))));
  return dependencies.reduce((js, dependency) => js + dependency, '');
}

const watching = new Map<string, fs.FSWatcher>();
const build = debounce(async function build() {
  try {
    const spec = await ecmarkup.build(args.infile, readFile, args);

    const pending: Promise<any>[] = [];
    if (args.biblio) {
      if (args.verbose) {
        utils.logVerbose('Writing biblio file to ' + args.biblio);
      }
      pending.push(writeFile(args.biblio, JSON.stringify(spec.exportBiblio())));
    }

    if (args.outfile) {
      if (args.verbose) {
        utils.logVerbose('Writing output to ' + args.outfile);
      }
      pending.push(writeFile(args.outfile, spec.toHTML()));
    } else {
      process.stdout.write(spec.toHTML());
    }

    if (args.css) {
      if (args.verbose) {
        utils.logVerbose('Writing css file to ' + args.css);
      }
      pending.push(copyFile(path.join(__dirname, '../css/elements.css'), args.css));
    }

    if (args.js) {
      if (args.verbose) {
        utils.logVerbose('Writing js file to ' + args.js);
      }
      pending.push(writeFile(args.js, await concatJs()));
    }

    await Promise.all(pending);

    if (args.watch) {
      const toWatch = new Set<string>(spec.imports.concat(args.infile));

      // remove any files that we're no longer watching
      for (const [file, watcher] of watching) {
        if (!toWatch.has(file)) {
          watcher.close();
          watching.delete(file);
        }
      }

      // watch any new files
      for (const file of toWatch) {
        if (!watching.has(file)) {
          watching.set(file, fs.watch(file, build));
        }
      }
    }
  } catch (e) {
    process.stderr.write(e.stack);
  }
});

build();