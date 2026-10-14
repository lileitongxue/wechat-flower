const app = getApp()
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    shop: {},
    feeText: '0',
    thresholdText: '0',
    timeRangeText: ''
  },

  onLoad() {
    this.load()
  },

  load() {
    const apply = (shop) => {
      this.setData({
        shop,
        feeText: util.yuanShort(shop.deliveryFee || 0),
        thresholdText: util.yuanShort(shop.freeDeliveryThreshold || 0),
        timeRangeText: (shop.timeRanges || []).join('、') || '营业时间内均可'
      })
    }
    if (app.globalData.shop) apply(app.globalData.shop)
    return api.shop('shopInfo')
      .then(res => {
        app.globalData.shop = res.shop
        apply(res.shop)
      })
      .catch(() => {})
  },

  openMap() {
    const { location, address, name } = this.data.shop
    if (!location || !location.latitude) {
      return util.copy(address, '地址已复制')
    }
    wx.openLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      name: name,
      address: address,
      scale: 16
    })
  },

  callShop() {
    util.callPhone(this.data.shop.phone)
  }
})
