const app = getApp()
const api = require('../../utils/api')
const cart = require('../../utils/cart')
const util = require('../../utils/util')

Page({
  data: {
    list: [],
    editing: false,
    allSelected: false,
    selectedCount: 0,
    totalText: '0.00',
    deliveryFee: 0,
    deliveryFeeText: '0',
    freeTip: ''
  },

  onShow() {
    this.loadShop().then(() => this.refresh(true))
  },

  /** @param {boolean} validate 是否向服务端校验价格与库存 */
  refresh(validate = false) {
    const raw = cart.read()
    if (!raw.length) {
      this.setData({ list: [], selectedCount: 0, totalText: '0.00', allSelected: false })
      cart.refreshBadge([])
      return Promise.resolve()
    }
    this.render(raw)

    if (!validate) return Promise.resolve()
    // 进入页面时用服务端数据纠正本地快照（价格变动、下架、库存不足）
    return api.shop('validateCart', {
      items: raw.map(i => ({ productId: i.productId, quantity: i.quantity }))
    }, { toast: false }).then(res => {
      const { list, invalid } = cart.syncWithServer(res.items || [])
      this.render(list)
      if (invalid.length) {
        wx.showModal({
          title: '部分商品已失效',
          content: invalid.map(i => `${i.name}（${i.reason}）`).join('\n') + '\n已自动移出购物车',
          showCancel: false,
          confirmColor: '#c2185b'
        })
      }
    }).catch(() => {})
  },

  render(list) {
    const shop = app.globalData.shop || {}
    const selected = list.filter(i => i.selected)
    const amount = selected.reduce((s, i) => s + i.price * i.quantity, 0)
    const threshold = shop.freeDeliveryThreshold ?? 19900
    const baseFee = shop.deliveryFee ?? 800
    const deliveryFee = selected.length === 0 || amount >= threshold ? 0 : baseFee

    this.setData({
      list: list.map(i => ({
        ...i,
        priceText: util.yuanShort(i.price),
        maxQty: Math.max(Math.min(i.stock == null ? cart.MAX_QTY : i.stock, cart.MAX_QTY), 1),
        lowStock: i.stock != null && i.stock <= 5,
        stockText: i.stock > 0 ? `仅剩 ${i.stock} 件` : '已售罄'
      })),
      selectedCount: selected.reduce((s, i) => s + i.quantity, 0),
      allSelected: list.length > 0 && selected.length === list.length,
      totalText: util.yuan(amount),
      deliveryFee,
      deliveryFeeText: util.yuanShort(deliveryFee),
      freeTip: amount >= threshold
        ? '已满免配送费门槛，本单免运费'
        : `再买 ¥${util.yuanShort(threshold - amount)} 免配送费`
    })
  },

  loadShop() {
    if (app.globalData.shop) return Promise.resolve()
    return api.shop('shopInfo', {}, { toast: false })
      .then(res => { app.globalData.shop = res.shop })
      .catch(() => {})
  },

  toggleEdit() {
    this.setData({ editing: !this.data.editing })
  },

  onToggle(e) {
    cart.toggleSelect(e.currentTarget.dataset.id)
    this.refresh()
  },

  onSelectAll() {
    cart.selectAll(!this.data.allSelected)
    this.refresh()
  },

  onQtyChange(e) {
    const r = cart.setQuantity(e.currentTarget.dataset.id, e.detail.value)
    if (!r.ok) util.toast(r.message)
    this.refresh()
  },

  onQtyOverflow(e) {
    const item = this.data.list.find(i => i.productId === e.currentTarget.dataset.id)
    if (item) util.toast(item.stock < cart.MAX_QTY ? `库存仅剩 ${item.stock} 件` : `单品最多 ${cart.MAX_QTY} 件`)
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id
    util.confirm('确定移出购物车？').then(yes => {
      if (!yes) return
      cart.remove(id)
      this.refresh()
    })
  },

  onRemoveSelected() {
    const ids = cart.selectedItems().map(i => i.productId)
    if (!ids.length) return util.toast('请先选择商品')
    util.confirm(`确定移除这 ${ids.length} 种商品？`).then(yes => {
      if (!yes) return
      cart.removeMany(ids)
      this.setData({ editing: false })
      this.refresh()
    })
  },

  goCheckout() {
    if (!this.data.selectedCount) return util.toast('请先选择商品')
    // 售罄商品不能进结算页
    const sold = cart.selectedItems().filter(i => i.stock != null && i.stock <= 0)
    if (sold.length) return util.toast(`「${sold[0].name}」已售罄，请先移除`)
    wx.navigateTo({ url: '/pages/order-confirm/order-confirm' })
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${e.currentTarget.dataset.id}` })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
