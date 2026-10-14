/**
 * login —— 微信授权一键登录
 * 小程序端 wx.cloud.callFunction 时，openid 由平台注入，无需 code2session。
 */
const { handler, db, COLL, getUser, levelOf, BizError } = require('./common')

const actions = {
  /** 首次进入/每次启动调用：确保 users 表有档案，返回登录态 */
  async login(event, { openid, unionid }) {
    const user = await getUser(openid, { createIfMissing: true })
    const patch = {}
    if (unionid && user.unionid !== unionid) patch.unionid = unionid
    if (Object.keys(patch).length) {
      patch.updatedAt = new Date()
      await db.collection(COLL.USERS).doc(user._id).update({ data: patch })
      Object.assign(user, patch)
    }
    return { user: shape(user), openid }
  },

  /**
   * 用户点「授权头像昵称」后回填。
   * 头像由小程序端先上传到云存储，这里只存 fileID。
   */
  async updateProfile(event, { openid }) {
    const { nickName, avatarUrl } = event
    const user = await getUser(openid, { createIfMissing: true })
    const patch = { updatedAt: new Date() }
    if (typeof nickName === 'string' && nickName.trim()) {
      patch.nickName = nickName.trim().slice(0, 30)
    }
    if (typeof avatarUrl === 'string' && avatarUrl) patch.avatarUrl = avatarUrl
    await db.collection(COLL.USERS).doc(user._id).update({ data: patch })
    return { user: shape({ ...user, ...patch }) }
  },

  /** 绑定手机号：小程序端 getPhoneNumber 拿到 code，这里换取真实号码 */
  async bindPhone(event, { openid }) {
    const { code } = event
    if (!code) throw new BizError('缺少手机号凭证', 'INVALID_PARAM')
    const { cloud } = require('./common')
    const res = await cloud.openapi.phonenumber.getPhoneNumber({ code })
    const phone = res?.phoneInfo?.purePhoneNumber
    if (!phone) throw new BizError('手机号获取失败', 'PHONE_FAILED')
    const user = await getUser(openid, { createIfMissing: true })
    await db.collection(COLL.USERS).doc(user._id).update({
      data: { phone, updatedAt: new Date() }
    })
    return { phone }
  },

  /** 拉取当前用户完整档案（会员页、我的页用） */
  async profile(event, { openid }) {
    const user = await getUser(openid, { createIfMissing: true })
    return { user: shape(user) }
  }
}

/** 只向前端暴露必要字段 */
function shape(user) {
  const lv = levelOf(user.totalSpent || 0)
  return {
    _id: user._id,
    nickName: user.nickName,
    avatarUrl: user.avatarUrl,
    phone: user.phone ? user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '',
    hasPhone: !!user.phone,
    role: user.role || 'user',
    isAdmin: user.role === 'admin',
    points: user.points || 0,
    totalSpent: user.totalSpent || 0,
    orderCount: user.orderCount || 0,
    memberLevel: lv.level,
    memberName: lv.name,
    discount: lv.discount,
    createdAt: user.createdAt
  }
}

exports.main = handler(actions)
