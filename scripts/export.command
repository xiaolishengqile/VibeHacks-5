#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
project_dir=${script_dir:h}
build_dir="$project_dir/build"

mkdir -p "$build_dir"
exec /Applications/Godot.app/Contents/MacOS/Godot \
	--headless \
	--path "$project_dir" \
	--export-release "macOS" \
	"$build_dir/毛球桌宠.app"
