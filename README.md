# 花知道 · 微信花店小程序

商城 + 预约综合型花店小程序，基于**微信云开发**（云函数 + 云数据库 + 云存储），
原生小程序前端，管理后台内置在小程序中。

## 功能

| 模块 | 能力 |
| --- | --- |
| 🏪 商品展示 | 首页聚合、分类筛选、关键词搜索、商品详情、相关推荐 |
| 🛒 在线下单 | 购物车、下单结算、**微信支付**、订单流转、再来一单 |
| 🚚 配送 / 自提 | 配送到家（含运费规则）、到店自提（6 位自提码核销） |
| 💝 会员体系 | 4 级会员、自动折扣、积分、优惠券（领券 / 核销 / 满减 / 折扣） |
| 📅 预约订花 | 节日预购、90 天内排期、定金 / 全款、商家确认排期 |
| 🛠 商家后台 | 工作台、商品与库存、订单处理、预约排期、经营统计 |
| 🔐 登录 | 微信授权一键登录（openid 由云开发注入）、头像昵称、手机号绑定 |

## 技术栈

- **前端**：原生小程序（WXML / WXSS / JS），无构建步骤，无第三方依赖
- **后端**：微信云开发云函数（Node.js）+ 云数据库（文档型）+ 云存储
- **支付**：云调用 `cloudPay.unifiedOrder`，回调由 `payCallback` 云函数接收

## 目录结构

```
├── miniprogram/              小程序前端
│   ├── app.js/json/wxss      全局入口、路由、设计令牌
│   ├── utils/
│   │   ├── api.js            云函数调用统一封装（错误归一化）
│   │   ├── cart.js           购物车本地存储
│   │   └── util.js           金额、日期、提示工具
│   ├── components/           product-card / empty-state / step-counter
│   └── pages/
│       ├── index, category, search, product-detail
│       ├── cart, order-confirm, order-list, order-detail
│       ├── reservation-create, reservation-list
│       ├── user, member, coupon, address-list, address-edit, shop-info
│       └── admin/            商家管理台（6 个页面）
├── shared/
│   └── common.js             ★ 云函数共享库的唯一源文件
├── cloudfunctions/           云函数（每个子目录都会被当成一个云函数上传）
│   ├── login/                授权登录、资料、手机号
│   ├── shop/                 商品、分类、店铺、购物车校验
│   ├── order/                下单（事务扣库存）、查单、取消、收货
│   ├── pay/                  统一下单、支付结果查询
│   ├── payCallback/          支付回调（幂等 + 金额校验）
│   ├── reservation/          预约单
│   ├── member/               会员、优惠券、地址
│   ├── admin/                后台管理（含鉴权）
│   └── seed/                 初始化管理员与示例数据
├── scripts/
│   ├── sync-shared.sh        同步 shared/common.js 到各云函数
│   ├── check-syntax.py       JS/JSON/WXML 结构检查
│   └── check-project.py      路由、组件、action 一致性检查
└── docs/DEPLOY.md            部署与配置详细步骤
```

## 快速开始

```bash
# 1. 用微信开发者工具「导入项目」，选择本目录（appid 已配置为 wx8bb4bce9e836be02）
# 2. 开通云开发，创建环境
# 3. 右键 cloudfunctions 下每个函数 → 上传并部署（云端安装依赖），共 9 个
# 4. 点击编译运行 → 进入「我的」→ 点「🔧 一键初始化」
#    （自动创建 10 个集合 + 设为店主 + 灌入示例数据）
```

第 4 步是首次运行的必经环节：**小程序启动时要读 `users` 集合，集合不存在登录就会失败**，
所以初始化入口会在「我的」页以醒目提示条的形式出现。

详细步骤见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 开发约定

- **金额一律以「分」为整数存储和计算**，仅在展示层用 `util.yuan()` 转元，杜绝浮点误差。
- **价格与库存以服务端为准**：前端传来的价格只用于界面即时反馈，`order.create` 会用数据库里的最新数据重算。
- **库存扣减走数据库事务**，并用 `where({ stock: _.gte(qty) })` 做条件更新，避免超卖。
- **状态流转用乐观锁**：`where({ _id, status: 当前状态 }).update(...)`，`updated === 0` 即表示并发冲突。
- **共享库只改 `shared/common.js`**，改完运行 `bash scripts/sync-shared.sh` 同步到各云函数。
  源文件特意放在仓库根目录而非 `cloudfunctions/` 下——开发者工具会把 `cloudfunctions/`
  的每个子目录都当成云函数上传，放在那里会因缺少 `index.js` 而上传失败。

## 本地检查

本仓库不依赖 node 也能做静态检查：

```bash
python3 scripts/check-syntax.py    # JS/JSON/WXML 结构
python3 scripts/check-project.py   # 路由 / 组件 / 云函数 action 一致性
```

两者都是兜底手段，**真实编译与运行仍以微信开发者工具为准**。
