#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
project_dir=${script_dir:h}

exec /Applications/Godot.app/Contents/MacOS/Godot --path "$project_dir"
