#!/usr/bin/env python3
"""项目一致性检查：路由注册、组件引用、tabBar 资源、云函数 action 调用是否匹配。
本机无 node 时作为提交前的静态兜底，不能替代微信开发者工具的真实编译。"""
import os, re, json, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MP = os.path.join(ROOT, 'miniprogram')
CF = os.path.join(ROOT, 'cloudfunctions')
errs = []

def rel(p):
    return os.path.relpath(p, ROOT)

def strip_tpl(u):
    """剥掉模板字符串里的 ${...}，支持内部嵌套花括号"""
    out, i = '', 0
    while i < len(u):
        if u.startswith('${', i):
            depth, i = 1, i + 2
            while i < len(u) and depth:
                if u[i] == '{': depth += 1
                elif u[i] == '}': depth -= 1
                i += 1
        else:
            out += u[i]; i += 1
    return out

# ---------- 1. 页面注册与文件完整性 ----------
app = json.load(open(os.path.join(MP, 'app.json'), encoding='utf-8'))
declared = set(app['pages'])
tabs = {t['pagePath'] for t in app['tabBar']['list']}

for page in sorted(declared):
    for ext in ('.js', '.json', '.wxml', '.wxss'):
        if not os.path.exists(os.path.join(MP, page + ext)):
            errs.append(f"app.json 声明了 {page}，但缺少 {page + ext}")

for dirpath, _, files in os.walk(os.path.join(MP, 'pages')):
    for f in files:
        if f.endswith('.js'):
            route = os.path.relpath(os.path.join(dirpath, f), MP)[:-3]
            if route not in declared:
                errs.append(f"{route} 存在于磁盘但未在 app.json 注册")

# ---------- 2. 跳转目标 ----------
for dirpath, dirnames, files in os.walk(MP):
    dirnames[:] = [d for d in dirnames if d != 'node_modules']
    for f in files:
        if not f.endswith('.js'): continue
        p = os.path.join(dirpath, f)
        src = open(p, encoding='utf-8').read()
        for m in re.finditer(r"wx\.(navigateTo|redirectTo|switchTab|reLaunch)\(\{\s*url:\s*([`'\"])(.*?)\2", src, re.S):
            api_name = m.group(1)
            url = strip_tpl(m.group(3)).split('?')[0].lstrip('/')
            if not url: continue
            if url not in declared:
                errs.append(f"{rel(p)}: 跳转到未注册页面 {url}")
            elif api_name in ('navigateTo', 'redirectTo') and url in tabs:
                errs.append(f"{rel(p)}: {api_name} 不能跳转 tabBar 页 {url}，应用 switchTab")
            elif api_name == 'switchTab' and url not in tabs:
                errs.append(f"{rel(p)}: switchTab 目标 {url} 不是 tabBar 页")

# ---------- 3. 组件引用与 tabBar 图标 ----------
for dirpath, dirnames, files in os.walk(MP):
    dirnames[:] = [d for d in dirnames if d != 'node_modules']
    for f in files:
        if not f.endswith('.json') or f == 'app.json': continue
        p = os.path.join(dirpath, f)
        try:
            cfg = json.load(open(p, encoding='utf-8'))
        except Exception as e:
            errs.append(f"{rel(p)}: JSON 解析失败 - {e}"); continue
        for name, path in (cfg.get('usingComponents') or {}).items():
            target = os.path.join(MP, path.lstrip('/')) if path.startswith('/') \
                     else os.path.normpath(os.path.join(dirpath, path))
            if not os.path.exists(target + '.wxml'):
                errs.append(f"{rel(p)}: 组件 {name} -> {path} 不存在")

for t in app['tabBar']['list']:
    for k in ('iconPath', 'selectedIconPath'):
        if t.get(k) and not os.path.exists(os.path.join(MP, t[k])):
            errs.append(f"tabBar 图标缺失: {t[k]}")

# ---------- 4. 云函数 action 调用 ----------
impl = {}
for d in sorted(os.listdir(CF)):
    idx = os.path.join(CF, d, 'index.js')
    if d == '_shared' or not os.path.exists(idx): continue
    src = open(idx, encoding='utf-8').read()
    m = re.search(r'const actions = \{(.*?)\n\}\n', src, re.S)
    impl[d] = set(re.findall(r'^  (?:async )?(\w+)\s*\(', m.group(1), re.M)) if m else set()

call_count = 0
for dirpath, dirnames, files in os.walk(MP):
    dirnames[:] = [d for d in dirnames if d != 'node_modules']
    for f in files:
        if not f.endswith('.js'): continue
        p = os.path.join(dirpath, f)
        src = open(p, encoding='utf-8').read()
        pairs = re.findall(r"api\.(\w+)\('(\w+)'", src) + re.findall(r"api\.call\('(\w+)',\s*'(\w+)'", src)
        for fn, action in pairs:
            if fn in ('call', 'uploadImage'): continue
            call_count += 1
            if fn not in impl:
                errs.append(f"{rel(p)}: 云函数 {fn} 不存在")
            elif action not in impl[fn]:
                errs.append(f"{rel(p)}: {fn}.{action} 未实现")

# ---------- 5. 云函数依赖与共享库同步 ----------
shared = os.path.join(CF, '_shared', 'common.js')
shared_src = open(shared, encoding='utf-8').read() if os.path.exists(shared) else None
for d in sorted(impl):
    if not os.path.exists(os.path.join(CF, d, 'package.json')):
        errs.append(f"cloudfunctions/{d}: 缺少 package.json")
    copy = os.path.join(CF, d, 'common.js')
    if not os.path.exists(copy):
        errs.append(f"cloudfunctions/{d}: 缺少 common.js，请运行 scripts/sync-shared.sh")
    elif shared_src and open(copy, encoding='utf-8').read() != shared_src:
        errs.append(f"cloudfunctions/{d}/common.js 与 _shared 不一致，请运行 scripts/sync-shared.sh")

print(f"页面 {len(declared)} 个（tabBar {len(tabs)}），云函数 {len(impl)} 个，前端调用 {call_count} 处")
if errs:
    print(f"\n发现 {len(errs)} 处问题：")
    for e in sorted(set(errs)):
        print("  " + e)
    sys.exit(1)
print("项目一致性检查通过")
