const app = getApp()
const api = require('../../utils/api')
const cart = require('../../utils/cart')
const util = require('../../utils/util')

/** 状态 → 头部配色与提示 */
const STATUS_STYLE = {
  pending_pay: { cls: 'warn', hint: '请在 30 分钟内完成支付' },
  paid: { cls: '', hint: '花店已收到订单，正在安排备货' },
  preparing: { cls: '', hint: '花艺师正在精心制作中' },
  delivering: { cls: '', hint: '鲜花已出发，请保持电话畅通' },
  pending_pickup: { cls: '', hint: '已备货完成，请凭自提码到店取花' },
  completed: { cls: 'done', hint: '感谢您的信任，期待再次为您服务' },
  cancelled: { cls: 'gray', hint: '订单已取消' },
  refunding: { cls: 'warn', hint: '退款申请处理中，预计 1-3 个工作日' },
  refunded: { cls: 'gray', hint: '退款已原路退回' }
}

Page({
  data: {
    orderId: '',
    order: null,
    shop: {},
    loading: true,
    headClass: '',
    statusHint: '',
    countdownText: '',
    timeline: [],
    goodsText: '0.00',
    feeText: '0',
    deliveryFeeLabel: '免配送费',
    couponText: '0.00',
    totalText: '0.00',
    createdText: '',
    paidText: ''
  },

  onLoad(options) {
    this.setData({ orderId: options.id || '' })
    if (options.paid === '1') {
      // 支付回调可能略有延迟，稍后再拉一次确保状态是最新的
      setTimeout(() => this.loadDetail(), 1500)
    }
    this.loadDetail()
    this.loadShop()
  },

  onUnload() {
    this.clearTimer()
  },

  onHide() {
    this.clearTimer()
  },

  loadDetail() {
    return api.order('detail', { orderId: this.data.orderId })
      .then(res => {
        const o = res.order
        const style = STATUS_STYLE[o.status] || { cls: '', hint: '' }
        this.setData({
          order: {
            ...o,
            items: o.items.map(i => ({ ...i, priceText: util.yuanShort(i.unitPrice) }))
          },
          loading: false,
          headClass: style.cls,
          statusHint: style.hint,
          goodsText: util.yuan(o.goodsAmount),
          feeText: util.yuanShort(o.deliveryFee),
          deliveryFeeLabel: o.deliveryFee > 0 ? `¥${util.yuanShort(o.deliveryFee)}` : '免配送费',
          couponText: util.yuan(o.couponDiscount),
          totalText: util.yuan(o.totalAmount),
          createdText: util.formatTime(o.createdAt, 'YYYY-MM-DD HH:mm:ss'),
          paidText: o.paidAt ? util.formatTime(o.paidAt, 'YYYY-MM-DD HH:mm:ss') : '',
          // 最新的进度排在最前
          timeline: (o.timeline || []).slice().reverse().map(t => ({
            ...t,
            atText: util.formatTime(t.at, 'YYYY-MM-DD HH:mm')
          }))
        })
        if (o.status === 'pending_pay') this.startCountdown(o.createdAt)
        else this.clearTimer()
      })
      .catch(() => this.setData({ loading: false }))
  },

  loadShop() {
    if (app.globalData.shop) return this.setData({ shop: app.globalData.shop })
    return api.shop('shopInfo', {}, { toast: false })
      .then(res => {
        app.globalData.shop = res.shop
        this.setData({ shop: res.shop })
      })
      .catch(() => {})
  },

  /** 待付款倒计时：到点自动刷新一次状态 */
  startCountdown(createdAt) {
    this.clearTimer()
    const tick = () => {
      const text = util.countdown(createdAt, 30)
      this.setData({ countdownText: text })
      if (!text) {
        this.clearTimer()
        this.loadDetail()
      }
    }
    tick()
    this._timer = setInterval(tick, 1000)
  },

  clearTimer() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  onPay() {
    api.pay('prepay', { orderId: this.data.orderId }, { loading: true, loadingText: '调起支付' })
      .then(res => new Promise((resolve, reject) => {
        wx.requestPayment({ ...res.payment, success: resolve, fail: reject })
      }))
      .then(() => {
        util.success('支付成功')
        app.refreshUser()
        setTimeout(() => this.loadDetail(), 800)
      })
      .catch(err => {
        if (!(err.errMsg || '').includes('cancel')) util.toast(err.message || '支付未完成')
      })
  },

  onCancel() {
    const paid = this.data.order.status !== 'pending_pay'
    util.confirm(
      paid ? '订单已支付，取消后转为退款申请，由商家审核' : '确定取消该订单？',
      paid ? '申请退款' : '取消订单'
    ).then(yes => {
      if (!yes) return
      api.order('cancel', { orderId: this.data.orderId }, { loading: true })
        .then(() => {
          util.success(paid ? '已提交退款申请' : '订单已取消')
          this.loadDetail()
        })
        .catch(() => {})
    })
  },

  onConfirm() {
    util.confirm('请确认已收到鲜花', '确认收货').then(yes => {
      if (!yes) return
      api.order('confirm', { orderId: this.data.orderId }, { loading: true })
        .then(() => {
          util.success('已确认收货')
          this.loadDetail()
        })
        .catch(() => {})
    })
  },

  onRebuy() {
    api.order('rebuy', { orderId: this.data.orderId }, { loading: true })
      .then(res => {
        if (!res.items.length) return util.toast('商品都已下架了')
        res.items.forEach(i => cart.add({
          _id: i.productId, name: i.name, cover: i.cover,
          price: i.price, unit: i.unit, stock: i.stock
        }, i.quantity))
        util.success('已加入购物车')
        setTimeout(() => wx.switchTab({ url: '/pages/cart/cart' }), 900)
      })
      .catch(() => {})
  },

  copyCode() {
    util.copy(this.data.order.pickupCode, '自提码已复制')
  },

  copyOrderNo() {
    util.copy(this.data.order.orderNo, '订单号已复制')
  },

  callCourier() {
    util.callPhone(this.data.order.courierPhone)
  },

  callShop() {
    util.callPhone(this.data.shop.phone)
  },

  goProduct(e) {
    wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${e.currentTarget.dataset.id}` })
  }
})
