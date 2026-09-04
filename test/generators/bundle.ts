/**
 * Bundles every yeoman-generator major used by the backward compatibility tests into
 * `bundles/yeoman-generator-<major>`, one self-contained package per major.
 *
 * Each version is installed from npm into a temporary folder, bundled with its dependencies by
 * esbuild and written next to a minimal package.json and its type declarations. The bundles are
 * committed and consumed as `file:` dependencies, so the test tree does not depend on the
 * (often outdated) dependency trees of the old releases.
 *
 * Usage: `npm run bundle --workspace test/generators [-- 2 8]` (majors are optional).
 * Requires a Node.js version that runs TypeScript files natively.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Plugin, build } from 'esbuild';
import { execa } from 'execa';

const versionRanges: Record<string, string> = {
  2: '^2.0.5',
  4: '^4.13.0',
  5: '^5.10.0',
  6: '^6.0.1',
  7: '^7.5.1',
  8: '^8.0.0-beta.8',
};

/** Packages that must be shared with the environment under test instead of being bundled. */
const externals = [
  'yeoman-environment',
  'yeoman-environment/*',
  'mem-fs',
  // Optional require guarded by a runtime check, never installed.
  'electron',
  // Only resolved when pacote runs install scripts, never installed.
  'node-gyp/bin/node-gyp.js',
];

const bundlesDirectory = join(dirname(fileURLToPath(import.meta.url)), 'bundles');

type PackageJson = {
  name: string;
  version: string;
  license?: string;
  type?: string;
};

/**
 * shelljs loads its commands with `require('./src/' + command)`, which cannot be bundled.
 * Replace the dynamic loop with one static require per command, and copy the `exec-child.js`
 * helper that `shell.exec` spawns from `__dirname` next to the bundled entry point.
 */
const shelljsPlugin = (entryOutputDirectory: string): Plugin => ({
  name: 'shelljs',
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /[/\\]shelljs[/\\]shell\.js$/ }, ({ path }) => {
      const commands = createRequire(path)('./commands.js') as string[];
      const dynamicLoader = /require\('\.\/commands'\)\.forEach\(function \(command\) \{\s*require\('\.\/src\/' \+ command\);\s*\}\);/;
      const source = readFileSync(path, 'utf8');
      if (!dynamicLoader.test(source)) {
        throw new Error(`Unexpected shelljs entry point at ${path}, update the shelljs plugin`);
      }

      return {
        contents: source.replace(dynamicLoader, commands.map(command => `require('./src/${command}');`).join('\n')),
        loader: 'js',
      };
    });
    pluginBuild.onLoad({ filter: /[/\\]shelljs[/\\]src[/\\]exec\.js$/ }, ({ path }) => {
      mkdirSync(entryOutputDirectory, { recursive: true });
      copyFileSync(join(dirname(path), 'exec-child.js'), join(entryOutputDirectory, 'exec-child.js'));
      return;
    });
  },
});

/**
 * Packages built with `editions` pick their entry point at runtime by reading `__dirname/package.json`.
 * Replace the runtime lookup with a static require of the first edition supporting Node.js.
 */
const editionsPlugin: Plugin = {
  name: 'editions',
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /[/\\]node_modules[/\\][^/\\]+[/\\]index\.js$/ }, ({ path }) => {
      const source = readFileSync(path, 'utf8');
      if (!source.includes('.requirePackage(__dirname, require)')) {
        return;
      }

      const packageJson = JSON.parse(readFileSync(join(dirname(path), 'package.json'), 'utf8')) as {
        name: string;
        editions?: Array<{ directory: string; entry: string; engines?: { node?: string | boolean } }>;
      };
      const edition = packageJson.editions?.find(({ engines }) => engines?.node !== false);
      if (!edition) {
        throw new Error(`No Node.js edition found for ${packageJson.name} at ${path}`);
      }

      return { contents: `module.exports = require('./${edition.directory}/${edition.entry}');`, loader: 'js' };
    });
  },
};

const listDeclarationFiles = (directory: string): string[] =>
  readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter(
    file => file.endsWith('.d.ts') && !file.split(/[/\\]/).includes('node_modules'),
  );

