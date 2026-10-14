const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'pending', label: '待确认' },
      { key: 'confirmed', label: '已确认' },
      { key: 'fulfilled', label: '已交付' }
    ],
    status: 'all',
    list: [],
    loading: true
  },

  onShow() {
    this.load()
  },

  load() {
    this.setData({ loading: true })
    return api.reservation('list', { status: this.data.status, pageSize: 20 })
      .then(res => {
        this.setData({
          list: (res.list || []).map(r => ({
            ...r,
            dateText: util.formatTime(`${r.deliveryDate}T00:00:00`, 'MM月DD日'),
            totalText: util.yuan(r.totalAmount),
            depositText: util.yuanShort(r.depositAmount)
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

  onCancel(e) {
    const reservationId = e.currentTarget.dataset.id
    const item = this.data.list.find(r => r._id === reservationId)
    const refundable = item && item.daysLeft > 3
    util.confirm(
      refundable
        ? '距交付日 3 天以上，定金可全额退回'
        : '距交付日不足 3 天，花材已采购，定金不予退还',
      '取消预约'
    ).then(yes => {
      if (!yes) return
      api.reservation('cancel', { reservationId }, { loading: true })
        .then(() => {
          util.success('已取消')
          this.load()
        })
        .catch(() => {})
    })
  },

  onDetail(e) {
    const reservationId = e.currentTarget.dataset.id
    api.reservation('detail', { reservationId }, { loading: true })
      .then(res => {
        const r = res.reservation
        const lines = [
          `预约号：${r.reservationNo}`,
          `交付：${r.deliveryDate} ${r.deliveryTime}`,
          `方式：${r.deliveryTypeText}`,
          r.address ? `地址：${r.address.province}${r.address.city}${r.address.district}${r.address.detail}` : '',
          `联系人：${r.contactName} ${r.contactPhone}`,
          r.greetingCard ? `寄语：${r.greetingCard}` : '',
          r.remark ? `备注：${r.remark}` : '',
          `总价：¥${util.yuan(r.totalAmount)}（定金 ¥${util.yuan(r.depositAmount)}）`
        ].filter(Boolean)
        wx.showModal({
          title: '预约详情',
          content: lines.join('\n'),
          showCancel: false,
          confirmColor: '#c2185b'
        })
      })
      .catch(() => {})
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/reservation-create/reservation-create' })
  }
})
