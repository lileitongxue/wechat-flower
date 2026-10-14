#!/usr/bin/env bash
# 把 cloudfunctions/_shared/common.js 同步到每个云函数目录。
# 云函数部署时各自独立打包，无法跨目录 require，因此用复制保持单一事实来源。
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="cloudfunctions/_shared/common.js"
[ -f "$SRC" ] || { echo "找不到 $SRC"; exit 1; }
count=0
for dir in cloudfunctions/*/; do
  name="$(basename "$dir")"
  if [ "$name" = "_shared" ]; then continue; fi
  [ -f "$dir/index.js" ] || continue
  cp "$SRC" "$dir/common.js"
  count=$((count+1))
done
echo "已同步 common.js 到 $count 个云函数"
