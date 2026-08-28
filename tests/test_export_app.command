#!/bin/zsh
set -euo pipefail

test_dir=${0:A:h}
project_dir=${test_dir:h}
executable="$project_dir/build/毛球桌宠.app/Contents/MacOS/毛球桌宠"

if [[ ! -x "$executable" ]]; then
	print -u2 '未找到可执行的桌宠成品'
	exit 1
fi

architectures=$(/usr/bin/lipo -archs "$executable")
if [[ "$architectures" != "arm64" ]]; then
	print -u2 "成品必须仅包含苹果芯片程序，当前为：$architectures"
	exit 1
fi

/usr/bin/codesign --verify --deep --strict "$project_dir/build/毛球桌宠.app"
print '苹果芯片成品检查通过'
