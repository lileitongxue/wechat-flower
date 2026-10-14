const app = getApp()
const api = require('../../utils/api')
const cart = require('../../utils/cart')
const util = require('../../utils/util')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    banners: [],
    categories: [],
    hot: [],
    newest: [],
    shop: null,
    loading: true
  },

  onLoad() {
    this.setNavSize()
    this.loadHome()
    this.loadShop()
  },

  onShow() {
    cart.refreshBadge()
    // 会员等级变化会影响会员价，返回首页时轻量刷新
    if (this._needRefresh) {
      this._needRefresh = false
      this.loadHome()
    }
  },

  onPullDownRefresh() {
    Promise.all([this.loadHome(), this.loadShop()])
      .finally(() => wx.stopPullDownRefresh())
  },

  onShareAppMessage() {
    return {
      title: '花知道 · 用一束花说想说的话',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return { title: '花知道 · 鲜花工作室' }
  },

  /** 计算自定义导航高度：胶囊按钮位置决定导航条高度 */
  setNavSize() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const statusBarHeight = win.statusBarHeight || 20
    let navBarHeight = 44
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      if (menu && menu.height) {
        navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height
      }
    } catch (e) {
      // 开发者工具个别版本取不到胶囊信息，退回默认值
    }
    this.setData({ statusBarHeight, navBarHeight })
  },

  loadHome() {
    return api.shop('home')
      .then(res => {
        this.setData({
          banners: res.banners || [],
          categories: res.categories || [],
          hot: res.hot || [],
          newest: res.newest || [],
          loading: false
        })
      })
      .catch(() => this.setData({ loading: false }))
  },

  loadShop() {
    return api.shop('shopInfo', {}, { toast: false })
      .then(res => {
        this.setData({ shop: res.shop })
        app.globalData.shop = res.shop
      })
      .catch(() => {})
  },

  onAdd(e) {
    const product = e.detail.product
    const r = cart.add(product, 1)
    if (!r.ok) return util.toast(r.message)
    util.success('已加入购物车')
  },

  onBanner(e) {
    const link = e.currentTarget.dataset.link
    if (!link) return
    // tabBar 页面必须用 switchTab
    const isTab = ['/pages/index/index', '/pages/category/category', '/pages/cart/cart', '/pages/user/user']
      .some(p => link.startsWith(p))
    if (isTab) wx.switchTab({ url: link })
    else wx.navigateTo({ url: link })
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  goCategory(e) {
    // switchTab 不支持 query，把目标分类暂存到 globalData，由分类页 onShow 消费
    app.globalData.pendingCategoryId = e.currentTarget.dataset.id || ''
    wx.switchTab({ url: '/pages/category/category' })
  },

  goReservation() {
    wx.navigateTo({ url: '/pages/reservation-create/reservation-create' })
  },

  goCoupon() {
    wx.navigateTo({ url: '/pages/coupon/coupon' })
  },

  goMember() {
    wx.navigateTo({ url: '/pages/member/member' })
  },

  goShop() {
    wx.navigateTo({ url: '/pages/shop-info/shop-info' })
  }
})
