const app = getApp()
const api = require('../../utils/api')
const cart = require('../../utils/cart')
const util = require('../../utils/util')

Page({
  data: {
    id: '',
    product: null,
    related: [],
    shop: {},
    loading: true,
    cartCount: 0,
    // 规格弹层
    skuVisible: false,
    skuMode: 'cart',
    quantity: 1,
    maxQty: 99,
    greetingCard: '',
    priceText: '0',
    originalText: '0',
    totalText: '0',
    buyText: '立即购买',
    discountText: '',
    deliveryFeeText: '8',
    freeThresholdText: '199'
  },

  onLoad(options) {
    const id = options.id || ''
    if (!id) {
      util.toast('缺少商品参数')
      return
    }
    this.setData({ id })
    this.loadDetail()
    this.loadShop()
  },

  onShow() {
    this.setData({ cartCount: cart.count() })
    cart.refreshBadge()
  },

  onShareAppMessage() {
    const p = this.data.product
    return {
      title: p ? `${p.name} · ${p.subtitle || '花知道'}` : '花知道',
      path: `/pages/product-detail/product-detail?id=${this.data.id}`,
      imageUrl: p && p.cover ? p.cover : ''
    }
  },

  loadDetail() {
    return api.shop('productDetail', { id: this.data.id })
      .then(res => {
        const p = res.product
        const price = p.hasMemberPrice ? p.memberPrice : p.price
        this.setData({
          product: p,
          related: res.related || [],
          loading: false,
          maxQty: Math.max(Math.min(p.stock || 0, cart.MAX_QTY), 1),
          buyText: (p.stock || 0) > 0 ? '立即购买' : '已售罄',
          priceText: util.yuanShort(price),
          originalText: util.yuanShort(p.originalPrice || p.price),
          totalText: util.yuan(price),
          discountText: p.hasMemberPrice
            ? `${(Math.round((p.memberPrice / p.price) * 1000) / 100).toFixed(1)}折`
            : ''
        })
        wx.setNavigationBarTitle({ title: p.name })
      })
      .catch(() => this.setData({ loading: false, product: null }))
  },

  loadShop() {
    const cached = app.globalData.shop
    if (cached) return this.applyShop(cached)
    return api.shop('shopInfo', {}, { toast: false })
      .then(res => {
        app.globalData.shop = res.shop
        this.applyShop(res.shop)
      })
      .catch(() => {})
  },

  applyShop(shop) {
    this.setData({
      shop,
      deliveryFeeText: util.yuanShort(shop.deliveryFee || 0),
      freeThresholdText: util.yuanShort(shop.freeDeliveryThreshold || 0)
    })
  },

  preview(e) {
    const current = e.currentTarget.dataset.url
    wx.previewImage({ current, urls: this.data.product.images })
  },

  openSku(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ skuVisible: true, skuMode: mode })
    this.recalcTotal(this.data.quantity)
  },

  closeSku() {
    this.setData({ skuVisible: false })
  },

  noop() {},

  onQtyChange(e) {
    const value = e.detail.value
    this.setData({ quantity: value })
    this.recalcTotal(value)
  },

  onQtyOverflow() {
    const p = this.data.product
    util.toast(p.stock < cart.MAX_QTY ? `库存仅剩 ${p.stock} 件` : `单品最多 ${cart.MAX_QTY} 件`)
  },

  onCardInput(e) {
    this.setData({ greetingCard: e.detail.value })
  },

  recalcTotal(qty) {
    const p = this.data.product
    if (!p) return
    const price = p.hasMemberPrice ? p.memberPrice : p.price
    this.setData({ totalText: util.yuan(price * qty) })
  },

  confirmSku() {
    const { product, quantity, skuMode, greetingCard } = this.data
    const r = cart.add(product, quantity)
    if (!r.ok) return util.toast(r.message)
    this.setData({ skuVisible: false, cartCount: r.total })

    if (skuMode === 'buy') {
      // 直接结算：只勾选当前商品，避免把购物车里其它商品一起下单
      cart.selectAll(false)
      cart.toggleSelect(product._id, true)
      const url = greetingCard
        ? `/pages/order-confirm/order-confirm?card=${encodeURIComponent(greetingCard)}`
        : '/pages/order-confirm/order-confirm'
      wx.navigateTo({ url })
    } else {
      util.success('已加入购物车')
    }
  },

  goCart() {
    wx.switchTab({ url: '/pages/cart/cart' })
  },

  goReservation() {
    wx.navigateTo({
      url: `/pages/reservation-create/reservation-create?productId=${this.data.id}`
    })
  },

  goShop() {
    wx.navigateTo({ url: '/pages/shop-info/shop-info' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
