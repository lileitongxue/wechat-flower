const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    info: { levels: [] },
    spentText: '0',
    gapText: '0'
  },

  onShow() {
    this.load()
  },

  load() {
    return api.member('center', {}, { loading: true })
      .then(res => {
        this.setData({
          info: {
            ...res,
            levels: (res.levels || []).map(l => ({
              ...l,
              minSpentText: util.yuanShort(l.minSpent)
            }))
          },
          spentText: util.yuanShort(res.totalSpent || 0),
          gapText: res.nextLevel ? util.yuanShort(res.nextLevel.gap) : '0'
        })
      })
      .catch(() => {})
  },

  goCoupon() {
    wx.navigateTo({ url: '/pages/coupon/coupon' })
  }
})
