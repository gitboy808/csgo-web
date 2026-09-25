#!/bin/zsh -l
set -e
cd "$(dirname "$0")"
if [[ ! -f public/assets/source2/map.json ]]; then
  print "缺少原始地图运行资源，请查看 docs/LOCAL_CS2.md。"
  read "?按回车退出。"
  exit 1
fi
print "Dust II 原图本地版：http://localhost:5173/"
pnpm dev --host 127.0.0.1 --strictPort
