/**
 * member —— 会员体系、优惠券、收货地址
 */
const {
  handler, db, _, COLL, MEMBER_LEVELS, BizError, getUser, levelOf
} = require('./common')

const actions = {
  /** 会员中心：等级、进度、权益 */
  async center(event, { openid }) {
    const user = await getUser(openid, { createIfMissing: true })
    const spent = user.totalSpent || 0
    const current = levelOf(spent)
    const next = MEMBER_LEVELS.find(l => l.minSpent > spent) || null
    const [couponCount, orderCount] = await Promise.all([
      db.collection(COLL.USER_COUPONS)
        .where({ _openid: openid, status: 'unused' }).count().then(r => r.total),
      db.collection(COLL.ORDERS).where({ _openid: openid }).count().then(r => r.total)
    ])
    return {
      level: current.level,
      levelName: current.name,
      discount: current.discount,
      discountText: current.discount < 1000 ? `${(current.discount / 100).toFixed(1)}折` : '无折扣',
      points: user.points || 0,
      totalSpent: spent,
      orderCount,
      couponCount,
      nextLevel: next ? {
        name: next.name,
        minSpent: next.minSpent,
        gap: next.minSpent - spent,
        progress: Math.min(Math.round((spent / next.minSpent) * 100), 99)
      } : null,
      levels: MEMBER_LEVELS.map(l => ({
        level: l.level,
        name: l.name,
        minSpent: l.minSpent,
        discountText: l.discount < 1000 ? `${(l.discount / 100).toFixed(1)}折` : '原价',
        pointsRate: l.pointsRate,
        reached: spent >= l.minSpent
      }))
    }
  },

  /** 我的优惠券：status = unused | used | expired | all */
  async coupons(event, { openid }) {
    const { status = 'unused' } = event
    const where = { _openid: openid }
    if (status !== 'all') where.status = status
    const res = await db.collection(COLL.USER_COUPONS).where(where)
      .orderBy('expireAt', 'asc').limit(100).get()
    const now = Date.now()
    return {
      list: res.data.map(c => ({
        _id: c._id,
        name: c.name,
        type: c.type,
        value: c.value,
        valueText: c.type === 'discount'
          ? `${(c.value / 100).toFixed(1)}折`
          : `¥${(c.value / 100).toFixed(0)}`,
        threshold: c.threshold || 0,
        thresholdText: c.threshold ? `满 ${(c.threshold / 100).toFixed(0)} 元可用` : '无门槛',
        status: c.status,
        expireAt: c.expireAt,
        expired: c.expireAt ? new Date(c.expireAt).getTime() < now : false
      }))
    }
  },

  /** 下单页可用券：按当前商品金额过滤并算出抵扣额，最优券排前面 */
  async usableCoupons(event, { openid }) {
    const { goodsAmount = 0 } = event
    const amount = Number(goodsAmount) || 0
    const res = await db.collection(COLL.USER_COUPONS)
      .where({ _openid: openid, status: 'unused' }).limit(100).get()
    const now = Date.now()
    const usable = res.data
      .filter(c => (!c.expireAt || new Date(c.expireAt).getTime() > now) && amount >= (c.threshold || 0))
      .map(c => ({
        _id: c._id,
        name: c.name,
        type: c.type,
        value: c.value,
        threshold: c.threshold || 0,
        discount: c.type === 'discount'
          ? Math.round(amount * (1000 - c.value) / 1000)
          : Math.min(c.value, amount),
        expireAt: c.expireAt
      }))
      .sort((a, b) => b.discount - a.discount)
    return { list: usable }
  },

  /** 领券：从 coupons 模板领取到 user_coupons */
  async claimCoupon(event, { openid }) {
    const { couponId } = event
    if (!couponId) throw new BizError('缺少优惠券 ID', 'INVALID_PARAM')
    const tpl = await db.collection(COLL.COUPONS).doc(couponId).get()
      .then(r => r.data).catch(() => null)
    if (!tpl || tpl.enabled === false) throw new BizError('活动已结束', 'NOT_FOUND')
    if (tpl.endAt && new Date(tpl.endAt).getTime() < Date.now()) {
      throw new BizError('活动已结束', 'EXPIRED')
    }
    if (typeof tpl.remain === 'number' && tpl.remain <= 0) {
      throw new BizError('该券已被领完', 'SOLD_OUT')
    }
    const claimed = await db.collection(COLL.USER_COUPONS)
      .where({ _openid: openid, templateId: couponId }).count().then(r => r.total)
    if (claimed >= (tpl.limitPerUser || 1)) {
      throw new BizError('您已领取过该券', 'ALREADY_CLAIMED')
    }

    const now = new Date()
    const expireAt = tpl.validDays
      ? new Date(now.getTime() + tpl.validDays * 86400000)
      : (tpl.endAt ? new Date(tpl.endAt) : new Date(now.getTime() + 30 * 86400000))

    const tx = await db.startTransaction()
    try {
      if (typeof tpl.remain === 'number') {
        const r = await tx.collection(COLL.COUPONS)
          .where({ _id: couponId, remain: _.gt(0) })
          .update({ data: { remain: _.inc(-1) } })
        if (r.stats.updated === 0) throw new BizError('该券已被领完', 'SOLD_OUT')
      }
      await tx.collection(COLL.USER_COUPONS).add({
        data: {
          _openid: openid,
          templateId: couponId,
          name: tpl.name,
          type: tpl.type,
          value: tpl.value,
          threshold: tpl.threshold || 0,
          status: 'unused',
          expireAt,
          claimedAt: now
        }
      })
      await tx.commit()
    } catch (err) {
      await tx.rollback().catch(() => {})
      throw err
    }
    return { expireAt }
  },

  /** 可领取的券列表（首页弹窗/领券中心） */
  async couponCenter(event, { openid }) {
    const now = new Date()
    const res = await db.collection(COLL.COUPONS)
      .where({ enabled: true, endAt: _.gt(now) })
      .orderBy('threshold', 'asc').limit(20).get()
    const mine = await db.collection(COLL.USER_COUPONS)
      .where({ _openid: openid }).field({ templateId: true }).limit(200).get()
    const claimedMap = mine.data.reduce((m, c) => {
      m[c.templateId] = (m[c.templateId] || 0) + 1
      return m
    }, {})
    return {
      list: res.data.map(c => ({
        _id: c._id,
        name: c.name,
        type: c.type,
        value: c.value,
        valueText: c.type === 'discount' ? `${(c.value / 100).toFixed(1)}折` : `¥${(c.value / 100).toFixed(0)}`,
        threshold: c.threshold || 0,
        thresholdText: c.threshold ? `满 ${(c.threshold / 100).toFixed(0)} 元可用` : '无门槛',
        remain: c.remain,
        claimed: (claimedMap[c._id] || 0) >= (c.limitPerUser || 1)
      }))
    }
  },

  // ---------- 收货地址 ----------

  async addresses(event, { openid }) {
    const res = await db.collection(COLL.ADDRESSES)
      .where({ _openid: openid })
      .orderBy('isDefault', 'desc').orderBy('updatedAt', 'desc')
      .limit(30).get()
    return { list: res.data }
  },

  async saveAddress(event, { openid }) {
    const { addressId, name, phone, province = '', city = '', district = '', detail, isDefault = false, location = null } = event
    if (!name || !String(name).trim()) throw new BizError('请填写收货人', 'INVALID_PARAM')
    if (!/^1[3-9]\d{9}$/.test(String(phone || ''))) throw new BizError('手机号格式有误', 'INVALID_PARAM')
    if (!detail || !String(detail).trim()) throw new BizError('请填写详细地址', 'INVALID_PARAM')

    const now = new Date()
    const data = {
      name: String(name).trim().slice(0, 20),
      phone: String(phone),
      province, city, district,
      detail: String(detail).trim().slice(0, 120),
      location,
      isDefault: !!isDefault,
      updatedAt: now
    }

    // 设为默认时先清掉其它默认项，保证唯一
    if (data.isDefault) {
      await db.collection(COLL.ADDRESSES)
        .where({ _openid: openid, isDefault: true })
        .update({ data: { isDefault: false, updatedAt: now } })
        .catch(() => {})
    }

    if (addressId) {
      const own = await db.collection(COLL.ADDRESSES).doc(addressId).get()
        .then(r => r.data).catch(() => null)
      if (!own || own._openid !== openid) throw new BizError('地址不存在', 'NOT_FOUND')
      await db.collection(COLL.ADDRESSES).doc(addressId).update({ data })
      return { addressId }
    }

    const count = await db.collection(COLL.ADDRESSES).where({ _openid: openid }).count().then(r => r.total)
    if (count >= 20) throw new BizError('地址数量已达上限', 'LIMIT')
    // 第一个地址自动设为默认
    if (count === 0) data.isDefault = true
    const added = await db.collection(COLL.ADDRESSES).add({ data: { ...data, _openid: openid, createdAt: now } })
    return { addressId: added._id }
  },

  async deleteAddress(event, { openid }) {
    const { addressId } = event
    const own = await db.collection(COLL.ADDRESSES).doc(addressId).get()
      .then(r => r.data).catch(() => null)
    if (!own || own._openid !== openid) throw new BizError('地址不存在', 'NOT_FOUND')
    await db.collection(COLL.ADDRESSES).doc(addressId).remove()
    return { addressId }
  },

  /** 取默认地址（下单页预填） */
  async defaultAddress(event, { openid }) {
    const res = await db.collection(COLL.ADDRESSES)
      .where({ _openid: openid, isDefault: true }).limit(1).get()
    if (res.data.length) return { address: res.data[0] }
    const any = await db.collection(COLL.ADDRESSES)
      .where({ _openid: openid }).orderBy('updatedAt', 'desc').limit(1).get()
    return { address: any.data[0] || null }
  }
}

exports.main = handler(actions)
