const app = getApp()
const api = require('../../utils/api')
const cart = require('../../utils/cart')
const util = require('../../utils/util')

Page({
  data: {
    tabs: [
      { key: 'all', label: '全部', badge: '' },
      { key: 'pending_pay', label: '待付款', badge: 'pendingPay' },
      { key: 'paid', label: '待发货', badge: 'paid' },
      { key: 'receiving', label: '待收货', badge: 'receiving' },
      { key: 'completed', label: '已完成', badge: '' }
    ],
    status: 'all',
    list: [],
    counters: {},
    page: 1,
    hasMore: true,
    loading: false,
    refreshing: false
  },

  onLoad(options) {
    if (options.status) this.setData({ status: options.status })
    this.reload()
  },

  onShow() {
    this.loadCounters()
    // 从详情页返回后状态可能已变，静默刷新第一页
    if (this._dirty) {
      this._dirty = false
      this.reload()
    }
  },

  reload() {
    this.setData({ list: [], page: 1, hasMore: true })
    return this.fetch()
  },

  fetch() {
    if (this.data.loading) return Promise.resolve()
    this.setData({ loading: true })
    const { status, page } = this.data
    return api.order('list', { status, page, pageSize: 10 })
      .then(res => {
        const mapped = (res.list || []).map(o => ({
          ...o,
          createdAtText: util.formatTime(o.createdAt, 'YYYY-MM-DD HH:mm'),
          totalText: util.yuan(o.totalAmount),
          items: o.items.map(g => ({ ...g, priceText: util.yuanShort(g.unitPrice) }))
        }))
        const list = page === 1 ? mapped : this.data.list.concat(mapped)
        this.setData({ list, loading: false, hasMore: list.length < res.total })
      })
      .catch(() => this.setData({ loading: false, hasMore: false }))
  },

  loadCounters() {
    return api.order('counters', {}, { toast: false })
      .then(res => this.setData({ counters: res }))
      .catch(() => {})
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading) return
    this.setData({ page: this.data.page + 1 })
    this.fetch()
  },

  onRefresh() {
    this.setData({ refreshing: true })
    Promise.all([this.reload(), this.loadCounters()])
      .finally(() => this.setData({ refreshing: false }))
  },

  onTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.status) return
    this.setData({ status: key })
    this.reload()
  },

  onPay(e) {
    const orderId = e.currentTarget.dataset.id
    api.pay('prepay', { orderId }, { loading: true, loadingText: '调起支付' })
      .then(res => new Promise((resolve, reject) => {
        wx.requestPayment({ ...res.payment, success: resolve, fail: reject })
      }))
      .then(() => {
        util.success('支付成功')
        app.refreshUser()
        this.reload()
        this.loadCounters()
      })
      .catch(err => {
        if (!(err.errMsg || '').includes('cancel')) {
          util.toast(err.message || '支付未完成')
        }
      })
  },

  onCancel(e) {
    const orderId = e.currentTarget.dataset.id
    const order = this.data.list.find(o => o._id === orderId)
    const paid = order && order.status !== 'pending_pay'
    util.confirm(
      paid ? '订单已支付，取消后将转为退款申请，由商家处理' : '确定取消该订单？',
      '取消订单'
    ).then(yes => {
      if (!yes) return
      api.order('cancel', { orderId }, { loading: true })
        .then(() => {
          util.success(paid ? '已提交退款申请' : '订单已取消')
          this.reload()
          this.loadCounters()
        })
        .catch(() => {})
    })
  },

  onConfirm(e) {
    const orderId = e.currentTarget.dataset.id
    util.confirm('请确认已收到鲜花', '确认收货').then(yes => {
      if (!yes) return
      api.order('confirm', { orderId }, { loading: true })
        .then(() => {
          util.success('已确认收货')
          this.reload()
          this.loadCounters()
        })
        .catch(() => {})
    })
  },

  onRebuy(e) {
    const orderId = e.currentTarget.dataset.id
    api.order('rebuy', { orderId }, { loading: true })
      .then(res => {
        if (!res.items.length) return util.toast('商品都已下架了')
        let added = 0
        res.items.forEach(i => {
          const r = cart.add({
            _id: i.productId, name: i.name, cover: i.cover,
            price: i.price, unit: i.unit, stock: i.stock
          }, i.quantity)
          if (r.ok) added++
        })
        if (res.missing.length) {
          util.toast(`${res.missing.length} 件商品已下架`)
        } else {
          util.success(`已加入 ${added} 件商品`)
        }
        setTimeout(() => wx.switchTab({ url: '/pages/cart/cart' }), 900)
      })
      .catch(() => {})
  },

  goDetail(e) {
    this._dirty = true
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${e.currentTarget.dataset.id}` })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
