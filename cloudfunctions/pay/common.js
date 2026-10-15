/**
 * 云函数公共库（单一事实来源）
 * 这是云函数共享库的唯一源文件，由 scripts/sync-shared.sh 复制到各个云函数目录下的
 * common.js。请只修改本文件，改完运行 bash scripts/sync-shared.sh 同步。
 * 注意：源文件放在仓库根的 shared/ 而非 cloudfunctions/ 下，因为开发者工具会把
 * cloudfunctions/ 的每个子目录都当成云函数上传，放在那里会因缺少 index.js 而失败。
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

/** 集合名常量，避免各处手写字符串拼错 */
const COLL = {
  USERS: 'users',
  CATEGORIES: 'categories',
  PRODUCTS: 'products',
  ORDERS: 'orders',
  RESERVATIONS: 'reservations',
  COUPONS: 'coupons',
  USER_COUPONS: 'user_coupons',
  ADDRESSES: 'addresses',
  SETTINGS: 'settings',
  STOCK_LOGS: 'stock_logs'
}

/** 订单状态机 */
const ORDER_STATUS = {
  PENDING_PAY: 'pending_pay',   // 待付款
  PAID: 'paid',                 // 已付款（待接单/待备货）
  PREPARING: 'preparing',       // 备货中
  DELIVERING: 'delivering',     // 配送中
  PENDING_PICKUP: 'pending_pickup', // 待自提
  COMPLETED: 'completed',       // 已完成
  CANCELLED: 'cancelled',       // 已取消
  REFUNDING: 'refunding',       // 退款中
  REFUNDED: 'refunded'          // 已退款
}

const RESERVATION_STATUS = {
  PENDING: 'pending',       // 待确认（已下单未支付或等商家确认）
  CONFIRMED: 'confirmed',   // 已确认排期
  FULFILLED: 'fulfilled',   // 已交付
  CANCELLED: 'cancelled'
}

/** 会员等级：按累计消费（分）划分，折扣以千分比存储避免浮点 */
const MEMBER_LEVELS = [
  { level: 1, name: '普通会员', minSpent: 0, discount: 1000, pointsRate: 1 },
  { level: 2, name: '银卡会员', minSpent: 50000, discount: 980, pointsRate: 1.2 },
  { level: 3, name: '金卡会员', minSpent: 200000, discount: 950, pointsRate: 1.5 },
  { level: 4, name: '钻石会员', minSpent: 500000, discount: 900, pointsRate: 2 }
]

class BizError extends Error {
  constructor(message, code = 'BIZ_ERROR') {
    super(message)
    this.code = code
  }
}

const ok = (data = null) => ({ success: true, data })
const fail = (message, code = 'BIZ_ERROR') => ({ success: false, code, message })

/**
 * 判断是否「集合不存在」错误。
 * 云数据库在集合未创建时抛 -502005，但不同 SDK 版本的文案不一致（中英文都有），
 * 所以同时匹配错误码和文案，避免漏判。
 */
function isCollectionMissing(err) {
  if (!err) return false
  const code = err.errCode != null ? err.errCode : err.code
  const msg = String(err.errMsg || err.message || '')
  return code === -502005 || /collection not exist|collection does not exist|集合不存在/i.test(msg)
}

/** 统一包装：捕获异常并返回结构化结果，避免前端拿到 500 裸错误 */
function handler(actions) {
  return async (event = {}) => {
    const { action } = event
    const fn = actions[action]
    if (!fn) return fail(`未知操作: ${action}`, 'UNKNOWN_ACTION')
    const ctx = cloud.getWXContext()
    try {
      const data = await fn(event, {
        openid: ctx.OPENID,
        appid: ctx.APPID,
        unionid: ctx.UNIONID,
        ctx
      })
      return ok(data === undefined ? null : data)
    } catch (err) {
      console.error(`[${action}] 执行失败:`, err)
      if (err instanceof BizError) return fail(err.message, err.code)
      // 集合未创建是首次部署最常见的问题，单独给出可操作的提示
      if (isCollectionMissing(err)) {
        return fail('数据库集合尚未创建，请先执行「一键初始化」', 'COLLECTION_MISSING')
      }
      return fail(err.message || '服务异常，请稍后重试', 'INTERNAL_ERROR')
    }
  }
}

