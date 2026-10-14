/**
 * shop —— 商品展示（分类、列表、详情、搜索、首页聚合、店铺信息）
 * 全部为读操作，不做鉴权；库存与价格以数据库为准。
 */
const { handler, db, _, COLL, BizError, levelOf, getUser } = require('./common')

const PAGE_SIZE = 10

const actions = {
  /** 首页聚合：一次请求拿到轮播、分类、推荐位，减少小程序端串行请求 */
  async home(event, { openid }) {
    const [banners, categories, hot, newest] = await Promise.all([
      db.collection(COLL.SETTINGS).doc('banners').get()
        .then(r => r.data.items || [])
        .catch(() => []),
      db.collection(COLL.CATEGORIES).where({ enabled: true })
        .orderBy('sort', 'asc').limit(20).get().then(r => r.data),
      db.collection(COLL.PRODUCTS)
        .where({ status: 'on', isHot: true })
        .orderBy('sort', 'asc').limit(6).get().then(r => r.data),
      db.collection(COLL.PRODUCTS)
        .where({ status: 'on' })
        .orderBy('createdAt', 'desc').limit(6).get().then(r => r.data)
    ])
    const discount = await userDiscount(openid)
    return {
      banners,
      categories,
      hot: hot.map(p => shapeProduct(p, discount)),
      newest: newest.map(p => shapeProduct(p, discount))
    }
  },

  async categories() {
    const res = await db.collection(COLL.CATEGORIES)
      .where({ enabled: true }).orderBy('sort', 'asc').get()
    return { list: res.data }
  },

  /**
   * 商品列表：支持分类过滤、关键词、排序、分页。
   * sortBy: default | priceAsc | priceDesc | sales | newest
   */
  async products(event, { openid }) {
    const { categoryId, keyword, sortBy = 'default', page = 1, pageSize = PAGE_SIZE } = event
    const size = Math.min(Math.max(Number(pageSize) || PAGE_SIZE, 1), 50)
    const skip = Math.max((Number(page) || 1) - 1, 0) * size

    // 关键词存在时用 _.or 组合多字段正则，否则走简单等值条件
    const conds = [{ status: 'on' }]
    if (categoryId) conds.push({ categoryId })
    if (keyword && String(keyword).trim()) {
      const reg = db.RegExp({ regexp: escapeRegExp(String(keyword).trim().slice(0, 30)), options: 'i' })
      conds.push(_.or([{ name: reg }, { subtitle: reg }, { tags: reg }]))
    }
    const query = db.collection(COLL.PRODUCTS).where(_.and(conds))
    const [list, total] = await Promise.all([
      applySort(query, sortBy).skip(skip).limit(size).get().then(r => r.data),
      query.count().then(r => r.total)
    ])
    const discount = await userDiscount(openid)
    return { list: list.map(p => shapeProduct(p, discount)), total, page: Number(page) || 1, pageSize: size }
  },

  /** 商品详情：带同类推荐 */
  async productDetail(event, { openid }) {
    const { id } = event
    if (!id) throw new BizError('缺少商品 ID', 'INVALID_PARAM')
    const res = await db.collection(COLL.PRODUCTS).doc(id).get().catch(() => null)
    const product = res?.data
    if (!product || product.status !== 'on') throw new BizError('商品不存在或已下架', 'NOT_FOUND')
    const discount = await userDiscount(openid)
    const related = await db.collection(COLL.PRODUCTS)
      .where({ status: 'on', categoryId: product.categoryId, _id: _.neq(id) })
      .limit(4).get().then(r => r.data)
    return {
      product: shapeProduct(product, discount, { detail: true }),
      related: related.map(p => shapeProduct(p, discount))
    }
  },

  /** 批量校验购物车：返回最新价格、库存、上下架状态 */
  async validateCart(event, { openid }) {
    const { items = [] } = event
    if (!Array.isArray(items) || !items.length) return { items: [] }
    const ids = items.map(i => i.productId).filter(Boolean).slice(0, 50)
    if (!ids.length) return { items: [] }
    const res = await db.collection(COLL.PRODUCTS).where({ _id: _.in(ids) }).get()
    const discount = await userDiscount(openid)
    const map = new Map(res.data.map(p => [p._id, p]))
    return {
      items: items.map(i => {
        const p = map.get(i.productId)
        if (!p) return { productId: i.productId, valid: false, reason: '商品已删除' }
        if (p.status !== 'on') return { productId: i.productId, valid: false, reason: '商品已下架', name: p.name }
        const shaped = shapeProduct(p, discount)
        const qty = Number(i.quantity) || 1
        return {
          productId: p._id,
          valid: p.stock >= qty,
          reason: p.stock >= qty ? '' : `库存仅剩 ${p.stock} 件`,
          name: p.name,
          cover: p.cover,
          price: shaped.price,
          originalPrice: shaped.originalPrice,
          stock: p.stock,
          quantity: qty
        }
      })
    }
  },

  /** 店铺信息（地址、营业时间、电话、配送规则） */
  async shopInfo() {
    const res = await db.collection(COLL.SETTINGS).doc('shop').get().catch(() => null)
    return { shop: res?.data || defaultShop() }
  },

  /** 预约可选日期：返回未来 N 天及节日标记 */
  async reservationSlots(event) {
    const { days = 30 } = event
    const res = await db.collection(COLL.SETTINGS).doc('shop').get().catch(() => null)
    const shop = res?.data || defaultShop()
    const festivals = shop.festivals || []
    const out = []
    const today = new Date()
    for (let i = 1; i <= Math.min(Number(days) || 30, 90); i++) {
      const d = new Date(today.getTime() + i * 86400000)
      const key = `${d.getMonth() + 1}-${d.getDate()}`
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const hit = festivals.find(f => f.date === key)
      out.push({
        date: iso,
        weekday: '日一二三四五六'[d.getDay()],
        festival: hit ? hit.name : '',
        busy: !!hit
      })
    }
    return { slots: out, timeRanges: shop.timeRanges || defaultShop().timeRanges }
  }
}

