/**
 * seed —— 一键初始化：建集合索引数据、灌示例商品、把自己设为管理员
 *
 * 仅用于首次部署与本地调试。上线后建议在云开发控制台删除本函数，
 * 或把 initAdmin 的调用权限收紧。
 */
const {
  handler, db, COLL, BizError, getUser, requireAdmin, isCollectionMissing
} = require('./common')

/** 需要创建的集合清单（顺序即创建顺序） */
const ALL_COLLECTIONS = Object.values(COLL)

const actions = {
  /**
   * 创建所有需要的集合。已存在的会被跳过（createCollection 对已存在集合会抛错，
   * 这里视为成功）。可重复调用。
   */
  async ensureCollections() {
    const created = []
    const existed = []
    const failed = []
    let apiUnsupported = false
    for (const name of ALL_COLLECTIONS) {
      try {
        await db.createCollection(name)
        created.push(name)
      } catch (err) {
        const text = String(err.errMsg || err.message || '')
        if (/already exist|已存在|-501001/i.test(text)) {
          // 已存在属于正常情况
          existed.push(name)
        } else if (/createCollection|not a function|is not defined/i.test(text)) {
          // 该 SDK 版本或环境不支持自动建集合，退回到「检测是否可用」
          apiUnsupported = true
          try {
            await db.collection(name).limit(1).count()
            existed.push(name)
          } catch (e2) {
            failed.push({ name, message: '需在控制台手动创建' })
          }
        } else {
          failed.push({ name, message: text })
        }
      }
    }
    return {
      created, existed, failed,
      total: ALL_COLLECTIONS.length,
      // 前端据此提示「需要手动建集合」
      needManual: apiUnsupported && failed.length > 0
    }
  },

  /**
   * 一键初始化：建集合 → 设为店主 → 灌示例数据。
   * 设计成幂等且可重复调用，首次部署时前端只调这一个接口。
   */
  async bootstrap(event, { openid }) {
    const user = await getUser(openid, { createIfMissing: true })

    // 1. 建集合（login 能走到这里说明 users 已可读，其余集合可能还缺）
    const collections = await this.ensureCollections()

    // 2. 决定是否设为店主：没有任何管理员时才授予
    const adminCount = await db.collection(COLL.USERS).where({ role: 'admin' }).count()
      .then(r => r.total).catch(() => 0)
    let becameAdmin = false
    if (adminCount === 0) {
      await db.collection(COLL.USERS).doc(user._id).update({
        data: { role: 'admin', updatedAt: new Date() }
      })
      becameAdmin = true
    } else if (user.role === 'admin') {
      becameAdmin = true
    }

    // 3. 灌示例数据（需要管理员身份，第 2 步刚授过权时重新读取）
    const fresh = await getUser(openid)
    const isAdmin = !!fresh && fresh.role === 'admin'
    let seeded = null
    if (isAdmin) {
      seeded = await this.seedData(event, { openid })
    }

    return {
      collections,
      becameAdmin,
      isAdmin,
      seeded,
      message: [
        `集合：新建 ${collections.created.length} 个，已存在 ${collections.existed.length} 个`,
        becameAdmin ? '已将当前账号设为店主' : (isAdmin ? '当前账号已是店主' : '店铺已有管理员，跳过授权'),
        seeded ? seeded.message : '未灌入示例数据'
      ].join('；')
    }
  },

  /** 只读诊断：哪些集合还没建好，便于排查 */
  async status() {
    const missing = []
    const ready = []
    for (const name of ALL_COLLECTIONS) {
      try {
        await db.collection(name).limit(1).count()
        ready.push(name)
      } catch (err) {
        if (isCollectionMissing(err)) missing.push(name)
        else ready.push(name)
      }
    }
    return { ready, missing, allReady: missing.length === 0, total: ALL_COLLECTIONS.length }
  },

  /**
   * 把调用者设为管理员。
   * 首个管理员可直接设置；之后必须由已有管理员调用 grantAdmin。
   */
  async initAdmin(event, { openid }) {
    const existing = await db.collection(COLL.USERS).where({ role: 'admin' }).count().then(r => r.total)
    if (existing > 0) {
      const me = await getUser(openid)
      if (!me || me.role !== 'admin') {
        throw new BizError('管理员已存在，请让现有管理员为你授权', 'ADMIN_EXISTS')
      }
      return { alreadyAdmin: true }
    }
    const user = await getUser(openid, { createIfMissing: true })
    await db.collection(COLL.USERS).doc(user._id).update({
      data: { role: 'admin', updatedAt: new Date() }
    })
    return { openid, role: 'admin', message: '已设为管理员，请重新进入小程序' }
  },

  /** 现有管理员给他人授权 */
  async grantAdmin(event, { openid }) {
    await requireAdmin(openid)
    const { targetOpenid, phone } = event
    const where = targetOpenid ? { _openid: targetOpenid } : { phone: String(phone || '') }
    if (!targetOpenid && !phone) throw new BizError('请提供 openid 或手机号', 'INVALID_PARAM')
    const res = await db.collection(COLL.USERS).where(where).limit(1).get()
    if (!res.data.length) throw new BizError('用户不存在（需对方先登录一次）', 'NOT_FOUND')
    await db.collection(COLL.USERS).doc(res.data[0]._id).update({
      data: { role: 'admin', updatedAt: new Date() }
    })
    return { ok: true }
  },

  /** 灌入示例分类、商品、优惠券、店铺信息 */
  async seedData(event, { openid }) {
    await requireAdmin(openid)
    // 集合可能还没建（首次部署），先补齐，否则写分类/商品时会报集合不存在
    await this.ensureCollections()
    const now = new Date()

    // 店铺信息
    await db.collection(COLL.SETTINGS).doc('shop').set({
      data: {
        name: '花知道 · 鲜花工作室',
        phone: '400-800-6666',
        address: '上海市徐汇区天钥桥路 100 号 1F',
        location: { latitude: 31.1926, longitude: 121.4365 },
        openTime: '09:00',
        closeTime: '21:00',
        deliveryFee: 800,
        freeDeliveryThreshold: 19900,
        deliveryRange: '同城 10 公里内，超出部分每公里加收 2 元',
        notice: '当日 16:00 前下单可当日送达；鲜花为定制类商品，非质量问题不支持退换',
        timeRanges: ['09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00'],
        festivals: [
          { date: '1-1', name: '元旦' },
          { date: '2-14', name: '情人节' },
          { date: '3-8', name: '妇女节' },
          { date: '5-10', name: '母亲节' },
          { date: '5-20', name: '520 表白日' },
          { date: '9-10', name: '教师节' },
          { date: '12-24', name: '平安夜' },
          { date: '12-25', name: '圣诞节' }
        ],
        updatedAt: now
      }
    })

    await db.collection(COLL.SETTINGS).doc('banners').set({
      data: {
        items: [
          { image: 'cloud://banner-1.jpg', title: '情人节玫瑰预售中', link: '/pages/category/category?tag=rose' },
          { image: 'cloud://banner-2.jpg', title: '新客首单立减 20 元', link: '/pages/coupon/coupon' },
          { image: 'cloud://banner-3.jpg', title: '节日预约订花', link: '/pages/reservation-create/reservation-create' }
        ],
        updatedAt: now
      }
    })

    // 分类
    const categories = [
      { name: '玫瑰花束', icon: '🌹', sort: 1 },
      { name: '混搭花束', icon: '💐', sort: 2 },
      { name: '永生花', icon: '🌺', sort: 3 },
      { name: '绿植盆栽', icon: '🪴', sort: 4 },
      { name: '节日限定', icon: '🎁', sort: 5 },
      { name: '开业花篮', icon: '🧺', sort: 6 }
    ]
    const catIds = {}
    for (const c of categories) {
      const exist = await db.collection(COLL.CATEGORIES).where({ name: c.name }).limit(1).get()
      if (exist.data.length) { catIds[c.name] = exist.data[0]._id; continue }
      const added = await db.collection(COLL.CATEGORIES).add({
        data: { ...c, enabled: true, createdAt: now, updatedAt: now }
      })
      catIds[c.name] = added._id
    }

    // 商品（价格单位：分）
    const products = [
      {
        name: '挚爱 · 99 朵红玫瑰', subtitle: '一生挚爱，唯你而已',
        categoryId: catIds['玫瑰花束'], price: 99900, originalPrice: 129900,
        stock: 20, unit: '束', isHot: true, sort: 1,
        tags: ['热销', '告白首选'],
        material: '昆明 A 级红玫瑰 99 枝、尤加利叶、满天星',
        packaging: '高级哑光雾面纸 + 丝带蝴蝶结',
        flowerLanguage: '长长久久，天长地久',
        description: '精选昆明直采 A 级红玫瑰，每一枝都经过人工筛选，花头饱满直径 4cm 以上。适合求婚、纪念日、重要告白场合。',
        notice: '99 朵为大型花束，建议提前 1 天预约'
      },
      {
        name: '初见 · 11 朵戴安娜粉玫瑰', subtitle: '温柔的第一次心动',
        categoryId: catIds['玫瑰花束'], price: 19900, originalPrice: 25900,
        stock: 50, unit: '束', isHot: true, sort: 2,
        tags: ['新品', '约会'],
        material: '戴安娜粉玫瑰 11 枝、尤加利叶、情人草',
        packaging: '韩式简约包装纸 + 缎带',
        flowerLanguage: '一心一意',
        description: '戴安娜玫瑰以柔粉色著称，花型优雅，是日常送礼与约会的经典选择。'
      },
      {
        name: '春日漫步 · 混搭花束', subtitle: '把整个春天抱回家',
        categoryId: catIds['混搭花束'], price: 29900, originalPrice: 35900,
        stock: 35, unit: '束', isHot: true, sort: 3,
        tags: ['当季', '人气'],
        material: '郁金香 5 枝、洋桔梗 5 枝、小雏菊、银叶菊',
        packaging: '牛皮纸 + 麻绳',
        flowerLanguage: '美好与希望',
        description: '当季花材混搭，色彩明快，适合生日祝福、乔迁道贺与日常家居装饰。'
      },
      {
        name: '永恒之约 · 永生玫瑰礼盒', subtitle: '三年不凋的浪漫',
        categoryId: catIds['永生花'], price: 59900, originalPrice: 79900,
        stock: 15, unit: '盒', sort: 4,
        tags: ['送礼', '可长期保存'],
        material: '厄瓜多尔永生玫瑰 9 枝、永生绣球、亚克力防尘罩',
        packaging: '天鹅绒礼盒 + 手提袋',
        flowerLanguage: '永恒不变的爱',
        description: '采用真花脱色保鲜工艺制成，常温避光可保存三年以上，附赠贺卡与手提袋。'
      },
      {
        name: '轻松惬意 · 龟背竹盆栽', subtitle: '好养活的空气净化器',
        categoryId: catIds['绿植盆栽'], price: 12900, originalPrice: 16900,
        stock: 40, unit: '盆', sort: 5,
        tags: ['好养', '办公室'],
        material: '龟背竹幼株、陶瓷白盆、营养土',
        packaging: '纸箱加固运输',
        flowerLanguage: '健康长寿',
        description: '耐阴好养，一周浇水一次即可，适合办公室与客厅。',
        supportReservation: false
      },
      {
        name: '母亲节限定 · 康乃馨感恩花束', subtitle: '说不出口的谢谢',
        categoryId: catIds['节日限定'], price: 25900, originalPrice: 29900,
        stock: 60, unit: '束', isHot: true, sort: 6,
        tags: ['节日限定', '母亲节'],
        material: '粉色康乃馨 19 枝、相思梅、尤加利叶',
        packaging: '渐变粉包装纸 + 感恩贺卡',
        flowerLanguage: '母爱、感恩与祝福',
        description: '母亲节前一周可预约，支持指定日期送达，附手写贺卡服务。'
      },
      {
        name: '鸿运当头 · 开业花篮（双层）', subtitle: '生意兴隆，财源广进',
        categoryId: catIds['开业花篮'], price: 39900, originalPrice: 49900,
        stock: 10, unit: '对', sort: 7,
        tags: ['开业', '含配送'],
        material: '红掌、非洲菊、百合、散尾葵，双层立架',
        packaging: '定制红色条幅，可指定祝福语',
        flowerLanguage: '生意兴隆',
        description: '双层立式花篮，含条幅免费定制，市区范围含安装摆放服务。',
        notice: '需提前 1 天预约，指定时间送达'
      },
      {
        name: '向阳而生 · 向日葵花束', subtitle: '愿你永远热烈',
        categoryId: catIds['混搭花束'], price: 22900, originalPrice: 27900,
        stock: 30, unit: '束', sort: 8,
        tags: ['毕业季', '鼓励'],
        material: '向日葵 7 枝、洋甘菊、尤加利叶',
        packaging: '明黄系包装纸',
        flowerLanguage: '沉默的爱、勇敢前行',
        description: '适合毕业、升学、康复探望等鼓励场景。'
      }
    ]

    let created = 0
    for (const p of products) {
      const exist = await db.collection(COLL.PRODUCTS).where({ name: p.name }).limit(1).get()
      if (exist.data.length) continue
      await db.collection(COLL.PRODUCTS).add({
        data: {
          cover: '', images: [],
          status: 'on', sales: 0,
          supportReservation: p.supportReservation !== false,
          ...p,
          createdAt: now, updatedAt: now
        }
      })
      created++
    }

    // 优惠券模板
    const coupons = [
      {
        name: '新客首单立减 20 元', type: 'amount', value: 2000, threshold: 9900,
        validDays: 30, limitPerUser: 1, remain: 1000, enabled: true,
        endAt: new Date(now.getFullYear() + 1, 11, 31)
      },
      {
        name: '满 299 减 50', type: 'amount', value: 5000, threshold: 29900,
        validDays: 15, limitPerUser: 2, remain: 500, enabled: true,
        endAt: new Date(now.getFullYear() + 1, 11, 31)
      },
      {
        name: '会员专享 9 折', type: 'discount', value: 900, threshold: 19900,
        validDays: 60, limitPerUser: 1, remain: 300, enabled: true,
        endAt: new Date(now.getFullYear() + 1, 11, 31)
      }
    ]
    for (const c of coupons) {
      const exist = await db.collection(COLL.COUPONS).where({ name: c.name }).limit(1).get()
      if (exist.data.length) continue
      await db.collection(COLL.COUPONS).add({ data: { ...c, createdAt: now, updatedAt: now } })
    }

    return {
      categories: Object.keys(catIds).length,
      productsCreated: created,
      message: `初始化完成：${Object.keys(catIds).length} 个分类，新增 ${created} 个商品。商品封面图需在管理端上传。`
    }
  }
}

exports.main = handler(actions)