/** 取当前用户档案；不存在时按需创建 */
async function getUser(openid, { createIfMissing = false } = {}) {
  if (!openid) throw new BizError('未获取到用户身份', 'NO_AUTH')
  const res = await db.collection(COLL.USERS).where({ _openid: openid }).limit(1).get()
  if (res.data.length) return res.data[0]
  if (!createIfMissing) return null
  const now = new Date()
  const doc = {
    _openid: openid,
    nickName: '微信用户',
    avatarUrl: '',
    phone: '',
    role: 'user',
    memberLevel: 1,
    points: 0,
    totalSpent: 0,
    orderCount: 0,
    createdAt: now,
    updatedAt: now
  }
  const add = await db.collection(COLL.USERS).add({ data: doc })
  return { _id: add._id, ...doc }
}

/** 管理端鉴权：必须是 role=admin 的用户 */
async function requireAdmin(openid) {
  const user = await getUser(openid)
  if (!user || user.role !== 'admin') {
    throw new BizError('无管理权限', 'FORBIDDEN')
  }
  return user
}

function levelOf(totalSpent = 0) {
  let matched = MEMBER_LEVELS[0]
  for (const lv of MEMBER_LEVELS) {
    if (totalSpent >= lv.minSpent) matched = lv
  }
  return matched
}

/** 订单号：年月日时分秒 + 4 位随机，便于商家口头核对 */
function genOrderNo() {
  const d = new Date()
  const p = (n, len = 2) => String(n).padStart(len, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `${stamp}${p(Math.floor(Math.random() * 10000), 4)}`
}

/** 自提码：6 位数字 */
function genPickupCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/** 金额全部以「分」为单位计算，只在展示层转元 */
const fen = {
  /** 按千分比折扣计算，四舍五入到分 */
  applyDiscount(amount, discountPermille) {
    return Math.round((amount * discountPermille) / 1000)
  },
  yuan(amountFen) {
    return (amountFen / 100).toFixed(2)
  }
}

/**
 * 把订单标记为已支付，并顺带发放积分、累计消费、升级会员。
 * 用 where(status=pending_pay) 做乐观锁，保证回调与查询并发时只生效一次。
 */
async function markPaid(order, pay) {
  const now = new Date()
  const r = await db.collection(COLL.ORDERS)
    .where({ _id: order._id, status: ORDER_STATUS.PENDING_PAY })
    .update({
      data: {
        status: ORDER_STATUS.PAID,
        paidAt: now,
        updatedAt: now,
        payment: {
          transactionId: pay.transactionId || '',
          totalFee: pay.totalFee || order.totalAmount,
          timeEnd: pay.timeEnd || '',
          channel: 'wxpay'
        },
        timeline: _.push([{ status: ORDER_STATUS.PAID, at: now, note: '支付成功' }])
      }
    })
  if (r.stats.updated === 0) return false  // 已被其它请求处理过

  // 销量 +N
  for (const item of order.items) {
    await db.collection(COLL.PRODUCTS).doc(item.productId)
      .update({ data: { sales: _.inc(item.quantity) } })
      .catch(err => console.error('更新销量失败', item.productId, err))
  }

  // 会员积分与等级：按实付金额，1 元 = 1 分 × 等级倍率
  try {
    const userRes = await db.collection(COLL.USERS).where({ _openid: order._openid }).limit(1).get()
    const user = userRes.data[0]
    if (user) {
      const newSpent = (user.totalSpent || 0) + order.totalAmount
      const lv = levelOf(newSpent)
      const earned = Math.floor((order.totalAmount / 100) * lv.pointsRate)
      await db.collection(COLL.USERS).doc(user._id).update({
        data: {
          totalSpent: _.inc(order.totalAmount),
          orderCount: _.inc(1),
          points: _.inc(earned),
          memberLevel: lv.level,
          updatedAt: now
        }
      })
    }
  } catch (err) {
    console.error('会员权益更新失败（不影响支付结果）', err)
  }
  return true
}

module.exports = {
  cloud,
  db,
  _,
  $,
  COLL,
  ORDER_STATUS,
  RESERVATION_STATUS,
  MEMBER_LEVELS,
  BizError,
  ok,
  fail,
  handler,
  isCollectionMissing,
  getUser,
  requireAdmin,
  levelOf,
  genOrderNo,
  genPickupCode,
  fen,
  markPaid
}
