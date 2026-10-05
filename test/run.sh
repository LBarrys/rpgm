#!/bin/sh
set -u
cd "$(dirname "$0")/.." || exit 1
fx=$(mktemp -d)
trap 'rm -rf "$fx"' EXIT INT TERM
pass=0 fail=0
export WAYLAND_DISPLAY=wayland-test

check() {
	if printf '%s\n' "$out" | grep -qF -- "$2"; then
		pass=$((pass + 1)); echo "  ok $1"
	else
		fail=$((fail + 1)); echo "FAIL $1: expected '$2' in:"; printf '%s\n' "$out" | sed 's/^/     | /'
	fi
}
run() { out=$(sh ./rpgm "$@" 2>&1); }

mkdir -p "$fx/mv/www/js" "$fx/mz/js" "$fx/zip" "$fx/eapp/resources/app" "$fx/xp/Data" "$fx/vx/data" "$fx/none" "$fx/evb" "$fx/exe"
echo "Utils.RPGMAKER_VERSION = \"1.6.1\";" >"$fx/mv/www/js/rpg_core.js"
echo "Utils.RPGMAKER_VERSION = \"1.8.0\";" >"$fx/mz/js/rmmz_core.js"
: >"$fx/zip/package.nw"
echo '{}' >"$fx/eapp/resources/app/package.json"
: >"$fx/xp/Data/Scripts.rxdata"
: >"$fx/vx/data/scripts.RVDATA2"
echo '{}' >"$fx/vx/mkxp.json"
: >"$fx/mv/Game.exe"
printf 'MZ\000\000.enig\000ma1' >"$fx/exe/Game.exe"
printf 'MZ\000\000.enigma1\000' >"$fx/evb/GAME.EXE"

echo "== rpgm"
run --version; check 'reports its version' 'rpgm 0.'
run --info "$fx/mv"; check 'MV is detected' 'engine:  mv'; check 'MV version is read' 'version: 1.6.1'
run --info "$fx/mv/Game.exe"; check 'a Game.exe path means its folder' 'engine:  mv'
run --info "$fx/mz"; check 'MZ is detected' 'engine:  mz'; check 'MZ version is read' 'version: 1.8.0'
run --info "$fx/zip"; check 'package.nw is detected' 'engine:  nwjs-zip'
run --info "$fx/eapp"; check 'Electron games are detected' 'engine:  electron-app'
run --info "$fx/xp"; check 'XP is detected' 'engine:  rgss'; check 'a missing mkxp.json is reported' 'config:  none'
run --info "$fx/vx"; check 'detection ignores letter case' 'engine:  rgss'; check 'an mkxp.json is found' 'config:  mkxp.json'
run --info "$fx/none"; check 'an empty folder is not a game' 'engine:  not recognized'
run --info "$fx/evb"; check 'an Enigma-packed exe is detected' 'engine:  evb'; check 'and named' 'GAME.EXE (Enigma'
run --info "$fx/exe"; check 'a plain exe is not taken for Enigma' 'engine:  not recognized'
run "$fx/none"; check 'running a non-game fails' 'no RPG Maker game found'
run --setup "$fx/xp"; check '--setup writes mkxp.json' 'Wrote'
out=$(cat "$fx/xp/mkxp.json"); check '--setup loads the shims' 'rgss/all.rb"]'; check '--setup turns F12 off' '"enableReset": false'
run --setup "$fx/vx"; check '--setup leaves an existing config alone' 'already exists'
run --setup "$fx/mv"; check '--setup refuses other engines' 'is for RPG Maker XP'
run --bogus; check 'unknown options are refused' 'unknown option'

