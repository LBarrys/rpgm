#!/bin/sh
set -eu

src=$(cd "$(dirname "$0")" && pwd)
prefix=${PREFIX:-/usr/local}
uninstall=

for arg in "$@"; do
	case $arg in
	--user) prefix=$HOME/.local ;;
	--uninstall) uninstall=1 ;;
	*) echo "usage: ./install.sh [--user] [--uninstall]   (default prefix: /usr/local, or \$PREFIX)" >&2; exit 1 ;;
	esac
done

if [ -n "$uninstall" ]; then
	rm -rf "$prefix/lib/rpgm" "$prefix/bin/rpgm"
	echo "Removed rpgm from $prefix. Game data in ~/.local/share/rpgm is kept."
	exit 0
fi

mkdir -p "$prefix/lib/rpgm/lib/rgss" "$prefix/bin"
install -m 755 "$src/rpgm" "$prefix/lib/rpgm/rpgm"
install -m 644 "$src"/lib/*.js "$src"/lib/package.json "$prefix/lib/rpgm/lib/"
install -m 644 "$src"/lib/rgss/*.rb "$prefix/lib/rpgm/lib/rgss/"
ln -sf "$prefix/lib/rpgm/rpgm" "$prefix/bin/rpgm"
echo "Installed rpgm to $prefix."
command -v electron >/dev/null 2>&1 || echo "Next: apk add electron (Alpine edge, testing repository)"