const bundleVersion = async (major: string, range: string): Promise<void> => {
  const temporaryDirectory = realpathSync(mkdtempSync(join(tmpdir(), `yeoman-generator-${major}-`)));
  try {
    writeFileSync(join(temporaryDirectory, 'package.json'), JSON.stringify({ name: 'yeoman-generator-bundle', private: true }));
    console.log(`Installing yeoman-generator@${range}`);
    await execa(
      'npm',
      ['install', `yeoman-generator@${range}`, '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--loglevel=error'],
      { cwd: temporaryDirectory, stdio: 'inherit' },
    );

    const packageDirectory = join(temporaryDirectory, 'node_modules', 'yeoman-generator');
    const packageJson = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as PackageJson;
    const entryPoint = createRequire(join(temporaryDirectory, 'noop.js')).resolve('yeoman-generator');
    const entryRelativePath = relative(packageDirectory, entryPoint);
    const isModule = packageJson.type === 'module';

    const outputDirectory = join(bundlesDirectory, `yeoman-generator-${major}`);
    rmSync(outputDirectory, { recursive: true, force: true });
    mkdirSync(outputDirectory, { recursive: true });

    console.log(`Bundling yeoman-generator@${packageJson.version} (${entryRelativePath}) into ${relative(process.cwd(), outputDirectory)}`);
    // Keep the entry point at the same relative path so `../package.json` lookups keep working.
    const outfile = join(outputDirectory, entryRelativePath);
    await build({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: isModule ? 'esm' : 'cjs',
      external: externals,
      plugins: [shelljsPlugin(dirname(outfile)), editionsPlugin],
      logLevel: 'warning',
      // CommonJS dependencies bundled into an ES module still need require, __filename and __dirname.
      ...(isModule
        ? {
            banner: {
              js: [
                "import { createRequire as __bundleCreateRequire } from 'node:module';",
                "import { fileURLToPath as __bundleFileUrlToPath } from 'node:url';",
                "import { dirname as __bundleDirname } from 'node:path';",
                'const require = __bundleCreateRequire(import.meta.url);',
                'const __bundleFilename = __bundleFileUrlToPath(import.meta.url);',
                'const __bundleDirectory = __bundleDirname(__bundleFilename);',
              ].join('\n'),
            },
            define: { __filename: '__bundleFilename', __dirname: '__bundleDirectory' },
          }
        : {}),
    });

    const declarationFiles = listDeclarationFiles(packageDirectory);
    for (const file of declarationFiles) {
      mkdirSync(dirname(join(outputDirectory, file)), { recursive: true });
      writeFileSync(join(outputDirectory, file), readFileSync(join(packageDirectory, file)));
    }

    for (const file of readdirSync(packageDirectory)) {
      if (/^licen[cs]e/i.test(file)) {
        writeFileSync(join(outputDirectory, file), readFileSync(join(packageDirectory, file)));
      }
    }

    const entryDeclaration = entryRelativePath.replace(/\.js$/, '.d.ts');
    writeFileSync(
      join(outputDirectory, 'package.json'),
      `${JSON.stringify(
        {
          name: packageJson.name,
          version: packageJson.version,
          private: true,
          description: `Bundle of yeoman-generator@${packageJson.version} generated by test/generators/bundle.ts, do not edit.`,
          license: packageJson.license,
          type: packageJson.type,
          main: `./${entryRelativePath}`,
          types: declarationFiles.includes(entryDeclaration) ? `./${entryDeclaration}` : undefined,
        },
        undefined,
        2,
      )}\n`,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
};

const requestedMajors = process.argv.slice(2);
const unknownMajors = requestedMajors.filter(major => !(major in versionRanges));
if (unknownMajors.length > 0) {
  throw new Error(`Unknown yeoman-generator majors: ${unknownMajors.join(', ')}. Known: ${Object.keys(versionRanges).join(', ')}`);
}

for (const major of requestedMajors.length > 0 ? requestedMajors : Object.keys(versionRanges)) {
  await bundleVersion(major, versionRanges[major]);
}
