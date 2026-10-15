/* eslint-disable */
const api = require('./utils/api')
const cart = require('./utils/cart')

App({
  globalData: {
    /** 登录态：云开发下 openid 由平台注入，这里只缓存用户档案 */
    userInfo: null,
    openid: '',
    isAdmin: false,
    shop: null,
    /** 登录请求的 Promise，避免多页面并发重复登录 */
    loginPromise: null,
    /** 登录失败是否因为数据库集合未创建——决定「我的」页是否显示初始化入口 */
    setupRequired: false,
    systemInfo: null
  },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({
        title: '基础库版本过低',
        content: '请使用 2.2.3 或以上的基础库，并在开发者工具中开启云开发',
        showCancel: false
      })
      return
    }
    wx.cloud.init({
      // DYNAMIC_CURRENT_ENV 让小程序自动指向当前环境，多环境切换时无需改代码
      env: wx.cloud.DYNAMIC_CURRENT_ENV,
      traceUser: true
    })

    this.globalData.systemInfo = wx.getWindowInfo
      ? { ...wx.getWindowInfo(), ...wx.getDeviceInfo() }
      : wx.getSystemInfoSync()

    cart.migrate()
    this.login()
  },

  onShow() {
    cart.refreshBadge()
  },

  /**
   * 登录并缓存用户档案。重复调用会复用同一个请求。
   * @returns {Promise<object|null>} 用户档案
   */
  login() {
    if (this.globalData.loginPromise) return this.globalData.loginPromise
    const p = api.call('login', 'login')
      .then(res => {
        this.globalData.userInfo = res.user
        this.globalData.openid = res.openid
        this.globalData.isAdmin = !!res.user.isAdmin
        // 登录成功说明数据库可用，清掉未初始化标记
        this.globalData.setupRequired = false
        this.emit('userChange', res.user)
        return res.user
      })
      .catch(err => {
        console.error('登录失败', err)
        // 集合未创建时登录必然失败，标记出来让「我的」页引导一键初始化
        if (err.code === 'COLLECTION_MISSING') this.globalData.setupRequired = true
        // 失败后允许下次重试
        this.globalData.loginPromise = null
        return null
      })
    this.globalData.loginPromise = p
    return p
  },

  /** 强制刷新用户档案（授权、下单后调用） */
  refreshUser() {
    this.globalData.loginPromise = null
    return this.login()
  },

  /** 等待登录完成，页面 onLoad 里直接 await */
  ready() {
    return this.globalData.userInfo
      ? Promise.resolve(this.globalData.userInfo)
      : this.login()
  },

  // --- 极简事件总线：用户信息变化时通知已打开的页面 ---
  _listeners: {},

  on(evt, fn) {
    (this._listeners[evt] = this._listeners[evt] || []).push(fn)
  },

  off(evt, fn) {
    const arr = this._listeners[evt]
    if (!arr) return
    const i = arr.indexOf(fn)
    if (i > -1) arr.splice(i, 1)
  },

  emit(evt, payload) {
    (this._listeners[evt] || []).forEach(fn => {
      try { fn(payload) } catch (e) { console.error(e) }
    })
  }
})
