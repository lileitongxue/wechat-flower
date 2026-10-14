const api = require('../../../utils/api')
const util = require('../../../utils/util')

const STATUS_TEXT = {
  pending: '待确认', confirmed: '已确认', fulfilled: '已交付', cancelled: '已取消'
}

const NEXT = {
  pending: [
    { status: 'confirmed', label: '确认排期', primary: true },
    { status: 'cancelled', label: '拒绝' }
  ],
  confirmed: [
    { status: 'fulfilled', label: '标记已交付', primary: true },
    { status: 'cancelled', label: '取消' }
  ]
}

Page({
  data: {
    tabs: [
      { key: 'pending', label: '待确认' },
      { key: 'confirmed', label: '已确认' },
      { key: 'fulfilled', label: '已交付' },
      { key: 'cancelled', label: '已取消' },
      { key: 'all', label: '全部' }
    ],
    status: 'pending',
    list: [],
    loading: true
  },

  onShow() {
    this.load()
  },

  load() {
    this.setData({ loading: true })
    return api.admin('reservations', { status: this.data.status, pageSize: 30 })
      .then(res => {
        this.setData({
          list: (res.list || []).map(r => ({
            ...r,
            statusText: STATUS_TEXT[r.status] || r.status,
            dateText: util.formatTime(`${r.deliveryDate}T00:00:00`, 'MM月DD日'),
            totalText: util.yuan(r.totalAmount),
            depositText: util.yuanShort(r.depositAmount),
            goodsText: (r.items || []).map(i => `${i.name}×${i.quantity}`).join('、'),
            addressText: r.address
              ? `${r.address.province}${r.address.city}${r.address.district}${r.address.detail}`
              : '',
            actions: NEXT[r.status] || []
          })),
          loading: false
        })
      })
      .catch(() => this.setData({ loading: false }))
  },

  onTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.status) return
    this.setData({ status: key, list: [] })
    this.load()
  },

  onAction(e) {
    const { id, status, label } = e.currentTarget.dataset
    util.confirm(`确定「${label}」这笔预约？`, '预约处理').then(yes => {
      if (!yes) return
      api.admin('updateReservation', { reservationId: id, status, note: label }, { loading: true })
        .then(() => {
          util.success('已更新')
          this.load()
        })
        .catch(() => {})
    })
  },

  onCall(e) {
    util.callPhone(e.currentTarget.dataset.phone)
  }
})
