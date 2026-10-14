#!/usr/bin/env python3
"""本机无 node 时的兜底检查：扫描 JS/JSON/WXML 的括号与引号配对。
不能替代真正的解释器，只能抓出明显的结构性错误。"""
import json, os, sys

def check_js(path, src):
    errs = []
    pairs = {'}': '{', ']': '[', ')': '('}
    stack = []
    i, n = 0, len(src)
    line = 1
    while i < n:
        c = src[i]
        if c == '\n':
            line += 1; i += 1; continue
        # 注释
        if c == '/' and i + 1 < n:
            if src[i+1] == '/':
                while i < n and src[i] != '\n': i += 1
                continue
            if src[i+1] == '*':
                i += 2
                while i + 1 < n and not (src[i] == '*' and src[i+1] == '/'):
                    if src[i] == '\n': line += 1
                    i += 1
                i += 2; continue
        # 字符串 / 模板串
        if c in '"\'`':
            quote, start_line = c, line
            i += 1
            while i < n:
                if src[i] == '\\': i += 2; continue
                if src[i] == '\n':
                    line += 1
                    if quote != '`':
                        errs.append(f"{path}:{start_line}: 字符串未闭合")
                        break
                if src[i] == quote: break
                i += 1
            i += 1; continue
        if c in '{[(':
            stack.append((c, line)); i += 1; continue
        if c in '}])':
            if not stack:
                errs.append(f"{path}:{line}: 多余的 '{c}'")
            elif stack[-1][0] != pairs[c]:
                o, ol = stack[-1]
                errs.append(f"{path}:{line}: '{c}' 与第 {ol} 行的 '{o}' 不匹配")
                stack.pop()
            else:
                stack.pop()
            i += 1; continue
        i += 1
    for o, ol in stack:
        errs.append(f"{path}:{ol}: '{o}' 未闭合")
    return errs

def check_wxml(path, src):
    """标签配对检查。注意两点：mustache 表达式优先跳过（里面的 < > 是运算符而非标签），
    且只有 '<' 后紧跟字母 / '/' / '!' 才视为标签起始。"""
    errs = []
    void = {'image','input','icon','br','hr','meta','link','import','include','wxs','slot'}
    stack = []
    i, n, line = 0, len(src), 1
    while i < n:
        c = src[i]
        if c == '\n':
            line += 1; i += 1; continue
        if src.startswith('<!--', i):
            j = src.find('-->', i)
            if j < 0:
                errs.append(f"{path}:{line}: 注释未闭合"); break
            line += src[i:j].count('\n'); i = j + 3; continue
        # 先吃掉 {{ ... }}，避免把表达式里的 < 当标签
        if src.startswith('{{', i):
            j = src.find('}}', i)
            if j < 0:
                errs.append(f"{path}:{line}: 表达式 {{{{ 未闭合"); break
            line += src[i:j].count('\n'); i = j + 2; continue
        if c == '<' and i + 1 < n and (src[i+1].isalpha() or src[i+1] in '/!'):
            j = i + 1
            closing = src[j] == '/'
            if closing: j += 1
            name = ''
            while j < n and (src[j].isalnum() or src[j] in '-_:'):
                name += src[j]; j += 1
            # 扫到标签结束的 '>'，跳过属性值里的引号内容
            k, selfclose, q = j, False, None
            while k < n:
                ch = src[k]
                if q:
                    if ch == q: q = None
                elif ch in '"\'': q = ch
                elif ch == '>':
                    selfclose = src[k-1] == '/'
                    break
                if ch == '\n': line += 1
                k += 1
            if name and not closing and not selfclose and name not in void:
                stack.append((name, line))
            elif closing:
                if not stack:
                    errs.append(f"{path}:{line}: 多余的 </{name}>")
                elif stack[-1][0] != name:
                    o, ol = stack[-1]
                    errs.append(f"{path}:{line}: </{name}> 与第 {ol} 行的 <{o}> 不匹配")
                    stack.pop()
                else:
                    stack.pop()
            i = k + 1; continue
        i += 1
    for o, ol in stack:
        errs.append(f"{path}:{ol}: <{o}> 未闭合")
    return errs

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
all_errs, counts = [], {'js':0,'json':0,'wxml':0}
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in ('.git','node_modules')]
    for f in sorted(filenames):
        full = os.path.join(dirpath, f)
        rel = os.path.relpath(full, root)
        try:
            src = open(full, encoding='utf-8').read()
        except Exception:
            continue
        if f.endswith('.js'):
            counts['js'] += 1; all_errs += check_js(rel, src)
        elif f.endswith('.json'):
            counts['json'] += 1
            try: json.loads(src)
            except Exception as e: all_errs.append(f"{rel}: JSON 解析失败 - {e}")
        elif f.endswith('.wxml'):
            counts['wxml'] += 1; all_errs += check_wxml(rel, src)

print(f"扫描：{counts['js']} 个 JS，{counts['json']} 个 JSON，{counts['wxml']} 个 WXML")
if all_errs:
    print(f"\n发现 {len(all_errs)} 处问题：")
    for e in all_errs: print("  " + e)
    sys.exit(1)
print("结构检查通过")
