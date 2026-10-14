/**
 * order —— 下单、查单、取消、确认收货、自提核销
 *
 * 金额一律以「分」为单位；所有价格与库存以服务端数据库为准，
 * 前端传来的价格只用于比对提示，绝不参与计算。
 */
const {
  handler, db, _, COLL, ORDER_STATUS, BizError,
  getUser, levelOf, genOrderNo, genPickupCode
} = require('./common')

/** 用户可见的状态流转白名单 */
const CANCELLABLE = [ORDER_STATUS.PENDING_PAY, ORDER_STATUS.PAID, ORDER_STATUS.PREPARING]

const actions = {
  /**
   * 创建订单：校验库存 → 计算金额 → 事务内扣库存并写单。
   * 返回订单号与应付金额，由前端调 pay 云函数发起支付。
   */
  async create(event, { openid }) {
    const {
      items = [],
      deliveryType = 'delivery',   // delivery | pickup
      addressId = '',
      pickupTime = '',
      remark = '',
      couponId = '',
      contactName = '',
      contactPhone = '',
      greetingCard = ''
    } = event

    if (!Array.isArray(items) || !items.length) throw new BizError('购物车为空', 'EMPTY_CART')
    if (items.length > 30) throw new BizError('单笔订单商品种类过多', 'TOO_MANY_ITEMS')
    if (!['delivery', 'pickup'].includes(deliveryType)) {
      throw new BizError('配送方式不合法', 'INVALID_PARAM')
    }

    const user = await getUser(openid, { createIfMissing: true })
    const level = levelOf(user.totalSpent || 0)

    // 1. 取最新商品数据，校验上架状态与库存
    const ids = [...new Set(items.map(i => i.productId).filter(Boolean))]
    if (!ids.length) throw new BizError('商品参数缺失', 'INVALID_PARAM')
    const prodRes = await db.collection(COLL.PRODUCTS).where({ _id: _.in(ids) }).get()
    const prodMap = new Map(prodRes.data.map(p => [p._id, p]))

    const orderItems = []
    for (const it of items) {
      const p = prodMap.get(it.productId)
      if (!p) throw new BizError('部分商品已下架，请刷新购物车', 'PRODUCT_GONE')
      if (p.status !== 'on') throw new BizError(`「${p.name}」已下架`, 'PRODUCT_OFF')
      const qty = Math.floor(Number(it.quantity) || 0)
      if (qty <= 0) throw new BizError('商品数量不合法', 'INVALID_QTY')
      if (qty > 99) throw new BizError('单品数量上限 99', 'INVALID_QTY')
      if ((p.stock || 0) < qty) throw new BizError(`「${p.name}」库存不足（剩 ${p.stock || 0}）`, 'OUT_OF_STOCK')
      const unitPrice = level.discount < 1000
        ? Math.round((p.price * level.discount) / 1000)
        : p.price
      orderItems.push({
        productId: p._id,
        name: p.name,
        cover: p.cover || '',
        unit: p.unit || '束',
        originalUnitPrice: p.price,
        unitPrice,
        quantity: qty,
        subtotal: unitPrice * qty
      })
    }

    // 2. 金额计算：商品小计 → 运费 → 优惠券
    const goodsAmount = orderItems.reduce((s, i) => s + i.subtotal, 0)
    const shop = await db.collection(COLL.SETTINGS).doc('shop').get()
      .then(r => r.data).catch(() => ({}))
    const deliveryFee = deliveryType === 'pickup'
      ? 0
      : (goodsAmount >= (shop.freeDeliveryThreshold ?? 19900) ? 0 : (shop.deliveryFee ?? 800))

    let couponDiscount = 0
    let usedCoupon = null
    if (couponId) {
      usedCoupon = await loadUsableCoupon(openid, couponId, goodsAmount)
      couponDiscount = usedCoupon.type === 'discount'
        ? Math.round(goodsAmount * (1000 - usedCoupon.value) / 1000)
        : Math.min(usedCoupon.value, goodsAmount)
    }

    const totalAmount = Math.max(goodsAmount + deliveryFee - couponDiscount, 1)

    // 3. 收货/自提信息
    let address = null
    if (deliveryType === 'delivery') {
      if (!addressId) throw new BizError('请选择收货地址', 'NO_ADDRESS')
      const addrRes = await db.collection(COLL.ADDRESSES).doc(addressId).get().catch(() => null)
      const a = addrRes?.data
      if (!a || a._openid !== openid) throw new BizError('收货地址无效', 'NO_ADDRESS')
      address = {
        name: a.name, phone: a.phone, province: a.province, city: a.city,
        district: a.district, detail: a.detail,
        location: a.location || null
      }
    } else if (!pickupTime) {
      throw new BizError('请选择自提时间', 'INVALID_PARAM')
    }

    const orderNo = genOrderNo()
    const now = new Date()
    const orderDoc = {
      orderNo,
      _openid: openid,
      userId: user._id,
      items: orderItems,
      goodsAmount,
      deliveryFee,
      couponDiscount,
      totalAmount,
      memberLevel: level.level,
      memberDiscount: level.discount,
      status: ORDER_STATUS.PENDING_PAY,
      deliveryType,
      address,
      pickupTime: deliveryType === 'pickup' ? pickupTime : '',
      pickupCode: deliveryType === 'pickup' ? genPickupCode() : '',
      pickupVerified: false,
      contactName: String(contactName || address?.name || user.nickName || '').slice(0, 20),
      contactPhone: String(contactPhone || address?.phone || user.phone || '').slice(0, 20),
      remark: String(remark || '').slice(0, 200),
      greetingCard: String(greetingCard || '').slice(0, 100),
      couponId: usedCoupon ? couponId : '',
      source: 'mall',
      payment: null,
      timeline: [{ status: ORDER_STATUS.PENDING_PAY, at: now, note: '订单已创建' }],
      createdAt: now,
      updatedAt: now
    }

    // 4. 事务：扣库存 + 核销优惠券 + 写订单，任一失败全部回滚
    const tx = await db.startTransaction()
    try {
      for (const item of orderItems) {
        const r = await tx.collection(COLL.PRODUCTS)
          .where({ _id: item.productId, stock: _.gte(item.quantity), status: 'on' })
          .update({ data: { stock: _.inc(-item.quantity), updatedAt: now } })
        if (r.stats.updated === 0) {
          throw new BizError(`「${item.name}」库存不足，请调整数量`, 'OUT_OF_STOCK')
        }
      }
      if (usedCoupon) {
        const r = await tx.collection(COLL.USER_COUPONS)
          .where({ _id: couponId, _openid: openid, status: 'unused' })
          .update({ data: { status: 'used', usedAt: now, orderNo } })
        if (r.stats.updated === 0) throw new BizError('优惠券已被使用', 'COUPON_USED')
      }
      const added = await tx.collection(COLL.ORDERS).add({ data: orderDoc })
      await tx.commit()
      return {
        orderId: added._id,
        orderNo,
        totalAmount,
        goodsAmount,
        deliveryFee,
        couponDiscount
      }
    } catch (err) {
      await tx.rollback().catch(() => {})
      throw err
    }
  },

  /** 我的订单列表，支持按状态筛选 */
  async list(event, { openid }) {
    const { status = 'all', page = 1, pageSize = 10 } = event
    const size = Math.min(Math.max(Number(pageSize) || 10, 1), 30)
    const skip = Math.max((Number(page) || 1) - 1, 0) * size
    const where = { _openid: openid }
    if (status && status !== 'all') {
      // 「待收货」聚合配送中与待自提两种
      where.status = status === 'receiving'
        ? _.in([ORDER_STATUS.DELIVERING, ORDER_STATUS.PENDING_PICKUP])
        : status
    }
    const query = db.collection(COLL.ORDERS).where(where)
    const [list, total] = await Promise.all([
      query.orderBy('createdAt', 'desc').skip(skip).limit(size).get().then(r => r.data),
      query.count().then(r => r.total)
    ])
    return { list: list.map(shapeOrder), total, page: Number(page) || 1, pageSize: size }
  },

  async detail(event, { openid }) {
    const { orderId, orderNo } = event
    const order = await findOwnOrder({ orderId, orderNo, openid })
    return { order: shapeOrder(order, { detail: true }) }
  },

  /** 各状态待办数量，用于「我的」页角标 */
  async counters(event, { openid }) {
    const statuses = [
      ORDER_STATUS.PENDING_PAY,
      ORDER_STATUS.PAID,
      ORDER_STATUS.PREPARING
    ]
    const [pendingPay, paid, preparing, receiving] = await Promise.all([
      ...statuses.map(s => db.collection(COLL.ORDERS)
        .where({ _openid: openid, status: s }).count().then(r => r.total)),
      db.collection(COLL.ORDERS).where({
        _openid: openid,
        status: _.in([ORDER_STATUS.DELIVERING, ORDER_STATUS.PENDING_PICKUP])
      }).count().then(r => r.total)
    ])
    return { pendingPay, paid, preparing, receiving }
  },

  /** 用户取消订单：回滚库存与优惠券；已支付的转为退款中由商家处理 */
  async cancel(event, { openid }) {
    const { orderId, reason = '' } = event
    const order = await findOwnOrder({ orderId, openid })
    if (!CANCELLABLE.includes(order.status)) {
      throw new BizError('当前订单状态不可取消', 'INVALID_STATUS')
    }
    const paid = order.status !== ORDER_STATUS.PENDING_PAY
    const now = new Date()
    const nextStatus = paid ? ORDER_STATUS.REFUNDING : ORDER_STATUS.CANCELLED

    const tx = await db.startTransaction()
    try {
      const r = await tx.collection(COLL.ORDERS)
        .where({ _id: order._id, status: order.status })
        .update({
          data: {
            status: nextStatus,
            cancelReason: String(reason || '').slice(0, 100),
            cancelledAt: now,
            updatedAt: now,
            timeline: _.push([{ status: nextStatus, at: now, note: paid ? '用户申请退款' : '用户取消订单' }])
          }
        })
      if (r.stats.updated === 0) throw new BizError('订单状态已变更，请刷新', 'CONFLICT')

      // 未支付才立即归还库存；已支付的等退款完成后由 admin 归还
      if (!paid) {
        for (const item of order.items) {
          await tx.collection(COLL.PRODUCTS).doc(item.productId)
            .update({ data: { stock: _.inc(item.quantity), updatedAt: now } })
        }
        if (order.couponId) {
          await tx.collection(COLL.USER_COUPONS)
            .where({ _id: order.couponId, _openid: openid })
            .update({ data: { status: 'unused', usedAt: null, orderNo: '' } })
        }
      }
      await tx.commit()
    } catch (err) {
      await tx.rollback().catch(() => {})
      throw err
    }
    return { status: nextStatus }
  },

  /** 确认收货 */
  async confirm(event, { openid }) {
    const { orderId } = event
    const order = await findOwnOrder({ orderId, openid })
    if (![ORDER_STATUS.DELIVERING, ORDER_STATUS.PENDING_PICKUP].includes(order.status)) {
      throw new BizError('当前状态无法确认收货', 'INVALID_STATUS')
    }
    const now = new Date()
    const r = await db.collection(COLL.ORDERS)
      .where({ _id: order._id, status: order.status })
      .update({
        data: {
          status: ORDER_STATUS.COMPLETED,
          completedAt: now,
          updatedAt: now,
          timeline: _.push([{ status: ORDER_STATUS.COMPLETED, at: now, note: '用户确认收货' }])
        }
      })
    if (r.stats.updated === 0) throw new BizError('订单状态已变更，请刷新', 'CONFLICT')
    return { status: ORDER_STATUS.COMPLETED }
  },

  /** 再来一单：返回可加入购物车的商品快照（过滤已下架） */
  async rebuy(event, { openid }) {
    const { orderId } = event
    const order = await findOwnOrder({ orderId, openid })
    const ids = order.items.map(i => i.productId)
    const res = await db.collection(COLL.PRODUCTS)
      .where({ _id: _.in(ids), status: 'on' }).get()
    const map = new Map(res.data.map(p => [p._id, p]))
    const available = []
    const missing = []
    for (const item of order.items) {
      const p = map.get(item.productId)
      if (!p) { missing.push(item.name); continue }
      available.push({
        productId: p._id,
        name: p.name,
        cover: p.cover,
        price: p.price,
        unit: p.unit || '束',
        stock: p.stock,
        quantity: Math.min(item.quantity, p.stock || 1)
      })
    }
    return { items: available, missing }
  }
}

