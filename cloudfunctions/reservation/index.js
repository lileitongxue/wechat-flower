/**
 * reservation —— 预约订花（节日预购）
 *
 * 与普通订单的区别：不立即扣库存（备货由商家按预约单排期），
 * 允许只付定金，交付日期可在未来 90 天内。
 */
const {
  handler, db, _, COLL, RESERVATION_STATUS, BizError,
  getUser, levelOf, genOrderNo
} = require('./common')

/** 定金比例：30%，不足 1 元按 1 元收 */
const DEPOSIT_RATE = 0.3

const actions = {
  /** 创建预约单 */
  async create(event, { openid }) {
    const {
      items = [],
      deliveryDate,
      deliveryTime = '',
      deliveryType = 'delivery',
      addressId = '',
      contactName = '',
      contactPhone = '',
      greetingCard = '',
      remark = '',
      payMode = 'deposit'   // deposit 付定金 | full 全款
    } = event

    if (!Array.isArray(items) || !items.length) throw new BizError('请选择预约商品', 'INVALID_PARAM')
    if (!deliveryDate) throw new BizError('请选择交付日期', 'INVALID_PARAM')

    const target = new Date(`${deliveryDate}T00:00:00`)
    if (Number.isNaN(target.getTime())) throw new BizError('交付日期格式有误', 'INVALID_PARAM')
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const dayDiff = Math.round((target - today) / 86400000)
    if (dayDiff < 1) throw new BizError('预约需至少提前 1 天', 'DATE_TOO_SOON')
    if (dayDiff > 90) throw new BizError('最多可提前 90 天预约', 'DATE_TOO_FAR')

    const user = await getUser(openid, { createIfMissing: true })
    const level = levelOf(user.totalSpent || 0)

    const ids = [...new Set(items.map(i => i.productId).filter(Boolean))]
    const prodRes = await db.collection(COLL.PRODUCTS).where({ _id: _.in(ids) }).get()
    const prodMap = new Map(prodRes.data.map(p => [p._id, p]))

    const resItems = []
    for (const it of items) {
      const p = prodMap.get(it.productId)
      if (!p) throw new BizError('部分商品不存在', 'PRODUCT_GONE')
      if (p.status !== 'on') throw new BizError(`「${p.name}」已下架`, 'PRODUCT_OFF')
      if (p.supportReservation === false) throw new BizError(`「${p.name}」不支持预约`, 'NO_RESERVATION')
      const qty = Math.floor(Number(it.quantity) || 0)
      if (qty <= 0 || qty > 99) throw new BizError('预约数量不合法', 'INVALID_QTY')
      const unitPrice = level.discount < 1000
        ? Math.round((p.price * level.discount) / 1000)
        : p.price
      resItems.push({
        productId: p._id,
        name: p.name,
        cover: p.cover || '',
        unit: p.unit || '束',
        unitPrice,
        quantity: qty,
        subtotal: unitPrice * qty
      })
    }

    const goodsAmount = resItems.reduce((s, i) => s + i.subtotal, 0)
    const shop = await db.collection(COLL.SETTINGS).doc('shop').get()
      .then(r => r.data).catch(() => ({}))
    const deliveryFee = deliveryType === 'pickup'
      ? 0
      : (goodsAmount >= (shop.freeDeliveryThreshold ?? 19900) ? 0 : (shop.deliveryFee ?? 800))
    const totalAmount = goodsAmount + deliveryFee
    const depositAmount = payMode === 'full'
      ? totalAmount
      : Math.max(Math.round(totalAmount * DEPOSIT_RATE), 100)

    let address = null
    if (deliveryType === 'delivery') {
      if (!addressId) throw new BizError('请选择收货地址', 'NO_ADDRESS')
      const a = await db.collection(COLL.ADDRESSES).doc(addressId).get()
        .then(r => r.data).catch(() => null)
      if (!a || a._openid !== openid) throw new BizError('收货地址无效', 'NO_ADDRESS')
      address = {
        name: a.name, phone: a.phone, province: a.province,
        city: a.city, district: a.district, detail: a.detail
      }
    }

    const now = new Date()
    const doc = {
      reservationNo: genOrderNo(),
      _openid: openid,
      userId: user._id,
      items: resItems,
      goodsAmount,
      deliveryFee,
      totalAmount,
      depositAmount,
      paidAmount: 0,
      payMode,
      status: RESERVATION_STATUS.PENDING,
      deliveryDate,
      deliveryTime: deliveryTime || (shop.timeRanges?.[0] || '09:00-12:00'),
      deliveryType,
      address,
      contactName: String(contactName || address?.name || user.nickName || '').slice(0, 20),
      contactPhone: String(contactPhone || address?.phone || user.phone || '').slice(0, 20),
      greetingCard: String(greetingCard || '').slice(0, 100),
      remark: String(remark || '').slice(0, 200),
      memberLevel: level.level,
      timeline: [{ status: RESERVATION_STATUS.PENDING, at: now, note: '预约单已提交' }],
      createdAt: now,
      updatedAt: now
    }

    const added = await db.collection(COLL.RESERVATIONS).add({ data: doc })
    return {
      reservationId: added._id,
      reservationNo: doc.reservationNo,
      totalAmount,
      depositAmount,
      deliveryDate,
      deliveryTime: doc.deliveryTime
    }
  },

  async list(event, { openid }) {
    const { status = 'all', page = 1, pageSize = 10 } = event
    const size = Math.min(Math.max(Number(pageSize) || 10, 1), 30)
    const where = { _openid: openid }
    if (status !== 'all') where.status = status
    const query = db.collection(COLL.RESERVATIONS).where(where)
    const [list, total] = await Promise.all([
      query.orderBy('deliveryDate', 'asc')
        .skip(Math.max((Number(page) || 1) - 1, 0) * size).limit(size)
        .get().then(r => r.data),
      query.count().then(r => r.total)
    ])
    return { list: list.map(shapeReservation), total }
  },

  async detail(event, { openid }) {
    const { reservationId } = event
    const r = await db.collection(COLL.RESERVATIONS).doc(reservationId).get()
      .then(x => x.data).catch(() => null)
    if (!r) throw new BizError('预约单不存在', 'NOT_FOUND')
    if (r._openid !== openid) throw new BizError('无权查看', 'FORBIDDEN')
    return { reservation: shapeReservation(r, { detail: true }) }
  },

  async cancel(event, { openid }) {
    const { reservationId, reason = '' } = event
    const r = await db.collection(COLL.RESERVATIONS).doc(reservationId).get()
      .then(x => x.data).catch(() => null)
    if (!r) throw new BizError('预约单不存在', 'NOT_FOUND')
    if (r._openid !== openid) throw new BizError('无权操作', 'FORBIDDEN')
    if (![RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED].includes(r.status)) {
      throw new BizError('当前状态不可取消', 'INVALID_STATUS')
    }
    // 交付前 3 天内取消不退定金，提示由前端展示
    const now = new Date()
    const upd = await db.collection(COLL.RESERVATIONS)
      .where({ _id: reservationId, status: r.status })
      .update({
        data: {
          status: RESERVATION_STATUS.CANCELLED,
          cancelReason: String(reason).slice(0, 100),
          cancelledAt: now,
          updatedAt: now,
          timeline: _.push([{ status: RESERVATION_STATUS.CANCELLED, at: now, note: '用户取消预约' }])
        }
      })
    if (upd.stats.updated === 0) throw new BizError('状态已变更，请刷新', 'CONFLICT')
    return { status: RESERVATION_STATUS.CANCELLED, depositRefundable: daysUntil(r.deliveryDate) > 3 }
  }
}

