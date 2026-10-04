#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
rpgm=$PWD/rpgm
tmp=${TMPDIR:-/tmp}/rpgm-test.$$
trap 'rm -rf "$tmp"' EXIT INT TERM
mkdir -p "$tmp"

pass=0 fail=0 skip=0
out=
red='' grn='' ylw='' off=''
if [ -t 1 ]; then red=$(printf '\033[31m') grn=$(printf '\033[32m') ylw=$(printf '\033[33m') off=$(printf '\033[0m'); fi

ok() { pass=$((pass + 1)); printf '%s  ok%s %s\n' "$grn" "$off" "$1"; }
no() {
	fail=$((fail + 1))
	printf '%sFAIL%s %s\n' "$red" "$off" "$1"
	[ $# -lt 2 ] || printf '       %s\n' "$2"
	[ -z "$out" ] || printf '%s\n' "$out" | sed 's/^/     | /'
}
skipped() { skip=$((skip + 1)); printf '%sskip%s %s (%s)\n' "$ylw" "$off" "$1" "$2"; }

run() {
	desc=$1
	shift
	out=$("$@" 2>&1) || true
}

has_line() {
	if printf '%s\n' "$out" | grep -qF -- "$1"; then ok "$desc"; else no "$desc" "expected to find: $1"; fi
}
lacks_line() {
	if printf '%s\n' "$out" | grep -qF -- "$1"; then no "$desc" "did not expect: $1"; else ok "$desc"; fi
}

static() {
	echo "== static: detection and --info"
	fx=$tmp/fx
	sh test/fixtures.sh "$fx"

	run 'reports its version' "$rpgm" --version
	has_line 'rpgm '
	case $out in rpgm\ [0-9]*.[0-9]*.[0-9]*) ok 'version is a release number' ;;
	*) no 'version is a release number' "got: $out" ;; esac

	run 'MV is detected' "$rpgm" --info "$fx/mv"
	has_line 'engine:  mv'
	desc='MV version is read out of rpg_core.js'; has_line 'version: 1.6.1'
	desc='MV plugin counts'; has_line 'plugins: 1 registered, 1 enabled, 1 files'
	desc='mods with no loader are called out'; has_line 'no mod-loader plugin is registered'

	run 'MZ is detected' "$rpgm" --info "$fx/mz"
	has_line 'engine:  mz'

	run 'a registered loader is named instead' "$rpgm" --info "$fx/loader"
	has_line 'loaded at run time by: ModLoader'
	desc='and the "none of them load" warning is gone'
	lacks_line 'no mod-loader plugin is registered'

	run 'unregistered plugin files are listed' "$rpgm" --info "$fx/dup"
	has_line 'Unlisted.js'
	desc='a registered plugin with no file is listed'; has_line 'Ghost.js is enabled but missing'
	desc='a disabled plugin is listed'; has_line 'OffOne'
	desc='files differing only in case are listed'; has_line 'www/js/plugins/listed.js'

	run 'package.nw games are detected' "$rpgm" --info "$fx/zip"
	has_line 'engine:  nwjs-zip'

	run 'Electron games are detected' "$rpgm" --info "$fx/eapp"
	has_line 'engine:  electron-app'

	echo "== static: RPG Maker XP/VX/VX Ace"
	run 'VX Ace is detected' "$rpgm" --info "$fx/rgss-ok"
	has_line 'rgss:    VX Ace (RGSS3)'
	desc='a valid mkxp.json is reported as valid'; has_line 'mkxp.json parses'
	desc='a preload path that does not exist is reported'; has_line '/nonexistent/lib/rgss/all.rb'
	desc='"enableReset": false is left alone'; lacks_line 'F12 resets the game'
	desc='a commented-out setting is not read as live'; lacks_line 'xBRZ is on'
	desc='the live setting is'; has_line 'screen 1/0'

	run 'VX is detected' "$rpgm" --info "$fx/rgss-bad"
	has_line 'rgss:    VX (RGSS2)'
	desc='a mistyped mkxp.json is reported with its line'; has_line 'NOT VALID: line 3'
	desc='and what mkxp-z does with it is spelled out'; has_line 'discards the whole file'

	run 'settings that cancel out are reported' "$rpgm" --info "$fx/rgss-gfx"
	has_line 'this disables framebuffer blitting'
	desc='xBRZ with nothing to scale'; has_line 'xBRZ is on'
	desc='mipmaps with no downscaling'; has_line '"smoothScalingMipmaps" does nothing'
	desc='hires with no Hires/ folder'; has_line 'no Hires/ folder'
	desc='subImageFix costs speed'; has_line '"subImageFix" is on'
	desc='F12 reset left on'; has_line 'F12 resets the game'

	run 'XP is detected' "$rpgm" --info "$fx/rgss-raw"
	has_line 'rgss:    XP (RGSS1)'
	desc='a game with no mkxp.json is told to run --setup'; has_line '--setup'
	desc='Windows DLLs are counted'; has_line 'Windows .dll file(s)'
	desc='Win32API without the wrapper is reported'; has_line 'win32api:'
	desc='CRLF data files are reported'; has_line 'Windows (CRLF) line endings'
	desc='and the JSON decoder that chokes on them is named'; has_line 'jsonEnDecoder.rb'

	echo "== static: --setup"
	run 'setup writes an mkxp.json' "$rpgm" --setup "$fx/rgss-raw"
	has_line 'Wrote'
	desc='setup turns the F12 reset off'
	out=$(cat "$fx/rgss-raw/mkxp.json") || true; has_line '"enableReset": false'
	desc='setup points preloadScript at all.rb'; has_line 'rgss/all.rb'
	desc='what setup writes parses'
	out=$(awk -f lib/json5check.awk "$fx/rgss-raw/mkxp.json" 2>&1) || true
	if [ -z "$out" ]; then ok "$desc"; else no "$desc" "json5check rejected what --setup wrote"; fi
	run 'setup refuses to overwrite an existing config' "$rpgm" --setup "$fx/rgss-raw"
	has_line 'will not rewrite it'
	run 'setup refuses non-RGSS games' "$rpgm" --setup "$fx/mv"
	has_line 'applies to RPG Maker XP/VX/VX Ace'

	echo "== static: folders rpgm cannot run"
	for c in wolf:'Wolf RPG Editor' rt2k:'easyrpg-player' xp3:'KiriKiri' \
		renpy:"Ren'Py" godot:'apk add godot' enigma:'evbunpack' \
		empty:'The folder is empty' junk:'If the game is in a subfolder'; do
		run "${c%%:*} gets a specific answer" "$rpgm" --info "$fx/${c%%:*}"
		has_line "${c#*:}"
	done
	run 'refusing to run says the same thing' "$rpgm" "$fx/wolf"
	has_line 'Wolf RPG Editor'

	echo "== static: the JSON5 tools"
	printf '{ "a": 1, /* c */ "b": [2, 3], "c": { "d": 4 }, unquoted: true }\n' >"$tmp/t.json"
	desc='json5get flattens arrays under one key'
	out=$(awk -f lib/json5get.awk "$tmp/t.json") || true; has_line "$(printf 'b\t2')"
	desc='json5get reports objects as {}'; has_line "$(printf 'c\t{}')"
	desc='json5get reads unquoted keys'; has_line "$(printf 'unquoted\ttrue')"
	desc='json5get does not leak nested keys'; lacks_line "$(printf 'd\t4')"
	desc='json5check accepts valid JSON5'
	out=$(awk -f lib/json5check.awk "$tmp/t.json" 2>&1) || true
	if [ -z "$out" ]; then ok "$desc"; else no "$desc" "rejected valid JSON5: $out"; fi
	for t in 'missing comma:{"a":1 "b":2}' 'trailing junk:{"a":1}}' 'unclosed string:{"a":"x}'; do
		desc="json5check rejects ${t%%:*}"
		printf '%s\n' "${t#*:}" >"$tmp/bad.json"
		out=$(awk -f lib/json5check.awk "$tmp/bad.json" 2>&1) || true
		if [ -n "$out" ]; then ok "$desc"; else no "$desc" "accepted it"; fi
	done
}

