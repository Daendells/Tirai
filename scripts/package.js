// Writes dist/tirai-<version>.zip from extension/ with manifest.json at the zip root. Run with: npm run package
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Git Bash puts GNU tar first on PATH, which cannot write zip, so use the bsdtar that ships with Windows.
const TAR = path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe');
const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const { version } = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const zip = path.join(ROOT, 'dist', `tirai-${version}.zip`);

fs.mkdirSync(path.dirname(zip), { recursive: true });
fs.rmSync(zip, { force: true });
// bsdtar writes zip with -a on Windows, Linux and macOS use zip. -C / cwd makes manifest.json the root entry.
if (process.platform === 'win32') execFileSync(TAR, ['-a', '-cf', zip, '-C', EXT, '.'], { stdio: 'inherit' });
else execFileSync('zip', ['-r', '-q', zip, '.'], { cwd: EXT, stdio: 'inherit' });

const [cmd, args] = process.platform === 'win32' ? [TAR, ['-tf', zip]] : ['unzip', ['-Z1', zip]];
const listing = execFileSync(cmd, args, { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
  .map((e) => e.replace(/^\.\//, '')).filter((e) => e && e !== '.' && !e.endsWith('/'));
if (!listing.includes('manifest.json')) throw new Error('manifest.json is not at the zip root');
console.log(listing.join('\n'));
console.log(`\n${zip} (${listing.length} entries, ${fs.statSync(zip).size} bytes)`);