function daysUntil(dateStr) {
  const target = new Date(`${dateStr}T00:00:00`)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

const STATUS_TEXT = {
  [RESERVATION_STATUS.PENDING]: '待确认',
  [RESERVATION_STATUS.CONFIRMED]: '已确认',
  [RESERVATION_STATUS.FULFILLED]: '已交付',
  [RESERVATION_STATUS.CANCELLED]: '已取消'
}

function shapeReservation(r, { detail = false } = {}) {
  const base = {
    _id: r._id,
    reservationNo: r.reservationNo,
    status: r.status,
    statusText: STATUS_TEXT[r.status] || r.status,
    items: r.items,
    itemCount: r.items.reduce((s, i) => s + i.quantity, 0),
    totalAmount: r.totalAmount,
    depositAmount: r.depositAmount,
    paidAmount: r.paidAmount || 0,
    deliveryDate: r.deliveryDate,
    deliveryTime: r.deliveryTime,
    deliveryType: r.deliveryType,
    deliveryTypeText: r.deliveryType === 'pickup' ? '到店自提' : '配送到家',
    daysLeft: daysUntil(r.deliveryDate),
    canCancel: [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED].includes(r.status),
    createdAt: r.createdAt
  }
  if (!detail) return base
  return {
    ...base,
    address: r.address,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    greetingCard: r.greetingCard,
    remark: r.remark,
    goodsAmount: r.goodsAmount,
    deliveryFee: r.deliveryFee,
    payMode: r.payMode,
    timeline: r.timeline || []
  }
}

exports.main = handler(actions)
