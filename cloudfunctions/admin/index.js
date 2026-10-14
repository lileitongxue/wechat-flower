/**
 * admin —— 商家后台（商品、订单、库存、预约、统计）
 * 每个 action 开头都必须 requireAdmin，鉴权只认数据库里的 role 字段。
 */
const {
  handler, db, _, COLL, ORDER_STATUS, RESERVATION_STATUS,
  BizError, requireAdmin, genPickupCode
} = require('./common')

/** 商家可推进的状态流转图 */
const TRANSITIONS = {
  [ORDER_STATUS.PAID]: [ORDER_STATUS.PREPARING, ORDER_STATUS.REFUNDING],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.DELIVERING, ORDER_STATUS.PENDING_PICKUP, ORDER_STATUS.REFUNDING],
  [ORDER_STATUS.DELIVERING]: [ORDER_STATUS.COMPLETED],
  [ORDER_STATUS.PENDING_PICKUP]: [ORDER_STATUS.COMPLETED],
  [ORDER_STATUS.REFUNDING]: [ORDER_STATUS.REFUNDED, ORDER_STATUS.PAID]
}

const actions = {
  // ---------- 概览 ----------

  /** 工作台：今日订单、销售额、待办、低库存预警 */
  async dashboard(event, { openid }) {
    await requireAdmin(openid)
    const start = new Date(); start.setHours(0, 0, 0, 0)

    const [todayOrders, todayPaid, pendingShip, pendingPickup, lowStock, pendingReservations, totalProducts] =
      await Promise.all([
        db.collection(COLL.ORDERS).where({ createdAt: _.gte(start) }).count().then(r => r.total),
        db.collection(COLL.ORDERS)
          .where({ paidAt: _.gte(start), status: _.nin([ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED]) })
          .get().then(r => r.data.reduce((s, o) => s + (o.totalAmount || 0), 0)),
        db.collection(COLL.ORDERS)
          .where({ status: _.in([ORDER_STATUS.PAID, ORDER_STATUS.PREPARING]) }).count().then(r => r.total),
        db.collection(COLL.ORDERS)
          .where({ status: ORDER_STATUS.PENDING_PICKUP }).count().then(r => r.total),
        db.collection(COLL.PRODUCTS)
          .where({ status: 'on', stock: _.lte(5) })
          .field({ name: true, stock: true, cover: true }).limit(10).get().then(r => r.data),
        db.collection(COLL.RESERVATIONS)
          .where({ status: RESERVATION_STATUS.PENDING }).count().then(r => r.total),
        db.collection(COLL.PRODUCTS).where({ status: 'on' }).count().then(r => r.total)
      ])

    return {
      todayOrders,
      todayRevenue: todayPaid,
      pendingShip,
      pendingPickup,
      pendingReservations,
      totalProducts,
      lowStock
    }
  },

  /** 近 N 天销售趋势 + 热销榜 */
  async stats(event, { openid }) {
    await requireAdmin(openid)
    const days = Math.min(Math.max(Number(event.days) || 7, 1), 30)
    const start = new Date(); start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - (days - 1))

    const res = await db.collection(COLL.ORDERS)
      .where({
        paidAt: _.gte(start),
        status: _.nin([ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED])
      })
      .field({ paidAt: true, totalAmount: true, items: true })
      .limit(1000).get()

    const buckets = new Map()
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86400000)
      buckets.set(dateKey(d), { date: dateKey(d), revenue: 0, orders: 0 })
    }
    const productSales = new Map()
    for (const o of res.data) {
      const key = dateKey(new Date(o.paidAt))
      const b = buckets.get(key)
      if (b) { b.revenue += o.totalAmount || 0; b.orders += 1 }
      for (const it of o.items || []) {
        const cur = productSales.get(it.productId) || { name: it.name, quantity: 0, revenue: 0 }
        cur.quantity += it.quantity
        cur.revenue += it.subtotal || 0
        productSales.set(it.productId, cur)
      }
    }
    const trend = [...buckets.values()]
    const ranking = [...productSales.entries()]
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)

    return {
      trend,
      ranking,
      totalRevenue: trend.reduce((s, b) => s + b.revenue, 0),
      totalOrders: trend.reduce((s, b) => s + b.orders, 0)
    }
  },

  // ---------- 商品 ----------

  /** 商品列表（含下架商品，管理端专用） */
  async products(event, { openid }) {
    await requireAdmin(openid)
    const { status = 'all', categoryId = '', keyword = '', page = 1, pageSize = 20 } = event
    const size = Math.min(Math.max(Number(pageSize) || 20, 1), 50)
    const conds = []
    if (status !== 'all') conds.push({ status })
    if (categoryId) conds.push({ categoryId })
    if (String(keyword).trim()) {
      conds.push({ name: db.RegExp({ regexp: escapeRegExp(String(keyword).trim()), options: 'i' }) })
    }
    const query = conds.length
      ? db.collection(COLL.PRODUCTS).where(_.and(conds))
      : db.collection(COLL.PRODUCTS)
    const [list, total] = await Promise.all([
      query.orderBy('updatedAt', 'desc')
        .skip(Math.max((Number(page) || 1) - 1, 0) * size).limit(size).get().then(r => r.data),
      query.count().then(r => r.total)
    ])
    return { list, total }
  },

  /** 管理端取单个商品（含下架商品），编辑页用 */
  async productDetail(event, { openid }) {
    await requireAdmin(openid)
    const product = await db.collection(COLL.PRODUCTS).doc(event.productId).get()
      .then(r => r.data).catch(() => null)
    if (!product) throw new BizError('商品不存在', 'NOT_FOUND')
    return { product }
  },

  async saveProduct(event, { openid }) {
    await requireAdmin(openid)
    const { productId, product = {} } = event
    const p = normalizeProduct(product)
    const now = new Date()
    if (productId) {
      await db.collection(COLL.PRODUCTS).doc(productId).update({
        data: { ...p, updatedAt: now }
      })
      return { productId }
    }
    const added = await db.collection(COLL.PRODUCTS).add({
      data: { ...p, sales: 0, createdAt: now, updatedAt: now }
    })
    return { productId: added._id }
  },

  /** 上下架切换 */
  async toggleProduct(event, { openid }) {
    await requireAdmin(openid)
    const { productId, status } = event
    if (!['on', 'off'].includes(status)) throw new BizError('状态不合法', 'INVALID_PARAM')
    await db.collection(COLL.PRODUCTS).doc(productId).update({
      data: { status, updatedAt: new Date() }
    })
    return { productId, status }
  },

  async deleteProduct(event, { openid }) {
    await requireAdmin(openid)
    const { productId } = event
    // 有未完结订单的商品不允许物理删除，避免订单详情出现空商品
    const used = await db.collection(COLL.ORDERS)
      .where({
        'items.productId': productId,
        status: _.in([ORDER_STATUS.PENDING_PAY, ORDER_STATUS.PAID, ORDER_STATUS.PREPARING, ORDER_STATUS.DELIVERING, ORDER_STATUS.PENDING_PICKUP])
      }).count().then(r => r.total)
    if (used > 0) throw new BizError('该商品存在进行中的订单，请先下架', 'IN_USE')
    await db.collection(COLL.PRODUCTS).doc(productId).remove()
    return { productId }
  },

  /** 补库存 / 盘点，写入 stock_logs 留痕 */
  async adjustStock(event, { openid }) {
    const admin = await requireAdmin(openid)
    const { productId, delta, absolute, reason = '' } = event
    const now = new Date()
    const prod = await db.collection(COLL.PRODUCTS).doc(productId).get()
      .then(r => r.data).catch(() => null)
    if (!prod) throw new BizError('商品不存在', 'NOT_FOUND')

    let newStock
    if (typeof absolute === 'number') {
      if (absolute < 0) throw new BizError('库存不能为负', 'INVALID_PARAM')
      newStock = Math.floor(absolute)
      await db.collection(COLL.PRODUCTS).doc(productId)
        .update({ data: { stock: newStock, updatedAt: now } })
    } else {
      const d = Math.floor(Number(delta) || 0)
      if (!d) throw new BizError('调整数量不能为 0', 'INVALID_PARAM')
      if (d < 0 && (prod.stock || 0) + d < 0) throw new BizError('扣减后库存为负', 'INVALID_PARAM')
      await db.collection(COLL.PRODUCTS).doc(productId)
        .update({ data: { stock: _.inc(d), updatedAt: now } })
      newStock = (prod.stock || 0) + d
    }

    await db.collection(COLL.STOCK_LOGS).add({
      data: {
        productId,
        productName: prod.name,
        before: prod.stock || 0,
        after: newStock,
        reason: String(reason).slice(0, 100),
        operator: admin.nickName || admin._openid,
        createdAt: now
      }
    }).catch(err => console.error('库存日志写入失败', err))

    return { productId, stock: newStock }
  },

  // ---------- 分类 ----------

  async categories(event, { openid }) {
    await requireAdmin(openid)
    const res = await db.collection(COLL.CATEGORIES).orderBy('sort', 'asc').get()
    return { list: res.data }
  },

  async saveCategory(event, { openid }) {
    await requireAdmin(openid)
    const { categoryId, name, icon = '', sort = 99, enabled = true } = event
    if (!name || !String(name).trim()) throw new BizError('分类名不能为空', 'INVALID_PARAM')
    const data = {
      name: String(name).trim().slice(0, 20),
      icon,
      sort: Number(sort) || 99,
      enabled: !!enabled,
      updatedAt: new Date()
    }
    if (categoryId) {
      await db.collection(COLL.CATEGORIES).doc(categoryId).update({ data })
      return { categoryId }
    }
    const added = await db.collection(COLL.CATEGORIES).add({ data: { ...data, createdAt: new Date() } })
    return { categoryId: added._id }
  },

  // ---------- 订单 ----------

  async orders(event, { openid }) {
    await requireAdmin(openid)
    const { status = 'all', keyword = '', page = 1, pageSize = 15 } = event
    const size = Math.min(Math.max(Number(pageSize) || 15, 1), 50)
    const conds = []
    if (status !== 'all') {
      conds.push(status === 'receiving'
        ? { status: _.in([ORDER_STATUS.DELIVERING, ORDER_STATUS.PENDING_PICKUP]) }
        : { status })
    }
    if (String(keyword).trim()) {
      const reg = db.RegExp({ regexp: escapeRegExp(String(keyword).trim()), options: 'i' })
      conds.push(_.or([{ orderNo: reg }, { contactName: reg }, { contactPhone: reg }]))
    }
    const query = conds.length
      ? db.collection(COLL.ORDERS).where(_.and(conds))
      : db.collection(COLL.ORDERS)
    const [list, total] = await Promise.all([
      query.orderBy('createdAt', 'desc')
        .skip(Math.max((Number(page) || 1) - 1, 0) * size).limit(size).get().then(r => r.data),
      query.count().then(r => r.total)
    ])
    return { list, total }
  },

  async orderDetail(event, { openid }) {
    await requireAdmin(openid)
    const order = await db.collection(COLL.ORDERS).doc(event.orderId).get()
      .then(r => r.data).catch(() => null)
    if (!order) throw new BizError('订单不存在', 'NOT_FOUND')
    return { order, allowedNext: TRANSITIONS[order.status] || [] }
  },

  /**
   * 推进订单状态。转为 refunded 时归还库存与优惠券。
   * 配送中可带快递/配送员信息。
   */
  async updateOrderStatus(event, { openid }) {
    const admin = await requireAdmin(openid)
    const { orderId, status, note = '', expressNo = '', courierName = '', courierPhone = '' } = event
    const order = await db.collection(COLL.ORDERS).doc(orderId).get()
      .then(r => r.data).catch(() => null)
    if (!order) throw new BizError('订单不存在', 'NOT_FOUND')
    const allowed = TRANSITIONS[order.status] || []
    if (!allowed.includes(status)) {
      throw new BizError(`不能从「${order.status}」变更为「${status}」`, 'INVALID_TRANSITION')
    }

    const now = new Date()
    const patch = {
      status,
      updatedAt: now,
      timeline: _.push([{ status, at: now, note: note || `商家操作：${status}`, operator: admin.nickName || '商家' }])
    }
    if (status === ORDER_STATUS.DELIVERING) {
      patch.expressNo = String(expressNo).slice(0, 40)
      patch.courierName = String(courierName).slice(0, 20)
      patch.courierPhone = String(courierPhone).slice(0, 20)
      patch.shippedAt = now
    }
    if (status === ORDER_STATUS.PENDING_PICKUP && !order.pickupCode) {
      patch.pickupCode = genPickupCode()
    }
    if (status === ORDER_STATUS.COMPLETED) patch.completedAt = now

    const tx = await db.startTransaction()
    try {
      const r = await tx.collection(COLL.ORDERS)
        .where({ _id: orderId, status: order.status })
        .update({ data: patch })
      if (r.stats.updated === 0) throw new BizError('订单状态已变更，请刷新', 'CONFLICT')

      // 退款完成：归还库存、退回优惠券、冲减会员累计
      if (status === ORDER_STATUS.REFUNDED) {
        for (const item of order.items) {
          await tx.collection(COLL.PRODUCTS).doc(item.productId)
            .update({ data: { stock: _.inc(item.quantity), sales: _.inc(-item.quantity), updatedAt: now } })
            .catch(() => {})
        }
        if (order.couponId) {
          await tx.collection(COLL.USER_COUPONS)
            .where({ _id: order.couponId })
            .update({ data: { status: 'unused', usedAt: null, orderNo: '' } })
            .catch(() => {})
        }
        if (order.paidAt) {
          await tx.collection(COLL.USERS).where({ _openid: order._openid })
            .update({ data: { totalSpent: _.inc(-order.totalAmount), orderCount: _.inc(-1) } })
            .catch(() => {})
        }
      }
      await tx.commit()
    } catch (err) {
      await tx.rollback().catch(() => {})
      throw err
    }
    return { orderId, status }
  },

  /** 自提核销：输入 6 位自提码完成交付 */
  async verifyPickup(event, { openid }) {
    const admin = await requireAdmin(openid)
    const { pickupCode } = event
    if (!/^\d{6}$/.test(String(pickupCode || ''))) {
      throw new BizError('自提码应为 6 位数字', 'INVALID_PARAM')
    }
    const res = await db.collection(COLL.ORDERS)
      .where({
        pickupCode: String(pickupCode),
        status: _.in([ORDER_STATUS.PAID, ORDER_STATUS.PREPARING, ORDER_STATUS.PENDING_PICKUP])
      }).limit(1).get()
    const order = res.data[0]
    if (!order) throw new BizError('自提码无效或订单已核销', 'NOT_FOUND')

    const now = new Date()
    const r = await db.collection(COLL.ORDERS)
      .where({ _id: order._id, status: order.status })
      .update({
        data: {
          status: ORDER_STATUS.COMPLETED,
          pickupVerified: true,
          completedAt: now,
          updatedAt: now,
          timeline: _.push([{ status: ORDER_STATUS.COMPLETED, at: now, note: '自提核销', operator: admin.nickName || '商家' }])
        }
      })
    if (r.stats.updated === 0) throw new BizError('订单状态已变更', 'CONFLICT')
    return { orderNo: order.orderNo, contactName: order.contactName, items: order.items }
  },

  // ---------- 预约 ----------

  async reservations(event, { openid }) {
    await requireAdmin(openid)
    const { status = 'all', date = '', page = 1, pageSize = 15 } = event
    const size = Math.min(Math.max(Number(pageSize) || 15, 1), 50)
    const where = {}
    if (status !== 'all') where.status = status
    if (date) where.deliveryDate = date
    const query = db.collection(COLL.RESERVATIONS).where(where)
    const [list, total] = await Promise.all([
      query.orderBy('deliveryDate', 'asc')
        .skip(Math.max((Number(page) || 1) - 1, 0) * size).limit(size).get().then(r => r.data),
      query.count().then(r => r.total)
    ])
    return { list, total }
  },

  /** 确认排期 / 标记交付 / 取消 */
  async updateReservation(event, { openid }) {
    const admin = await requireAdmin(openid)
    const { reservationId, status, note = '' } = event
    const valid = [RESERVATION_STATUS.CONFIRMED, RESERVATION_STATUS.FULFILLED, RESERVATION_STATUS.CANCELLED]
    if (!valid.includes(status)) throw new BizError('状态不合法', 'INVALID_PARAM')
    const r0 = await db.collection(COLL.RESERVATIONS).doc(reservationId).get()
      .then(r => r.data).catch(() => null)
    if (!r0) throw new BizError('预约单不存在', 'NOT_FOUND')
    const now = new Date()
    const r = await db.collection(COLL.RESERVATIONS)
      .where({ _id: reservationId, status: r0.status })
      .update({
        data: {
          status,
          updatedAt: now,
          timeline: _.push([{ status, at: now, note: note || `商家操作：${status}`, operator: admin.nickName || '商家' }])
        }
      })
    if (r.stats.updated === 0) throw new BizError('状态已变更，请刷新', 'CONFLICT')
    return { reservationId, status }
  },

  // ---------- 店铺设置 ----------

  async saveShopInfo(event, { openid }) {
    await requireAdmin(openid)
    const { shop = {} } = event
    const data = {
      name: String(shop.name || '').slice(0, 40),
      phone: String(shop.phone || '').slice(0, 20),
      address: String(shop.address || '').slice(0, 120),
      location: shop.location || null,
      openTime: shop.openTime || '09:00',
      closeTime: shop.closeTime || '21:00',
      deliveryFee: Math.max(Number(shop.deliveryFee) || 0, 0),
      freeDeliveryThreshold: Math.max(Number(shop.freeDeliveryThreshold) || 0, 0),
      deliveryRange: String(shop.deliveryRange || '').slice(0, 60),
      notice: String(shop.notice || '').slice(0, 200),
      timeRanges: Array.isArray(shop.timeRanges) ? shop.timeRanges.slice(0, 8) : undefined,
      updatedAt: new Date()
    }
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k])
    await db.collection(COLL.SETTINGS).doc('shop').set({ data }).catch(async () => {
      await db.collection(COLL.SETTINGS).doc('shop').update({ data })
    })
    return { ok: true }
  },

  /** 轮播图设置 */
  async saveBanners(event, { openid }) {
    await requireAdmin(openid)
    const { items = [] } = event
    const data = {
      items: items.slice(0, 10).map(i => ({
        image: String(i.image || ''),
        link: String(i.link || ''),
        title: String(i.title || '').slice(0, 40)
      })),
      updatedAt: new Date()
    }
    await db.collection(COLL.SETTINGS).doc('banners').set({ data })
    return { ok: true }
  }
}