/** 取用户自己的订单，顺带做归属校验 */
async function findOwnOrder({ orderId, orderNo, openid }) {
  let order = null
  if (orderId) {
    const res = await db.collection(COLL.ORDERS).doc(orderId).get().catch(() => null)
    order = res?.data || null
  } else if (orderNo) {
    const res = await db.collection(COLL.ORDERS).where({ orderNo }).limit(1).get()
    order = res.data[0] || null
  }
  if (!order) throw new BizError('订单不存在', 'NOT_FOUND')
  if (order._openid !== openid) throw new BizError('无权查看该订单', 'FORBIDDEN')
  return order
}

/** 校验优惠券可用性：归属、未使用、未过期、满足门槛 */
async function loadUsableCoupon(openid, userCouponId, goodsAmount) {
  const res = await db.collection(COLL.USER_COUPONS).doc(userCouponId).get().catch(() => null)
  const uc = res?.data
  if (!uc || uc._openid !== openid) throw new BizError('优惠券不存在', 'COUPON_INVALID')
  if (uc.status !== 'unused') throw new BizError('优惠券已使用或已过期', 'COUPON_USED')
  if (uc.expireAt && new Date(uc.expireAt).getTime() < Date.now()) {
    throw new BizError('优惠券已过期', 'COUPON_EXPIRED')
  }
  if (goodsAmount < (uc.threshold || 0)) {
    throw new BizError(`未满 ${(uc.threshold / 100).toFixed(0)} 元，不可使用该券`, 'COUPON_THRESHOLD')
  }
  return uc
}

