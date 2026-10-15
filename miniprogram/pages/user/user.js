const app = getApp()
const api = require('../../utils/api')
const cart = require('../../utils/cart')
const util = require('../../utils/util')

Page({
  data: {
    statusBarHeight: 20,
    user: {},
    counters: {},
    couponCount: 0,
    spentText: '0',
    discountText: '',
    showInitEntry: false,
    loginFailed: false,
    setupHint: ''
  },

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({ statusBarHeight: win.statusBarHeight || 20 })
    this._onUserChange = (user) => this.applyUser(user)
    app.on('userChange', this._onUserChange)
  },

  onUnload() {
    app.off('userChange', this._onUserChange)
  },

  onShow() {
    cart.refreshBadge()
    app.ready().then(user => {
      if (user) {
        this.applyUser(user)
        this.loadCounters()
        this.loadMember()
      } else {
        // 登录失败：多半是集合未创建。此时仍要亮出初始化入口，
        // 否则用户会卡在「什么按钮都没有」的死循环里。
        this.setData({
          loginFailed: true,
          showInitEntry: true,
          setupHint: app.globalData.setupRequired
            ? '数据库尚未初始化，点下方按钮一键完成'
            : '登录失败，请检查云函数是否已部署'
        })
      }
    })
  },

  applyUser(user) {
    if (!user) return
    this.setData({
      user,
      spentText: util.yuanShort(user.totalSpent || 0),
      discountText: user.discount < 1000 ? (user.discount / 100).toFixed(1) : '',
      // 没有任何管理员时，允许首个用户自助成为店主
      showInitEntry: !user.isAdmin,
      loginFailed: false,
      setupHint: ''
    })
  },

  loadCounters() {
    return api.order('counters', {}, { toast: false })
      .then(res => this.setData({ counters: res }))
      .catch(() => {})
  },

  loadMember() {
    return api.member('center', {}, { toast: false })
      .then(res => this.setData({ couponCount: res.couponCount || 0 }))
      .catch(() => {})
  },

  /** 头像昵称填写能力：头像先上传云存储再落库 */
  onChooseAvatar(e) {
    const filePath = e.detail.avatarUrl
    if (!filePath) return
    wx.showLoading({ title: '上传中', mask: true })
    api.uploadImage(filePath, 'avatars')
      .then(fileID => api.login('updateProfile', { avatarUrl: fileID }))
      .then(res => {
        app.globalData.userInfo = res.user
        this.applyUser(res.user)
        util.success('头像已更新')
      })
      .catch(() => util.toast('头像上传失败'))
      .finally(() => wx.hideLoading())
  },

  onEditProfile() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入昵称',
      content: this.data.user.nickName === '微信用户' ? '' : this.data.user.nickName,
      confirmColor: '#c2185b',
      success: (r) => {
        if (!r.confirm) return
        const nickName = (r.content || '').trim()
        if (!nickName) return util.toast('昵称不能为空')
        api.login('updateProfile', { nickName })
          .then(res => {
            app.globalData.userInfo = res.user
            this.applyUser(res.user)
            util.success('已更新')
          })
          .catch(() => {})
      }
    })
  },

  onGetPhone(e) {
    const code = e.detail.code
    if (!code) return util.toast('已取消授权')
    api.login('bindPhone', { code }, { loading: true, loadingText: '绑定中' })
      .then(() => app.refreshUser())
      .then(user => {
        if (user) this.applyUser(user)
        util.success('手机号已绑定')
      })
      .catch(() => {})
  },

  /**
   * 一键初始化：创建数据库集合 → 设为店主 → 灌示例数据。
   * 可重复执行，已存在的集合与数据会自动跳过。
   */
  onInitAdmin() {
    util.confirm(
      '将自动完成：创建数据库集合 → 将当前账号设为店主 → 灌入示例商品与优惠券。\n可重复执行，已存在的内容不会重复创建。',
      '一键初始化'
    ).then(yes => {
      if (!yes) return
      api.seed('bootstrap', {}, { loading: true, loadingText: '初始化中，请稍候' })
        .then(res => this.showBootstrapResult(res))
        .catch(err => {
          // 失败时给出可操作的下一步，而不是只弹一句「操作失败」
          wx.showModal({
            title: '初始化失败',
            content: `${err.message || '未知错误'}\n\n请确认：\n1. seed 云函数已上传部署\n2. 云开发环境已开通`,
            showCancel: false,
            confirmColor: '#c2185b'
          })
        })
    })
  },

  /** 展示初始化结果，并把登录态刷新一次 */
  showBootstrapResult(res) {
    const lines = [
      `集合：新建 ${res.collections.created.length} 个，已存在 ${res.collections.existed.length} 个`,
      res.becameAdmin ? '当前账号已设为店主' : (res.isAdmin ? '当前账号已是店主' : '店铺已有管理员'),
      res.seeded ? res.seeded.message : '示例数据已存在，未重复创建'
    ]
    if (res.collections.failed.length) {
      lines.push(`失败 ${res.collections.failed.length} 个：${res.collections.failed.map(f => f.name).join('、')}`)
    }
    if (res.collections.needManual) {
      // 自动建集合不可用时，必须明确告诉用户下一步做什么
      lines.push('')
      lines.push('当前环境不支持自动建集合，请到「云开发控制台 → 数据库」手动创建：')
      lines.push(res.collections.failed.map(f => f.name).join('、'))
      lines.push('建好后再次点击「一键初始化」即可。')
    }
    wx.showModal({
      title: res.collections.needManual ? '需要手动创建集合' : '初始化完成',
      content: lines.join('\n'),
      showCancel: false,
      confirmText: res.collections.needManual ? '知道了' : '开始使用',
      confirmColor: '#c2185b',
      success: () => {
        if (res.collections.needManual) return
        app.refreshUser().then(user => {
          if (user) this.applyUser(user)
          this.loadCounters()
          this.loadMember()
        })
      }
    })
  },

  goOrders(e) {
    const status = e.currentTarget.dataset.status || 'all'
    wx.navigateTo({ url: `/pages/order-list/order-list?status=${status}` })
  },

  goReservations() { wx.navigateTo({ url: '/pages/reservation-list/reservation-list' }) },
  goMember() { wx.navigateTo({ url: '/pages/member/member' }) },
  goCoupon() { wx.navigateTo({ url: '/pages/coupon/coupon' }) },
  goAddress() { wx.navigateTo({ url: '/pages/address-list/address-list' }) },
  goShop() { wx.navigateTo({ url: '/pages/shop-info/shop-info' }) },
  goAdmin() { wx.navigateTo({ url: '/pages/admin/dashboard/dashboard' }) }
})
