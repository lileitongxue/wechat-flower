#!/usr/bin/env bash
# 把 shared/common.js 同步到每个云函数目录。
#
# 为什么要复制：云函数各自独立打包上传，无法跨目录 require，所以每个函数目录下
# 都需要一份副本。源文件放在仓库根的 shared/ 而非 cloudfunctions/ 下，是因为
# 开发者工具会把 cloudfunctionRoot 下的每个子目录都当成云函数去上传，
# 放在那里会导致上传失败。
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="shared/common.js"
[ -f "$SRC" ] || { echo "找不到 $SRC"; exit 1; }
count=0
for dir in cloudfunctions/*/; do
  [ -f "$dir/index.js" ] || continue
  cp "$SRC" "$dir/common.js"
  count=$((count+1))
done
echo "已同步 common.js 到 $count 个云函数"
