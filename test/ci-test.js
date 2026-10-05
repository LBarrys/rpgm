'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const ci = require('../lib/ci.js');

let failed = 0;
function is(desc, got, want) {
  if (got === want) { console.log('ok ' + desc); return; }
  failed++;
  console.log('FAIL ' + desc + ' (got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want) + ')');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpgm-ci-'));
const www = path.join(root, 'www');
fs.mkdirSync(path.join(www, 'img', 'system'), { recursive: true });
fs.mkdirSync(path.join(www, 'js', 'plugins'), { recursive: true });
fs.writeFileSync(path.join(www, 'img', 'system', 'iconset.png'), 'PNG');
fs.writeFileSync(path.join(www, 'js', 'plugins', 'MixedCase.js'), '//');

const real = path.join(www, 'img', 'system', 'iconset.png');

is('an exact path resolves to itself', ci.resolve(real), real);
is('a wrong-case file name resolves',
  ci.resolve(path.join(www, 'img', 'system', 'IconSet.PNG')), real);
is('a wrong-case directory resolves',
  ci.resolve(path.join(www, 'IMG', 'System', 'iconset.png')), real);
is('every component can be wrong at once',
  ci.resolve(path.join(www, 'IMG', 'SYSTEM', 'ICONSET.PNG')), real);
is('a file that is really missing returns null',
  ci.resolve(path.join(www, 'img', 'system', 'nothing.png')), null);
is('an exact mixed-case name is not mangled',
  ci.resolve(path.join(www, 'js', 'plugins', 'MixedCase.js')),
  path.join(www, 'js', 'plugins', 'MixedCase.js'));

is('a new file in a wrong-case folder gets the real folder',
  ci.resolveWrite(path.join(www, 'IMG', 'System', 'new.png')),
  path.join(www, 'img', 'system', 'new.png'));
is('a new file in a missing folder is returned unchanged',
  ci.resolveWrite(path.join(www, 'nope', 'new.png')),
  path.join(www, 'nope', 'new.png'));

is('a URL-style path resolves inside the root',
  ci.resolveIn(www, '/img/System/IconSet.png'), real);
is('.. cannot escape the root', ci.resolveIn(www, '/../../etc/passwd'), null);
is('.. cannot escape the root case-insensitively',
  ci.resolveIn(www, '/IMG/../../secret'), null);
is('the root itself resolves', ci.resolveIn(www, '/'), www);

fs.writeFileSync(path.join(www, 'img', 'system', 'Late.PNG'), 'PNG');
is('a file created after the first listing is still found',
  ci.resolve(path.join(www, 'img', 'system', 'late.png')),
  path.join(www, 'img', 'system', 'Late.PNG'));

const save = path.join(www, 'save');
is('a path without backslashes is left alone', ci.unbackslash(path.join(save, 'file1.rpgsave')), path.join(save, 'file1.rpgsave'));
is('a Windows separator becomes a folder', ci.unbackslash(www + '/save\\file1.rpgsave'), www + '/save/file1.rpgsave');
fs.writeFileSync(www + '/save\\file2.rpgsave', 'old save');
is('a save written under the backslash name is moved into place', ci.unbackslash(www + '/save\\file2.rpgsave'), www + '/save/file2.rpgsave');
is('with its contents', fs.readFileSync(path.join(save, 'file2.rpgsave'), 'utf8'), 'old save');
is('and the misnamed file is gone', fs.existsSync(www + '/save\\file2.rpgsave'), false);
fs.writeFileSync(www + '/save\\file2.rpgsave', 'stale');
ci.unbackslash(www + '/save\\file2.rpgsave');
is('an existing save is never overwritten', fs.readFileSync(path.join(save, 'file2.rpgsave'), 'utf8'), 'old save');
is('non-strings pass through', ci.unbackslash(3), 3);

fs.rmSync(root, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
