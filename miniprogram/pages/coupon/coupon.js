const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    tabs: [
      { key: 'center', label: '领券中心' },
      { key: 'unused', label: '可使用' },
      { key: 'used', label: '已使用' },
      { key: 'expired', label: '已过期' }
    ],
    tab: 'center',
    center: [],
    list: [],
    loading: true
  },

  onLoad(options) {
    if (options.tab) this.setData({ tab: options.tab })
    this.load()
  },

  load() {
    this.setData({ loading: true })
    if (this.data.tab === 'center') {
      return api.member('couponCenter')
        .then(res => this.setData({ center: res.list || [], loading: false }))
        .catch(() => this.setData({ loading: false }))
    }
    return api.member('coupons', { status: this.data.tab })
      .then(res => {
        this.setData({
          list: (res.list || []).map(c => ({
            ...c,
            expireText: c.expireAt
              ? `有效期至 ${util.formatTime(c.expireAt, 'YYYY-MM-DD')}`
              : '长期有效'
          })),
          loading: false
        })
      })
      .catch(() => this.setData({ loading: false }))
  },

  onTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.tab) return
    this.setData({ tab: key, list: [], center: [] })
    this.load()
  },

  onClaim(e) {
    const couponId = e.currentTarget.dataset.id
    api.member('claimCoupon', { couponId }, { loading: true, loadingText: '领取中' })
      .then(() => {
        util.success('领取成功')
        this.load()
      })
      .catch(() => this.load())
  },

  goShopping() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goCenter() {
    this.setData({ tab: 'center' })
    this.load()
  }
})