function applySort(query, sortBy) {
  switch (sortBy) {
    case 'priceAsc': return query.orderBy('price', 'asc')
    case 'priceDesc': return query.orderBy('price', 'desc')
    case 'sales': return query.orderBy('sales', 'desc')
    case 'newest': return query.orderBy('createdAt', 'desc')
    default: return query.orderBy('sort', 'asc').orderBy('createdAt', 'desc')
  }
}

/** 会员折扣：未登录或普通会员返回 1000（即不打折） */
async function userDiscount(openid) {
  if (!openid) return 1000
  const user = await getUser(openid).catch(() => null)
  if (!user) return 1000
  return levelOf(user.totalSpent || 0).discount
}

/** 统一商品出参：补上会员价，隐藏成本价等内部字段 */
function shapeProduct(p, discount = 1000, { detail = false } = {}) {
  const memberPrice = discount < 1000 ? Math.round((p.price * discount) / 1000) : p.price
  const base = {
    _id: p._id,
    name: p.name,
    subtitle: p.subtitle || '',
    cover: p.cover || '',
    price: p.price,
    memberPrice,
    hasMemberPrice: memberPrice < p.price,
    originalPrice: p.originalPrice || 0,
    stock: p.stock || 0,
    sales: p.sales || 0,
    unit: p.unit || '束',
    tags: p.tags || [],
    categoryId: p.categoryId,
    isHot: !!p.isHot,
    supportReservation: p.supportReservation !== false
  }
  if (!detail) return base
  return {
    ...base,
    images: p.images || (p.cover ? [p.cover] : []),
    description: p.description || '',
    material: p.material || '',
    packaging: p.packaging || '',
    flowerLanguage: p.flowerLanguage || '',
    specs: p.specs || [],
    notice: p.notice || ''
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function defaultShop() {
  return {
    name: '花知道 · 鲜花工作室',
    phone: '400-000-0000',
    address: '请在管理后台设置店铺地址',
    location: { latitude: 0, longitude: 0 },
    openTime: '09:00',
    closeTime: '21:00',
    deliveryFee: 800,
    freeDeliveryThreshold: 19900,
    deliveryRange: '同城 10 公里内',
    notice: '当日 16:00 前下单可当日送达',
    timeRanges: ['09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00'],
    festivals: [
      { date: '2-14', name: '情人节' },
      { date: '3-8', name: '妇女节' },
      { date: '5-20', name: '520' },
      { date: '9-10', name: '教师节' },
      { date: '12-24', name: '平安夜' },
      { date: '12-25', name: '圣诞节' }
    ]
  }
}

exports.main = handler(actions)
