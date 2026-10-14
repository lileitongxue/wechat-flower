const app = getApp()
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    picked: [],
    products: [],
    productPage: 1,
    productHasMore: true,
    pickerVisible: false,
    slots: [],
    timeRanges: [],
    timeIndex: 0,
    deliveryDate: '',
    deliveryType: 'delivery',
    address: null,
    contactPhone: '',
    greetingCard: '',
    remark: '',
    payMode: 'deposit',
    total: 0,
    totalText: '0.00',
    depositText: '0.00',
    submitting: false
  },

  onLoad(options) {
    this.loadSlots()
    this.loadProducts()
    this.loadAddress()
    if (options.productId) this.preselect(options.productId)
  },

  onShow() {
    if (this._addressDirty) {
      this._addressDirty = false
      this.loadAddress()
    }
  },

  /** 从商品详情带参进来时预选该商品 */
  preselect(productId) {
    api.shop('productDetail', { id: productId }, { toast: false })
      .then(res => {
        const p = res.product
        if (p.supportReservation === false) return util.toast('该商品不支持预约')
        this.addPicked(p)
      })
      .catch(() => {})
  },

  loadSlots() {
    return api.shop('reservationSlots', { days: 60 })
      .then(res => {
        const slots = (res.slots || []).map(s => {
          const [, m, d] = s.date.split('-')
          return { ...s, dayText: `${Number(m)}/${Number(d)}` }
        })
        this.setData({
          slots,
          timeRanges: res.timeRanges || [],
          deliveryDate: this.data.deliveryDate || (slots[0] ? slots[0].date : '')
        })
      })
      .catch(() => {})
  },

  loadProducts() {
    if (!this.data.productHasMore) return Promise.resolve()
    return api.shop('products', { page: this.data.productPage, pageSize: 20 })
      .then(res => {
        const mapped = (res.list || [])
          .filter(p => p.supportReservation !== false)
          .map(p => ({ ...p, priceText: util.yuanShort(p.hasMemberPrice ? p.memberPrice : p.price) }))
        const products = this.data.productPage === 1 ? mapped : this.data.products.concat(mapped)
        this.setData({
          products,
          productHasMore: (res.list || []).length >= 20
        })
      })
      .catch(() => {})
  },

  loadMoreProducts() {
    if (!this.data.productHasMore) return
    this.setData({ productPage: this.data.productPage + 1 })
    this.loadProducts()
  },

  loadAddress() {
    return api.member('defaultAddress', {}, { toast: false })
      .then(res => this.setData({
        address: res.address,
        contactPhone: this.data.contactPhone || (res.address ? res.address.phone : '')
      }))
      .catch(() => {})
  },

  openPicker() { this.setData({ pickerVisible: true }) },
  closePicker() { this.setData({ pickerVisible: false }) },
  noop() {},

  onAddPick(e) {
    const p = this.data.products[Number(e.currentTarget.dataset.index)]
    if (p) this.addPicked(p)
  },

  addPicked(product) {
    const picked = this.data.picked.slice()
    const idx = picked.findIndex(i => i.productId === product._id)
    if (idx > -1) {
      picked[idx].quantity += 1
    } else {
      const price = product.hasMemberPrice ? product.memberPrice : product.price
      picked.push({
        productId: product._id,
        name: product.name,
        cover: product.cover || '',
        price,
        priceText: util.yuanShort(price),
        quantity: 1
      })
    }
    this.setData({ picked, pickerVisible: false })
    this.calc()
  },

  onRemovePick(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ picked: this.data.picked.filter(i => i.productId !== id) })
    this.calc()
  },

  onQtyChange(e) {
    const id = e.currentTarget.dataset.id
    const picked = this.data.picked.map(i =>
      i.productId === id ? { ...i, quantity: e.detail.value } : i
    )
    this.setData({ picked })
    this.calc()
  },

  /** 本地试算，最终金额以云函数为准 */
  calc() {
    const goodsAmount = this.data.picked.reduce((s, i) => s + i.price * i.quantity, 0)
    const shop = app.globalData.shop || {}
    const threshold = shop.freeDeliveryThreshold ?? 19900
    const baseFee = shop.deliveryFee ?? 800
    const deliveryFee = this.data.deliveryType === 'pickup' || goodsAmount >= threshold ? 0 : baseFee
    const total = goodsAmount + deliveryFee
    this.setData({
      total,
      totalText: util.yuan(total),
      depositText: util.yuan(Math.max(Math.round(total * 0.3), 100))
    })
  },

  onPickDate(e) {
    this.setData({ deliveryDate: e.currentTarget.dataset.date })
  },

  onTimeChange(e) {
    this.setData({ timeIndex: Number(e.detail.value) })
  },

  onType(e) {
    this.setData({ deliveryType: e.currentTarget.dataset.type })
    this.calc()
  },

  onPayMode(e) {
    this.setData({ payMode: e.currentTarget.dataset.mode })
  },

  onPhoneInput(e) { this.setData({ contactPhone: e.detail.value }) },
  onCardInput(e) { this.setData({ greetingCard: e.detail.value }) },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }) },

  goAddress() {
    this._addressDirty = true
    wx.navigateTo({ url: '/pages/address-list/address-list?select=1' })
  },

  submit() {
    if (this.data.submitting) return
    const { picked, deliveryDate, deliveryType, address, contactPhone, timeRanges, timeIndex } = this.data
    if (!picked.length) return util.toast('请选择花材')
    if (!deliveryDate) return util.toast('请选择交付日期')
    if (deliveryType === 'delivery' && !address) return util.toast('请选择收货地址')
    if (deliveryType === 'pickup' && !/^1[3-9]\d{9}$/.test(contactPhone)) {
      return util.toast('请填写正确的联系电话')
    }

    this.setData({ submitting: true })
    api.reservation('create', {
      items: picked.map(i => ({ productId: i.productId, quantity: i.quantity })),
      deliveryDate,
      deliveryTime: timeRanges[timeIndex] || '',
      deliveryType,
      addressId: deliveryType === 'delivery' ? address._id : '',
      contactPhone,
      greetingCard: this.data.greetingCard,
      remark: this.data.remark,
      payMode: this.data.payMode
    }, { loading: true, loadingText: '提交中' })
      .then(() => {
        wx.showModal({
          title: '预约已提交',
          content: '商家将在 24 小时内确认排期，确认后可在「我的预约」中查看并支付',
          showCancel: false,
          confirmText: '查看预约',
          confirmColor: '#c2185b',
          success: () => {
            wx.redirectTo({ url: '/pages/reservation-list/reservation-list' })
          }
        })
      })
      .catch(() => this.setData({ submitting: false }))
  }
})