const STATUS_TEXT = {
  [ORDER_STATUS.PENDING_PAY]: '待付款',
  [ORDER_STATUS.PAID]: '已付款',
  [ORDER_STATUS.PREPARING]: '备货中',
  [ORDER_STATUS.DELIVERING]: '配送中',
  [ORDER_STATUS.PENDING_PICKUP]: '待自提',
  [ORDER_STATUS.COMPLETED]: '已完成',
  [ORDER_STATUS.CANCELLED]: '已取消',
  [ORDER_STATUS.REFUNDING]: '退款中',
  [ORDER_STATUS.REFUNDED]: '已退款'
}

function shapeOrder(o, { detail = false } = {}) {
  const base = {
    _id: o._id,
    orderNo: o.orderNo,
    status: o.status,
    statusText: STATUS_TEXT[o.status] || o.status,
    items: o.items,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    totalAmount: o.totalAmount,
    goodsAmount: o.goodsAmount,
    deliveryFee: o.deliveryFee,
    couponDiscount: o.couponDiscount || 0,
    deliveryType: o.deliveryType,
    deliveryTypeText: o.deliveryType === 'pickup' ? '到店自提' : '配送到家',
    createdAt: o.createdAt,
    canCancel: CANCELLABLE.includes(o.status),
    canPay: o.status === ORDER_STATUS.PENDING_PAY,
    canConfirm: [ORDER_STATUS.DELIVERING, ORDER_STATUS.PENDING_PICKUP].includes(o.status)
  }
  if (!detail) return base
  return {
    ...base,
    address: o.address,
    pickupTime: o.pickupTime,
    pickupCode: o.pickupCode,
    pickupVerified: o.pickupVerified,
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    remark: o.remark,
    greetingCard: o.greetingCard,
    memberDiscount: o.memberDiscount,
    expressNo: o.expressNo || '',
    courierName: o.courierName || '',
    courierPhone: o.courierPhone || '',
    timeline: o.timeline || [],
    paidAt: o.paidAt || null,
    completedAt: o.completedAt || null,
    cancelReason: o.cancelReason || ''
  }
}

exports.main = handler(actions)