/** 过滤并归一化商品字段，杜绝前端写入任意字段 */
function normalizeProduct(p) {
  const price = Math.round(Number(p.price) || 0)
  if (price <= 0) throw new BizError('售价必须大于 0', 'INVALID_PARAM')
  if (!p.name || !String(p.name).trim()) throw new BizError('商品名不能为空', 'INVALID_PARAM')
  return {
    name: String(p.name).trim().slice(0, 50),
    subtitle: String(p.subtitle || '').slice(0, 60),
    categoryId: String(p.categoryId || ''),
    cover: String(p.cover || ''),
    images: Array.isArray(p.images) ? p.images.slice(0, 9).map(String) : [],
    price,
    originalPrice: Math.max(Math.round(Number(p.originalPrice) || 0), 0),
    stock: Math.max(Math.floor(Number(p.stock) || 0), 0),
    unit: String(p.unit || '束').slice(0, 6),
    status: p.status === 'off' ? 'off' : 'on',
    isHot: !!p.isHot,
    supportReservation: p.supportReservation !== false,
    sort: Number(p.sort) || 99,
    tags: Array.isArray(p.tags) ? p.tags.slice(0, 6).map(t => String(t).slice(0, 10)) : [],
    description: String(p.description || '').slice(0, 1000),
    material: String(p.material || '').slice(0, 200),
    packaging: String(p.packaging || '').slice(0, 100),
    flowerLanguage: String(p.flowerLanguage || '').slice(0, 100),
    notice: String(p.notice || '').slice(0, 200)
  }
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

exports.main = handler(actions)
