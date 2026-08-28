#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
project_dir=${script_dir:h}
build_dir="$project_dir/build"
app_path="$build_dir/毛球桌宠.app"
executable="$app_path/Contents/MacOS/毛球桌宠"
arm64_executable="$executable.arm64"

mkdir -p "$build_dir"
/Applications/Godot.app/Contents/MacOS/Godot \
	--headless \
	--path "$project_dir" \
	--export-release "macOS" \
	"$app_path"

/usr/bin/lipo "$executable" -thin arm64 -output "$arm64_executable"
/bin/mv "$arm64_executable" "$executable"
/bin/chmod +x "$executable"
/usr/bin/codesign --force --deep --sign - "$app_path"
