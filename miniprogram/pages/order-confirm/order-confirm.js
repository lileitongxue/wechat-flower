const app = getApp()
const api = require('../../utils/api')
const cart = require('../../utils/cart')
const util = require('../../utils/util')

Page({
  data: {
    items: [],
    itemCount: 0,
    deliveryType: 'delivery',
    address: null,
    shop: {},
    pickupTime: '',
    pickupDates: [],
    timeRanges: [],
    pickupVisible: false,
    contactPhone: '',
    greetingCard: '',
    remark: '',
    coupons: [],
    coupon: null,
    couponCount: 0,
    couponVisible: false,
    // 金额（分）
    goodsAmount: 0,
    deliveryFee: 0,
    memberDiscountAmount: 0,
    total: 0,
    // 展示文案
    goodsAmountText: '0.00',
    deliveryFeeText: '0',
    deliveryFeeLabel: '免配送费',
    memberDiscountText: '0.00',
    couponDiscountText: '0.00',
    totalText: '0.00',
    submitting: false
  },

  onLoad(options) {
    if (options.card) {
      this.setData({ greetingCard: decodeURIComponent(options.card) })
    }
    const items = cart.selectedItems()
    if (!items.length) {
      util.toast('请先选择商品')
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this.setData({
      items: items.map(i => ({ ...i, priceText: util.yuanShort(i.price) })),
      itemCount: items.reduce((s, i) => s + i.quantity, 0)
    })
    this.loadShop()
    this.loadAddress()
    this.loadCoupons()
    this.calc()
  },

  onShow() {
    // 从地址页返回时重新取默认地址
    if (this._addressDirty) {
      this._addressDirty = false
      this.loadAddress()
    }
  },

  loadShop() {
    const apply = (shop) => {
      this.setData({
        shop,
        timeRanges: shop.timeRanges || ['09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00']
      })
      this.buildPickupDates(shop)
      this.calc()
    }
    if (app.globalData.shop) return apply(app.globalData.shop)
    return api.shop('shopInfo', {}, { toast: false })
      .then(res => { app.globalData.shop = res.shop; apply(res.shop) })
      .catch(() => {})
  },

  /** 自提日期：今天 + 未来 6 天 */
  buildPickupDates(shop) {
    const festivals = shop.festivals || []
    const out = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 86400000)
      const key = `${d.getMonth() + 1}-${d.getDate()}`
      const label = i === 0 ? '今天' : i === 1 ? '明天' : `${d.getMonth() + 1}月${d.getDate()}日`
      const hit = festivals.find(f => f.date === key)
      out.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        label,
        festival: hit ? hit.name : ''
      })
    }
    this.setData({ pickupDates: out })
  },

  loadAddress() {
    return api.member('defaultAddress', {}, { toast: false })
      .then(res => {
        this.setData({
          address: res.address,
          contactPhone: this.data.contactPhone || (res.address ? res.address.phone : '')
        })
      })
      .catch(() => {})
  },

  loadCoupons() {
    const goodsAmount = cart.selectedAmount()
    return api.member('usableCoupons', { goodsAmount }, { toast: false })
      .then(res => {
        const list = (res.list || []).map(c => ({
          ...c,
          valueText: c.type === 'discount' ? `${(c.value / 100).toFixed(1)}折` : `¥${util.yuanShort(c.value)}`,
          thresholdText: c.threshold ? `满${util.yuanShort(c.threshold)}可用` : '无门槛',
          discountText: util.yuan(c.discount)
        }))
        // 默认选最优券，用户可改
        this.setData({ coupons: list, couponCount: list.length, coupon: list[0] || null })
        this.calc()
      })
      .catch(() => {})
  },

  /** 本地试算，仅用于界面展示；最终金额以云函数返回为准 */
  calc() {
    const items = cart.selectedItems()
    const goodsAmount = items.reduce((s, i) => s + i.price * i.quantity, 0)
    // 原价小计 - 会员价小计 = 会员优惠
    const originalAmount = items.reduce((s, i) => s + (i.originalPrice || i.price) * i.quantity, 0)
    const memberDiscountAmount = Math.max(originalAmount - goodsAmount, 0)

    const shop = this.data.shop || {}
    const threshold = shop.freeDeliveryThreshold ?? 19900
    const baseFee = shop.deliveryFee ?? 800
    const deliveryFee = this.data.deliveryType === 'pickup' || goodsAmount >= threshold ? 0 : baseFee

    const coupon = this.data.coupon
    const couponDiscount = coupon
      ? (coupon.type === 'discount'
        ? Math.round(goodsAmount * (1000 - coupon.value) / 1000)
        : Math.min(coupon.value, goodsAmount))
      : 0

    const total = Math.max(goodsAmount + deliveryFee - couponDiscount, 1)

    this.setData({
      goodsAmount,
      deliveryFee,
      memberDiscountAmount,
      total,
      goodsAmountText: util.yuan(goodsAmount),
      deliveryFeeText: util.yuanShort(deliveryFee),
      deliveryFeeLabel: deliveryFee > 0 ? `¥${util.yuanShort(deliveryFee)}` : '免配送费',
      memberDiscountText: util.yuan(memberDiscountAmount),
      couponDiscountText: util.yuan(couponDiscount),
      totalText: util.yuan(total)
    })
  },

  onDeliveryType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.deliveryType) return
    this.setData({ deliveryType: type })
    this.calc()
  },

  goAddress() {
    this._addressDirty = true
    wx.navigateTo({ url: '/pages/address-list/address-list?select=1' })
  },

  openPickupPicker() { this.setData({ pickupVisible: true }) },
  closePickupPicker() { this.setData({ pickupVisible: false }) },
  pickTime(e) {
    this.setData({ pickupTime: e.currentTarget.dataset.value, pickupVisible: false })
  },

  openCouponPicker() {
    if (!this.data.coupons.length) return util.toast('暂无可用优惠券')
    this.setData({ couponVisible: true })
  },
  closeCouponPicker() { this.setData({ couponVisible: false }) },
  pickCoupon(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      coupon: index < 0 ? null : this.data.coupons[index],
      couponVisible: false
    })
    this.calc()
  },

  onPhoneInput(e) { this.setData({ contactPhone: e.detail.value }) },
  onCardInput(e) { this.setData({ greetingCard: e.detail.value }) },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }) },
  noop() {},

  submit() {
    if (this.data.submitting) return
    const { deliveryType, address, pickupTime, contactPhone } = this.data

    if (deliveryType === 'delivery' && !address) return util.toast('请选择收货地址')
    if (deliveryType === 'pickup') {
      if (!pickupTime) return util.toast('请选择自提时间')
      if (!/^1[3-9]\d{9}$/.test(contactPhone)) return util.toast('请填写正确的联系电话')
    }

    this.setData({ submitting: true })
    const items = cart.selectedItems().map(i => ({ productId: i.productId, quantity: i.quantity }))

    api.order('create', {
      items,
      deliveryType,
      addressId: deliveryType === 'delivery' ? address._id : '',
      pickupTime,
      contactPhone,
      greetingCard: this.data.greetingCard,
      remark: this.data.remark,
      couponId: this.data.coupon ? this.data.coupon._id : ''
    }, { loading: true, loadingText: '提交中' })
      .then(res => this.requestPay(res))
      .catch(err => {
        this.setData({ submitting: false })
        // 库存变化时刷新购物车快照，让用户看到最新库存
        if (err.code === 'OUT_OF_STOCK' || err.code === 'PRODUCT_OFF') {
          cart.read()
        }
      })
  },

  /** 下单成功后立即发起支付 */
  requestPay(order) {
    return api.pay('prepay', { orderId: order.orderId }, { loading: true, loadingText: '正在调起支付' })
      .then(res => new Promise((resolve, reject) => {
        wx.requestPayment({
          ...res.payment,
          success: resolve,
          fail: reject
        })
      }))
      .then(() => {
        // 支付成功：清掉已下单的商品，跳详情页
        cart.removeMany(cart.selectedItems().map(i => i.productId))
        app.refreshUser()
        util.success('支付成功')
        setTimeout(() => {
          wx.redirectTo({ url: `/pages/order-detail/order-detail?id=${order.orderId}&paid=1` })
        }, 1200)
      })
      .catch(err => {
        this.setData({ submitting: false })
        cart.removeMany(cart.selectedItems().map(i => i.productId))
        const cancelled = err && (err.errMsg || '').includes('cancel')
        wx.showModal({
          title: cancelled ? '支付已取消' : '支付未完成',
          content: cancelled
            ? '订单已保留 30 分钟，可在「我的订单」中继续支付'
            : (err.message || '可稍后在订单列表重新支付'),
          confirmText: '查看订单',
          cancelText: '留在本页',
          confirmColor: '#c2185b',
          success: (r) => {
            if (r.confirm) {
              wx.redirectTo({ url: `/pages/order-detail/order-detail?id=${order.orderId}` })
            }
          }
        })
      })
  }
})