echo "== lib"
if command -v node >/dev/null 2>&1; then
	for t in test/*-test.js; do
		# shellcheck disable=SC3045
		out=$(ulimit -n 256 2>/dev/null; node "$t" 2>&1) || true
		pass=$((pass + $(printf '%s\n' "$out" | grep -c '^ok '))); fail=$((fail + $(printf '%s\n' "$out" | grep -vc '^ok ')))
		printf '%s\n' "$out" | sed 's/^ok /  ok /'
	done
	mkdir -p "$fx/packed" "$fx/bin"
	node -e "const { evb } = require('./test/evb-test.js'); const f = (name, data) => ({ name, data: Buffer.from(data) });
require('fs').writeFileSync(process.argv[1], evb({ name: '%DEFAULT FOLDER%', children: [f('package.json', '{}'),
  { name: 'www', children: [f('index.html', ''), { name: 'js', children: [f('rpg_core.js', '')] }] }] }))" "$fx/packed/Game.exe"
	# shellcheck disable=SC2016
	printf '#!/bin/sh\necho "electron got $RPGM_GAME editor=$RPGM_EDITOR wasd=$RPGM_WASD appdata=$LOCALAPPDATA args=$*"\n' >"$fx/bin/electron" && chmod +x "$fx/bin/electron"
	# shellcheck disable=SC2016
	printf '#!/bin/sh\necho "mkxp-z rgss=$RPGM_RGSS_VERSION driver=$SDL_VIDEODRIVER"\n' >"$fx/bin/mkxp-z" && chmod +x "$fx/bin/mkxp-z"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm "$fx/packed" 2>&1)
	check 'an Enigma-packed game is unpacked and run' "electron got $fx/data/rpgm/unpacked/"
	check 'Electron is started on Wayland' 'args=--ozone-platform=wayland --enable-features=WaylandWindowDecorations'
	out=$(PATH="$fx/bin:$PATH" WAYLAND_DISPLAY='' sh ./rpgm "$fx/packed" 2>&1); check 'without a Wayland session nothing runs' 'Wayland only'
	out=$(cd "$fx/data" && find . -type f | sort); check 'its files are unpacked' 'www/js/rpg_core.js'
	mkdir -p "$fx/nw"
	node -e "const { zip } = require('./test/evb-test.js'); require('fs').writeFileSync(process.argv[1], zip([
  { name: 'package.json', data: '{}' }, { name: 'js/rmmz_core.js', data: '' }, { name: Buffer.from('8c8892e82e6f6767', 'hex'), data: 'ogg' }]))" "$fx/nw/package.nw"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/nwdata" sh ./rpgm "$fx/nw" 2>&1)
	check 'a package.nw game is unpacked without unzip and run' "electron got $fx/nwdata/rpgm/unpacked/"
	out=$(cd "$fx/nwdata" && find . -type f); check 'with its Shift-JIS file names decoded' '決定.ogg'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm --editor "$fx/packed" 2>&1)
	check '--editor reaches a packed game after unpacking' 'editor=1'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm --wasd "$fx/packed" 2>&1)
	check '--wasd reaches the game' 'wasd=1'
	check 'Windows folders point into rpgm/windows' "appdata=$fx/data/rpgm/windows/AppData/Local"
	out=$(ls -d "$fx/data/rpgm/windows/AppData/Roaming"); check 'and exist' 'AppData/Roaming'
	out=$(PATH="$fx/bin:$PATH" LOCALAPPDATA=/mine sh ./rpgm "$fx/packed" 2>&1); check 'a set LOCALAPPDATA is kept' 'appdata=/mine'
	out=$(PATH="$fx/bin:$PATH" sh ./rpgm "$fx/xp" 2>/dev/null); check 'XP runs as RGSS1' 'rgss=1'; check 'mkxp-z is told to use Wayland' 'driver=wayland'
	out=$(PATH="$fx/bin:$PATH" sh ./rpgm "$fx/vx" 2>/dev/null); check 'VX Ace runs as RGSS3' 'rgss=3'
	mkdir -p "$fx/mz/save"
	node -e "process.stdout.write(require('zlib').deflateSync('{\"party\":{\"_gold\":100}}').toString('latin1'))" >"$fx/mz/save/file1.rmmzsave"
	out=$(EDITOR=true sh ./rpgm --edit-save "$fx/mz/save/file1.rmmzsave" 2>&1); check '--edit-save writes nothing when nothing changed' 'Unchanged'
	out=$(EDITOR="sed -i s/100/250/" sh ./rpgm --edit-save "$fx/mz/save/file1.rmmzsave" 2>&1); check '--edit-save writes an edit back' 'Wrote'
	out=$(node lib/savejson.js decode "$fx/mz/save/file1.rmmzsave" /dev/stdout); check 'and the save holds it' '"_gold": 250'
	out=$(ls "$fx/mz/save"); check 'next to a backup of the original' 'file1.rmmzsave.bak'
	out=$(EDITOR="sed -i s/250/oops,/" sh ./rpgm --edit-save "$fx/mz/save/file1.rmmzsave" 2>&1); check 'a broken edit is not written' 'your edit is kept in'
	for f in lib/*.js; do
		if node --check "$f" 2>/dev/null; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL $f does not parse"; fi
	done
else
	echo "  (node not installed; skipped)"
fi

if command -v ruby >/dev/null 2>&1; then
	echo "== rgss"
	out=$(RPGM_RGSS_VERSION=1 ruby -e 'load "lib/rgss/ruby18.rb"
class Hero; attr_reader :type; def initialize; @type = :mage; end; def act; end; end
puts 1.type, Hero.new.type, Hero.instance_methods.include?("act"), Hero.new.methods.include?("act"), [1, nil].nitems, { a: 9 }.index(9)' 2>&1)
	check 'Ruby 1.8: obj.type is its class' 'Integer'; check "a game's own type wins" 'mage'
	check 'method lists accept strings' 'true'; check 'Array#nitems and Hash#index are back' "1
a"
	out=$(RPGM_RGSS_VERSION=3 ruby -e 'load "lib/rgss/ruby18.rb"; puts 1.respond_to?(:type)' 2>&1)
	check 'VX Ace is left on modern Ruby' 'false'
fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
