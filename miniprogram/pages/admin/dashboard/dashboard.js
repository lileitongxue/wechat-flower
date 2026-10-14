const app = getApp()
const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data: {
    data: { lowStock: [] },
    revenueText: '0.00',
    lowStockCount: 0
  },

  onLoad() {
    // 非管理员直接拦住，避免白屏或越权请求
    app.ready().then(user => {
      if (!user || !user.isAdmin) {
        wx.showModal({
          title: '无权访问',
          content: '当前账号不是管理员',
          showCancel: false,
          success: () => wx.navigateBack()
        })
        return
      }
      this.load()
    })
  },

  onShow() {
    if (this._loaded) this.load()
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  load() {
    this._loaded = true
    return api.admin('dashboard')
      .then(res => {
        const lowStock = (res.lowStock || []).map(i => ({
          ...i,
          outOfStock: (i.stock || 0) <= 0,
          stockText: (i.stock || 0) <= 0 ? '已售罄' : `剩 ${i.stock}`
        }))
        this.setData({
          data: { ...res, lowStock },
          revenueText: util.yuan(res.todayRevenue || 0),
          lowStockCount: lowStock.length
        })
      })
      .catch(() => {})
  },

  /** 自提核销：输入 6 位码 */
  onVerifyPickup() {
    wx.showModal({
      title: '自提核销',
      editable: true,
      placeholderText: '请输入 6 位自提码',
      confirmColor: '#c2185b',
      success: (r) => {
        if (!r.confirm) return
        const code = (r.content || '').trim()
        if (!/^\d{6}$/.test(code)) return util.toast('请输入 6 位数字')
        api.admin('verifyPickup', { pickupCode: code }, { loading: true, loadingText: '核销中' })
          .then(res => {
            const names = res.items.map(i => `${i.name} ×${i.quantity}`).join('\n')
            wx.showModal({
              title: '核销成功',
              content: `订单 ${res.orderNo}\n取货人：${res.contactName}\n\n${names}`,
              showCancel: false,
              confirmColor: '#c2185b'
            })
            this.load()
          })
          .catch(() => {})
      }
    })
  },

  /** 快速补货 */
  onQuickStock(e) {
    const { id, name } = e.currentTarget.dataset
    wx.showModal({
      title: `补货：${name}`,
      editable: true,
      placeholderText: '输入补货数量，如 20',
      confirmColor: '#c2185b',
      success: (r) => {
        if (!r.confirm) return
        const delta = Math.floor(Number(r.content))
        if (!delta || delta <= 0) return util.toast('请输入正整数')
        api.admin('adjustStock', { productId: id, delta, reason: '管理台快速补货' }, { loading: true })
          .then(res => {
            util.success(`库存已更新为 ${res.stock}`)
            this.load()
          })
          .catch(() => {})
      }
    })
  },

  onSeed() {
    util.confirm(
      '将创建示例分类、商品与优惠券（已存在的不会重复创建）。仅建议首次使用时执行。',
      '初始化示例数据'
    ).then(yes => {
      if (!yes) return
      api.seed('seedData', {}, { loading: true, loadingText: '初始化中' })
        .then(res => {
          wx.showModal({
            title: '初始化完成',
            content: res.message,
            showCancel: false,
            confirmColor: '#c2185b'
          })
          this.load()
        })
        .catch(() => {})
    })
  },

  goProducts(e) {
    const status = (e && e.currentTarget.dataset.status) || ''
    wx.navigateTo({ url: `/pages/admin/products/products${status ? '?status=' + status : ''}` })
  },

  goProductEdit(e) {
    const id = (e && e.currentTarget.dataset.id) || ''
    wx.navigateTo({ url: `/pages/admin/product-edit/product-edit${id ? '?id=' + id : ''}` })
  },

  goOrders(e) {
    const status = (e && e.currentTarget.dataset.status) || 'all'
    wx.navigateTo({ url: `/pages/admin/orders/orders?status=${status}` })
  },

  goReservations() { wx.navigateTo({ url: '/pages/admin/reservations/reservations' }) },
  goStats() { wx.navigateTo({ url: '/pages/admin/stats/stats' }) }
})
