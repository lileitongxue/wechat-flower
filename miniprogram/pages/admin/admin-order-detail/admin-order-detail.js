const api = require('../../../utils/api')
const util = require('../../../utils/util')

const STATUS_TEXT = {
  pending_pay: '待付款', paid: '待处理', preparing: '备货中',
  delivering: '配送中', pending_pickup: '待自提', completed: '已完成',
  cancelled: '已取消', refunding: '退款中', refunded: '已退款'
}

const ACTION_LABEL = {
  preparing: '开始备货',
  delivering: '确认发货',
  pending_pickup: '备货完成(自提)',
  completed: '确认完成',
  refunding: '转退款',
  refunded: '确认退款',
  paid: '驳回退款'
}

/** 主操作：每个状态下最该点的那个 */
const PRIMARY = ['preparing', 'delivering', 'pending_pickup', 'completed', 'refunded']

Page({
  data: {
    orderId: '',
    order: null,
    statusText: '',
    addressText: '',
    goodsText: '0.00',
    feeText: '0.00',
    couponText: '0.00',
    totalText: '0.00',
    timeline: [],
    actions: []
  },

  onLoad(options) {
    this.setData({ orderId: options.id || '' })
    this.load()
  },

  load() {
    return api.admin('orderDetail', { orderId: this.data.orderId })
      .then(res => {
        const o = res.order
        this.setData({
          order: {
            ...o,
            items: o.items.map(i => ({ ...i, subtotalText: util.yuanShort(i.subtotal) }))
          },
          statusText: STATUS_TEXT[o.status] || o.status,
          addressText: o.address
            ? `${o.address.province}${o.address.city}${o.address.district}${o.address.detail}`
            : '',
          goodsText: util.yuan(o.goodsAmount),
          feeText: util.yuan(o.deliveryFee),
          couponText: util.yuan(o.couponDiscount || 0),
          totalText: util.yuan(o.totalAmount),
          timeline: (o.timeline || []).slice().reverse().map(t => ({
            ...t,
            atText: util.formatTime(t.at, 'MM-DD HH:mm')
          })),
          actions: (res.allowedNext || []).map(s => ({
            status: s,
            label: ACTION_LABEL[s] || s,
            primary: PRIMARY.includes(s)
          }))
        })
      })
      .catch(() => {})
  },

  onAction(e) {
    const { status, label } = e.currentTarget.dataset
    if (status === 'delivering') return this.askCourier()
    util.confirm(`确定执行「${label}」？`, '订单操作').then(yes => {
      if (!yes) return
      api.admin('updateOrderStatus', { orderId: this.data.orderId, status, note: label }, { loading: true })
        .then(() => {
          util.success('已更新')
          this.load()
        })
        .catch(() => {})
    })
  },

  askCourier() {
    wx.showModal({
      title: '确认发货',
      editable: true,
      placeholderText: '配送员姓名+电话',
      confirmColor: '#c2185b',
      success: (r) => {
        if (!r.confirm) return
        const text = (r.content || '').trim()
        const m = text.match(/(1[3-9]\d{9})/)
        api.admin('updateOrderStatus', {
          orderId: this.data.orderId,
          status: 'delivering',
          note: '商家已发货',
          courierName: m ? text.replace(m[1], '').trim() : text,
          courierPhone: m ? m[1] : ''
        }, { loading: true })
          .then(() => {
            util.success('已发货')
            this.load()
          })
          .catch(() => {})
      }
    })
  },

  callUser() {
    util.callPhone(this.data.order.contactPhone)
  },

  copyAddress() {
    util.copy(`${this.data.order.contactName} ${this.data.order.contactPhone} ${this.data.addressText}`)
  }
})
