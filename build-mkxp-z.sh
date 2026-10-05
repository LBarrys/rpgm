#!/bin/sh
set -eu

die() { printf 'build-mkxp-z: %s\n' "$*" >&2; exit 1; }

prefix=${PREFIX:-/usr/local}
case ${1:-} in
--user) prefix=$HOME/.local ;;
'') ;;
*) die "usage: $0 [--user]" ;;
esac
src=${MKXPZ_BUILD_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/mkxp-z-build}
ref=${MKXPZ_REF:-dev}
arch=$(uname -m)

deps='bash git build-base cmake meson ninja-build autoconf automake libtool pkgconf ruby bison
xxd perl linux-headers zlib-dev bzip2-dev libx11-dev libxext-dev libxrandr-dev libxcursor-dev
libxi-dev libxinerama-dev libxscrnsaver-dev libxkbcommon-dev libxfixes-dev wayland-dev
wayland-protocols libdecor-dev mesa-dev alsa-lib-dev pulseaudio-dev'
missing=
for p in $deps; do apk info -e "$p" >/dev/null 2>&1 || missing="$missing $p"; done
if [ -n "$missing" ]; then
	as_root=
	if [ "$(id -u)" != 0 ]; then
		if command -v doas >/dev/null 2>&1; then as_root=doas
		elif command -v sudo >/dev/null 2>&1; then as_root=sudo
		else die "install the build dependencies first, as root:
  apk add$missing"
		fi
	fi
	echo "==> installing build dependencies, removed again when this script ends:$missing"
	trap 'exit 1' INT TERM
	trap 'echo "==> removing build dependencies"; $as_root apk del -q .rpgm-mkxp-z-build' EXIT
	# shellcheck disable=SC2086
	$as_root apk add -q --virtual .rpgm-mkxp-z-build $missing
fi

if [ ! -d "$src/.git" ]; then
	mkdir -p "$(dirname "$src")"
	git clone --depth 1 --branch "$ref" https://github.com/mkxp-z/mkxp-z.git "$src"
fi
cd "$src"

ft=$src/linux/downloads/$arch/freetype
if [ ! -e "$ft/autogen.sh" ]; then
	mkdir -p "$(dirname "$ft")"
	git clone -q --depth 1 --recurse-submodules --shallow-submodules \
		https://github.com/mkxp-z/freetype2 "$ft"
fi
[ -f "$ft/builds/unix/configure" ] || (cd "$ft" && ./autogen.sh >/dev/null)

echo "==> building bundled dependencies; this takes a long while"
cd "$src/linux"
make PKG_CONFIG_LIBDIR="$PWD/build-$arch/lib/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig"

sdlconf="build-$arch/include/SDL2/SDL_config.h"
if grep -q '#define SDL_VIDEO_DRIVER_WAYLAND 1' "$sdlconf" 2>/dev/null; then
	echo "==> SDL2: Wayland and X11 support"
else
	echo "==> WARNING: SDL2 was built without Wayland; mkxp-z will need Xwayland" >&2
fi

echo "==> building mkxp-z"
cd "$src"
bash -c 'set -e; . linux/vars.sh; [ -d build/meson-info ] || meson setup build; ninja -C build'
bin="build/mkxp-z.$arch"
[ -x "$bin" ] || die "build finished but $src/$bin is missing"

stage=$src/stage
rm -rf "$stage"
mkdir -p "$stage/lib64"
cp "$bin" "$stage/"
cp linux/build-"$arch"/lib/libruby.so.3.1* "$stage/lib64/"
[ -e "$stage/lib64/libruby.so.3.1" ] || die "libruby.so.3.1 was not staged; the build is incomplete"
if command -v patchelf >/dev/null 2>&1; then
	# shellcheck disable=SC2016
	patchelf --set-rpath '$ORIGIN/lib64' "$stage/mkxp-z.$arch" 2>/dev/null || true
fi
cp -r linux/build-"$arch"/lib/ruby/3.1.0 "$stage/stdlib"
cp -r scripts "$stage/"
cp mkxp.json "$stage/mkxp.json.example"
cp assets/LICENSE.mkxp-z-with-https.txt "$stage/" 2>/dev/null || true

mkdir -p "$prefix/lib" "$prefix/bin"
keep=$src/.keep-preload
rm -rf "$keep"
old=$prefix/lib/mkxp-z/scripts/preload
if [ -d "$old" ]; then
	mkdir -p "$keep"
	for f in "$old"/*; do
		[ -e "$f" ] || continue
		[ -e "$stage/scripts/preload/$(basename "$f")" ] || cp -R "$f" "$keep/"
	done
fi
rm -rf "$prefix/lib/mkxp-z"
cp -r "$stage" "$prefix/lib/mkxp-z"
if [ -d "$keep" ] && [ -n "$(ls -A "$keep" 2>/dev/null)" ]; then
	cp -R "$keep"/. "$prefix/lib/mkxp-z/scripts/preload/"
	printf '==> kept %s extra file(s) already in scripts/preload\n' \
		"$(find "$keep" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
fi
rm -rf "$keep"
cat >"$prefix/bin/mkxp-z" <<EOF
#!/bin/sh
exec env SRCDIR="\${SRCDIR:-\$PWD}" \\
	LD_LIBRARY_PATH="$prefix/lib/mkxp-z/lib64\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}" \\
	"$prefix/lib/mkxp-z/mkxp-z.$arch" "\$@"
EOF
chmod 755 "$prefix/bin/mkxp-z"

cat <<EOF

Installed to $prefix/lib/mkxp-z (command: $prefix/bin/mkxp-z).

Run a game:
  cd /path/to/game && mkxp-z          # or: rpgm /path/to/game
  mkxp-z test                         # playtest mode

If a game needs the Ruby standard library (Pokemon Essentials games do), add this to
that game's mkxp.json - mkxp-z reads it from the game folder, not from the install:
  "rubyLoadpath": ["$prefix/lib/mkxp-z/stdlib"]

If it starts with a modal "Could not detect an available audio device" and goes no
further, there is no working sound output; install pipewire-pulse (or pulseaudio), or
run headless with ALSOFT_DRIVERS=null.

Build files are still in $src (several GB); delete that folder to reclaim the space - the
installed copy no longer depends on it.
EOF
