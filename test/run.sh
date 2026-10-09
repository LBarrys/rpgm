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

mkdir -p "$fx/mv/www/js" "$fx/mz/js" "$fx/zip" "$fx/eapp/resources/app" "$fx/xp/Data" "$fx/vx/data" "$fx/none" "$fx/evb" "$fx/exe" "$fx/xpa" "$fx/vxa" "$fx/2k"
echo "Utils.RPGMAKER_VERSION = \"1.6.1\";" >"$fx/mv/www/js/rpg_core.js"
echo "Utils.RPGMAKER_VERSION = \"1.8.0\";" >"$fx/mz/js/rmmz_core.js"
: >"$fx/zip/package.nw"
echo '{}' >"$fx/eapp/resources/app/package.json"
: >"$fx/xp/Data/Scripts.rxdata"
: >"$fx/vx/data/scripts.RVDATA2"
printf '[Game]\r\nRTP1=Standard\r\nRTP2=\r\nScripts=Data\\Scripts.rxdata\r\n' >"$fx/xp/Game.ini"
printf '[Game]\r\nRTP=RPGVX\r\n' >"$fx/xpa/Game.ini"; : >"$fx/xpa/Game.rgssad"
printf '[Game]\r\nRTP=RPGVX\r\n' >"$fx/vxa/Game.ini"; : >"$fx/vxa/GAME.RGSS2A"
: >"$fx/2k/RPG_RT.ldb"; : >"$fx/2k/RPG_RT.LMT"
mkdir -p "$fx/nwdir/Package.nw/js"; : >"$fx/nwdir/Secretary.exe"; : >"$fx/nwdir/nw.dll"
echo '{"main": "index.html"}' >"$fx/nwdir/Package.nw/package.json"; : >"$fx/nwdir/Package.nw/index.html"
echo 'Utils.RPGMAKER_VERSION = "1.9.0";' >"$fx/nwdir/Package.nw/js/rmmz_core.js"
printf '// settings {\n{\n\t// "preloadScript": ["old.rb"],\n\t"windowTitle": "VX",\n}\n' >"$fx/vx/mkxp.json"
mkdir -p "$fx/pre"; : >"$fx/pre/Game.ini"; : >"$fx/pre/Game.rgss3a"; printf '{ "preloadScript": ["mine.rb"] }\n' >"$fx/pre/mkxp.json"
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
run --info "$fx/xp"; check 'XP is detected' 'engine:  rgss'; check 'rpgm writes the config' 'config:  written by rpgm'
check 'the RTP the game names is reported' 'rtp:     Standard, not installed'
run --info "$fx/vx"; check 'detection ignores letter case' 'engine:  rgss'; check "a game's own mkxp.json is found" "merged with the game's mkxp.json"
run --info "$fx/vxa"; check 'an archive-only game is detected' 'engine:  rgss'
run --info "$fx/2k"; check 'RPG Maker 2000/2003 is detected' 'engine:  rm2k'
run --info "$fx/nwdir"; check 'a package.nw folder is the game' "game:    $fx/nwdir/Package.nw"; check 'and what is in it is detected' 'engine:  mz'
run --info "$fx/nwdir/Secretary.exe"; check 'also when started from the exe next to it' 'engine:  mz'
run --info "$fx/none"; check 'an empty folder is not a game' 'engine:  not recognized'
run --info "$fx/evb"; check 'an Enigma-packed exe is detected' 'engine:  evb'; check 'and named' 'GAME.EXE (Enigma'
run --info "$fx/exe"; check 'a plain exe is not taken for Enigma' 'engine:  not recognized'
run "$fx/none"; check 'running a non-game fails' 'no RPG Maker game found'
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
	printf '#!/bin/sh\necho "electron got $RPGM_GAME cheat=$RPGM_CHEAT wasd=$RPGM_WASD translate=$RPGM_TRANSLATE appdata=$LOCALAPPDATA args=$*"\n' >"$fx/bin/electron" && chmod +x "$fx/bin/electron"
	# shellcheck disable=SC2016
	printf '#!/bin/sh\necho "mkxp-z rgss=$RPGM_RGSS_VERSION driver=$SDL_VIDEODRIVER cheat=$RPGM_CHEAT translate=$RPGM_TRANSLATE pwd=$PWD"; cat mkxp.json\n' >"$fx/bin/mkxp-z" && chmod +x "$fx/bin/mkxp-z"
	# shellcheck disable=SC2016
	printf '#!/bin/sh\necho "easyrpg driver=$SDL_VIDEODRIVER rtp=${RPG2K_RTP_PATH:-} args=$*"\n' >"$fx/bin/easyrpg-player" && chmod +x "$fx/bin/easyrpg-player"
	mkdir -p "$fx/lib/mkxp-z/scripts/preload" "$fx/lib/mkxp-z/stdlib" "$fx/data/rpgm/rtp/Standard" "$fx/data/rpgm/rtp/RPG2000"
	: >"$fx/lib/mkxp-z/scripts/preload/win32_wrap.rb"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm "$fx/packed" 2>&1)
	check 'an Enigma-packed game is unpacked and run' "electron got $fx/data/rpgm/unpacked/"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm "$fx/nwdir" 2>&1); check 'a package.nw folder runs without unpacking' "electron got $fx/nwdir/Package.nw "
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm "$fx/packed" 2>&1)
	check 'Electron is started on Wayland' 'args=--ozone-platform=wayland --enable-features=WaylandWindowDecorations'
	out=$(PATH="$fx/bin:$PATH" RPGM_PMJS=1 sh ./rpgm "$fx/mv" 2>&1); check 'RPGM_PMJS without pmjs says where to get it' 'pmjs is not installed (https://github.com/bbbreaddd/pmjs)'
	# shellcheck disable=SC2016
	printf '#!/bin/sh\necho "pmjs $* driver=${SDL_VIDEODRIVER:-}"\n' >"$fx/bin/pmjs" && chmod +x "$fx/bin/pmjs"
	out=$(PATH="$fx/bin:$PATH" RPGM_PMJS=1 sh ./rpgm "$fx/mv" 2>&1)
	check 'RPGM_PMJS prepares an MV game from its www folder' "pmjs prepare --game $fx/mv/www driver="
	check 'then runs it on Wayland' "pmjs run --game $fx/mv/www driver=wayland"
	check 'and says what only electron does' 'running on PMJS (experimental)'
	out=$(PATH="$fx/bin:$PATH" RPGM_PMJS=1 sh ./rpgm "$fx/mz" 2>&1); check 'an MZ game runs from its own folder' "pmjs run --game $fx/mz driver=wayland"
	mkdir -p "$fx/html" && echo '{"main": "index.html"}' >"$fx/html/package.json"
	out=$(PATH="$fx/bin:$PATH" RPGM_PMJS=1 sh ./rpgm "$fx/html" 2>&1); check 'other NW.js games stay on electron' 'electron got'
	out=$(PATH="$fx/bin:$PATH" RPGM_PMJS=1 sh ./rpgm -i "$fx/mz" 2>&1); check '--info names pmjs' "runtime: $fx/bin/pmjs (experimental)"
	out=$(PATH="$fx/bin:$PATH" sh ./rpgm "$fx/mz" 2>&1); check 'without RPGM_PMJS, MZ stays on electron' 'electron got'
	rm "$fx/bin/pmjs"
	out=$(PATH="$fx/bin:$PATH" WAYLAND_DISPLAY='' sh ./rpgm "$fx/packed" 2>&1); check 'without a Wayland session nothing runs' 'Wayland only'
	out=$(cd "$fx/data" && find . -type f | sort); check 'its files are unpacked' 'www/js/rpg_core.js'
	mkdir -p "$fx/nw"
	node -e "const { zip } = require('./test/evb-test.js'); require('fs').writeFileSync(process.argv[1], zip([
  { name: 'package.json', data: '{}' }, { name: 'js/rmmz_core.js', data: '' }, { name: Buffer.from('8c8892e82e6f6767', 'hex'), data: 'ogg' }]))" "$fx/nw/package.nw"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/nwdata" sh ./rpgm "$fx/nw" 2>&1)
	check 'a package.nw game is unpacked without unzip and run' "electron got $fx/nwdata/rpgm/unpacked/"
	out=$(cd "$fx/nwdata" && find . -type f); check 'with its Shift-JIS file names decoded' '決定.ogg'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm "$fx/mv" 2>&1); check 'the cheat menu is on by default' 'cheat=1'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm --no-cheat "$fx/packed" 2>&1)
	check '--no-cheat reaches a packed game after unpacking' 'cheat= '
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm -C "$fx/mv" 2>&1); check '-C is --no-cheat' 'cheat= '
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm -C -c "$fx/mv" 2>&1); check 'the old -c still turns it on' 'cheat=1'
	out=$(PATH="$fx/bin:$PATH" sh ./rpgm --editor "$fx/mv" 2>&1); check 'the old --editor is gone' 'unknown option'
	mkdir -p "$fx/my words"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm --translate "$fx/my words/ja en.json" "$fx/packed" 2>&1)
	check '--translate reaches a packed game, spaces and all' "translate=$fx/my words/ja en.json"
	out=$(cat "$fx/my words/ja en.json"); check 'and creates the dictionary' '{}'
	out=$(cd "$fx/my words" && PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$OLDPWD/rpgm" -t rel.json "$fx/mv" 2>&1)
	check 'a relative dictionary path is made absolute (-t)' "translate=$fx/my words/rel.json"
	out=$(PATH="$fx/bin:$PATH" sh ./rpgm --translate 2>&1); check '--translate needs a file' 'needs a file'
	out=$(PATH="$fx/bin:$PATH" sh ./rpgm -t "$fx/mv" 2>&1); check 'the old -t habit (a game folder) gets a hint' 'playtest is -T'
	out=$(PATH="$fx/bin:$PATH" sh ./rpgm --translate "$fx/nodir/x.json" "$fx/mv" 2>&1); check 'a missing folder is refused' 'no such folder'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm --wasd "$fx/packed" 2>&1)
	check '--wasd reaches the game' 'wasd=1'
	check 'Windows folders point into rpgm/windows' "appdata=$fx/data/rpgm/windows/AppData/Local"
	out=$(ls -d "$fx/data/rpgm/windows/AppData/Roaming"); check 'and exist' 'AppData/Roaming'
	out=$(PATH="$fx/bin:$PATH" LOCALAPPDATA=/mine sh ./rpgm "$fx/packed" 2>&1); check 'a set LOCALAPPDATA is kept' 'appdata=/mine'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm "$fx/xp" 2>&1); check 'XP runs as RGSS1' 'rgss=1'; check 'mkxp-z is told to use Wayland' 'driver=wayland'
	check 'mkxp-z starts from the config rpgm wrote' "pwd=$fx/data/rpgm/mkxp/"
	check 'which points at the game' "\"gameFolder\": \"$fx/xp\""
	check 'loads the shims' 'rgss/all.rb"]'; check 'turns F12 reset off' '"enableReset": false'
	check 'adds the installed RTP the game names' "\"RTP\": [\"$fx/data/rpgm/rtp/Standard\"]"
	check "and mkxp-z's Ruby standard library" "\"rubyLoadpath\": [\"$fx/lib/mkxp-z/stdlib\"]"
	case $out in *YJITEnable*) fail=$((fail + 1)); echo "FAIL YJIT is on without RPGM_YJIT" ;; *) pass=$((pass + 1)); echo "  ok YJIT stays off by default" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" RPGM_YJIT=1 sh ./rpgm "$fx/xp" 2>&1); check 'RPGM_YJIT=1 turns on Ruby JIT' '"YJITEnable": true'
	out=$(ls "$fx/xp"); check 'the game folder is left untouched' 'Data'; case $out in *mkxp.json*) fail=$((fail + 1)); echo "FAIL rpgm wrote into the game folder" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm "$fx/vx" 2>&1); check 'VX Ace runs as RGSS3' 'rgss=3'
	check "a game with its own mkxp.json still starts from rpgm's config" "pwd=$fx/data/rpgm/mkxp/"
	check "which keeps the game's settings" '"windowTitle": "VX"'; check 'and adds the shims' 'rgss/all.rb"]'
	check 'comments before the object are left alone' '// settings {'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm "$fx/pre" 2>&1); check "a game's own preloadScript wins, and rpgm says so" 'sets its own preloadScript'
	check 'its config is still written' '"preloadScript": ["mine.rb"]'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm "$fx/xpa" 2>&1); check 'an XP archive-only game runs as RGSS1' 'rgss=1'
	check 'a missing RTP is pointed out' "extract it to $fx/data/rpgm/rtp/RPGVX"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm "$fx/vxa" 2>&1); check 'a VX archive-only game runs as RGSS2' 'rgss=2'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm -C "$fx/vxa" 2>&1); check '--no-cheat reaches XP/VX/VX Ace games' 'cheat= '
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm --translate "$fx/my words/rgss.json" "$fx/vxa" 2>&1); check '--translate reaches XP/VX/VX Ace games' "translate=$fx/my words/rgss.json"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm -T "$fx/2k" 2>&1)
	check 'RPG Maker 2000/2003 runs on EasyRPG, on Wayland' 'easyrpg driver=wayland'
	check 'with the game folder and playtest mode (-T)' "args=--project-path $fx/2k --test-play"
	check 'and the installed RTP' "rtp=$fx/data/rpgm/rtp/RPG2000"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./rpgm --translate "$fx/my words/2k.json" "$fx/2k" 2>&1); check '--translate says it cannot help 2000/2003' 'MV/MZ/XP/VX/VX Ace games only'
	mkdir -p "$fx/mz/save"
	node -e "process.stdout.write(require('zlib').deflateSync('{\"party\":{\"_gold\":100}}').toString('latin1'))" >"$fx/mz/save/file1.rmmzsave"
	out=$(EDITOR=true sh ./rpgm --edit-save "$fx/mz/save/file1.rmmzsave" 2>&1); check '--edit-save writes nothing when nothing changed' 'Unchanged'
	out=$(EDITOR="sed -i s/100/250/" sh ./rpgm -e "$fx/mz/save/file1.rmmzsave" 2>&1); check '-e (--edit-save) writes an edit back' 'Wrote'
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
	for t in test/*-test.rb; do
		out=$(ruby "$t" 2>&1) || true
		pass=$((pass + $(printf '%s\n' "$out" | grep -c '^ok '))); fail=$((fail + $(printf '%s\n' "$out" | grep -vc '^ok ')))
		printf '%s\n' "$out" | sed 's/^ok /  ok /'
	done
	out=$(RPGM_RGSS_VERSION=3 ruby -e 'load "lib/rgss/ruby18.rb"; puts({ a: 9 }.index(9))' 2>&1)
	check 'VX Ace gets Hash#index back, as Ruby 1.9 had it' 'a'
	mkdir -p "$fx/rgss"
	# shellcheck disable=SC2016
	printf '$order << "B"\n' >"$fx/rgss/B.rpgm.rb"
	# shellcheck disable=SC2016
	printf '$order << "a"\n' >"$fx/rgss/a.rpgm.rb"
	# shellcheck disable=SC2016
	out=$(SRCDIR="$fx/rgss" ruby -Ku -e '$RGSS_SCRIPTS = [
  [1, "Fonts", "", "# ** Auto Font Install\nraise \"font\"\n"],
  [2, "Steam", "", "x = 1\nexit if steam.is_subscribed != true\nputs \"steam ok\"\n"],
  [3, "Text", "", "t = nil.to_s.clone\nt << \"k\"\nputs \"text \" + t\n"],
  [4, "KGC", "", "# ビットマップ拡張 - KGC_BitmapExtension ◆ XP/VX\nraise \"kgc\"\n"],
  [5, "Broken", "", "# \xff\nx.to_s.clone\n".dup.force_encoding("UTF-8")],
  [6, "Main", "", "$order << \"main\"\n"],
]
$order = []
load "lib/rgss/patches.rb"
puts "broken kept" if $RGSS_SCRIPTS[4][3].end_with?("x.to_s.clone\n")
$RGSS_SCRIPTS.each { |s| eval(s[3], binding, s[1]) unless s[1] == "Broken" }
puts "order: " + $order.join(",")' 2>&1)
	check 'Auto Font Install is removed' 'Fonts: Auto Font Install removed'
	check 'the Steam check is cut and the rest runs' 'steam ok'
	check 'frozen text is copied unfrozen' 'text k'
	check 'a Japanese-marked Windows-only plugin is removed' 'KGC: KGC_BitmapExtension removed'
	check 'user scripts run in name order before Main' 'order: B,a,main'
	check 'and each is announced' 'B.rpgm.rb runs before Main'
	check 'a script with invalid UTF-8 is left alone' 'broken kept'
	# shellcheck disable=SC2016
	out=$(ruby -e '$RGSS_SCRIPTS = [[1, "Input", "", "module Input; def self.update; $u = \"updated\"; end; def self.raw_key_states; $u.to_s + \" keys\"; end; end\n"],
  [2, "Essentials", "", "module Input; end\ndef pbSameThread(w); end\nputs Input.raw_key_states\n"]]
load "lib/rgss/patches.rb"
$RGSS_SCRIPTS.each { |s| eval(s[3], binding, s[1]) }
puts "lines: #{$RGSS_SCRIPTS[1][3].lines.size}"' 2>&1)
	check 'Pokemon Essentials refreshes input before raw_key_states' 'updated keys'
	check 'without moving its line numbers' 'lines: 3'
fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
