#!/bin/sh
set -eu
cd "$(dirname "$0")"
umask 077
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' 2>/dev/null; then
  exec node scripts/launch.mjs
fi
case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) echo '此系统暂不支持。'; exit 1 ;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64) arch=x64 ;; *) echo '此架构暂不支持。'; exit 1 ;; esac
name="node-v24.22.2-$os-$arch"
base="$PWD/.launcher/runtime"
if [ ! -x "$base/$name/bin/node" ]; then
  mkdir -p "$base"
  work=$(mktemp -d "$base/download.XXXXXX")
  trap 'rm -rf "$work"' EXIT HUP INT TERM
  echo '首次准备 Node 运行环境，需要联网；不会修改系统 Node。'
  curl --fail --location --connect-timeout 20 --max-time 600 "https://nodejs.org/dist/v24.22.2/$name.tar.gz" -o "$work/$name.tar.gz"
  expected=$(awk -v file="$name.tar.gz" '$2==file {print $1}' scripts/runtime-checksums.txt)
  if command -v shasum >/dev/null 2>&1; then actual=$(shasum -a 256 "$work/$name.tar.gz" | awk '{print $1}'); else actual=$(sha256sum "$work/$name.tar.gz" | awk '{print $1}'); fi
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then echo '运行环境校验失败，已停止，请重试。'; exit 1; fi
  tar -xzf "$work/$name.tar.gz" -C "$work"
  # 并发启动时复用已经完成的下载。
  if [ ! -d "$base/$name" ]; then mv "$work/$name" "$base/$name"; fi
fi
if [ -n "${work:-}" ]; then rm -rf "$work"; trap - EXIT HUP INT TERM; fi
PATH="$base/$name/bin:$PATH"; export PATH
exec "$base/$name/bin/node" scripts/launch.mjs
