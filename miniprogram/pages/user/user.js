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
    showInitEntry: false
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
      if (user) this.applyUser(user)
      this.loadCounters()
      this.loadMember()
    })
  },

  applyUser(user) {
    if (!user) return
    this.setData({
      user,
      spentText: util.yuanShort(user.totalSpent || 0),
      discountText: user.discount < 1000 ? (user.discount / 100).toFixed(1) : '',
      // 没有任何管理员时，允许首个用户自助成为店主
      showInitEntry: !user.isAdmin
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

  /** 首个用户自助成为店主；已有管理员时云函数会拒绝 */
  onInitAdmin() {
    util.confirm(
      '仅当店铺尚无管理员时可用。设为店主后可管理商品、订单与库存。',
      '设为店主'
    ).then(yes => {
      if (!yes) return
      api.seed('initAdmin', {}, { loading: true })
        .then(() => app.refreshUser())
        .then(user => {
          if (user) this.applyUser(user)
          util.success('已设为店主')
        })
        .catch(err => {
          if (err.code === 'ADMIN_EXISTS') {
            this.setData({ showInitEntry: false })
          }
        })
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