unit() {
	echo "== unit: lib/"
	if ! command -v node >/dev/null 2>&1; then skipped 'node unit tests' 'node is not installed'; return 0; fi
	ci=$(for t in test/*-test.js; do (
		# shellcheck disable=SC3045
		ulimit -n 256 2>/dev/null
		node "$t" 2>&1
	) || true; done)
	printf '%s\n' "$ci" | while IFS= read -r l; do
		case $l in ok\ *) printf '%s  ok%s %s\n' "$grn" "$off" "${l#ok }" ;;
		*) printf '%sFAIL%s %s\n' "$red" "$off" "${l#FAIL }" ;; esac
	done
	pass=$((pass + $(printf '%s\n' "$ci" | grep -c '^ok ' || true)))
	fail=$((fail + $(printf '%s\n' "$ci" | grep -vc '^ok ' || true)))
	for f in lib/*.js; do
		desc="$f parses"
		if node --check "$f" >/dev/null 2>&1; then ok "$desc"; else no "$desc"; fi
	done
}

integration() {
	echo "== integration: a real MV game under Electron"
	for need in electron python3; do
		command -v "$need" >/dev/null 2>&1 || { skipped 'MV game tests' "$need is not installed"; return 0; }
	done
	if [ -z "${RPGM_CORESCRIPT:-}" ] || [ ! -d "$RPGM_CORESCRIPT" ]; then
		skipped 'MV game tests' 'set RPGM_CORESCRIPT to a corescript checkout'; return 0
	fi
	font=${RPGM_TEST_FONT:-}
	[ -n "$font" ] && [ -f "$font" ] ||
		font=$(find /usr/share/fonts -name '*.ttf' 2>/dev/null | head -n 1)
	[ -n "$font" ] || { skipped 'MV game tests' 'no .ttf found; set RPGM_TEST_FONT'; return 0; }
	[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] ||
		{ skipped 'MV game tests' 'no display; try xvfb-run ./test/run.sh'; return 0; }

	for t in RpgmTest OpsTest; do
		g=$tmp/$t
		python3 test/build_mv.py "$g" --corescript "$RPGM_CORESCRIPT" --font "$font" \
			--plugin "test/$t.js" >/dev/null ||
			{ no "$t: building the game"; continue; }
		out=$(ELECTRON_ENABLE_LOGGING=1 timeout 120 "$rpgm" "$g" 2>&1) || true
		desc="$t ran to the end"
		key=$(printf '%s' "$t" | tr '[:lower:]' '[:upper:]' | sed 's/TEST$//')
		line=$(printf '%s\n' "$out" | grep -o "${key}-RESULT .*" | head -n 1 || true)
		if [ -z "$line" ]; then no "$desc" "no ${key}-RESULT line in the game's output"; continue; fi
		ok "$desc"
		out=$line
		case $t in
		RpgmTest)
			desc='the game sees NW.js'; has_line '"isNwjs":true'
			desc='saves are written and read back'; has_line '"exists":true'
			desc='config survives a round trip'; has_line '"config":40'
			desc='www/mods resolves next to index.html'; has_line '"modsFolderExists":true'
			desc='a mod file is readable from there'; has_line '"modFileReadable":"MOD-OK"'
			desc='a wrong-case path still finds the file'; lacks_line '"fsWrongCase":"ERR'
			desc='the clipboard round-trips'; has_line '"clipboard":"rpgm-clip"'
			desc='fetch of a wrong-case asset works'; has_line '"wasmFetch":true'
			;;
		OpsTest)
			desc='no nw.* call threw'; has_line '"errors":[]'
			desc='a child window opens with its own id'; has_line '"childOpen":true'
			desc='expando properties survive Window.get()'; has_line '"expandoProp":"{\"a\":1}"'
			;;
		esac
	done
}

case ${1:-all} in
static) static ;;
unit) unit ;;
integration) integration ;;
all) static; unit; integration ;;
*) echo "usage: $0 [static|unit|integration|all]" >&2; exit 2 ;;
esac

printf '\n%d passed, %d failed, %d skipped\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ]
