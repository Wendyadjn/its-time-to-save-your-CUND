#!/bin/sh
cd "$(dirname "$0")" || exit 1
sh ./start.sh
result=$?
if [ "$result" -ne 0 ]; then printf '\n启动失败。查看以上提示，按回车关闭。'; read -r answer; fi
exit "$result"
