const util = require('../../utils/util')

Component({
  properties: {
    product: { type: Object, value: {} },
    /** grid 竖排卡片 | list 横排列表 */
    layout: { type: String, value: 'grid' },
    showAdd: { type: Boolean, value: true }
  },

  data: {
    priceText: '0',
    originalText: '0'
  },

  observers: {
    'product.**': function (p) {
      if (!p) return
      const price = p.hasMemberPrice ? p.memberPrice : p.price
      this.setData({
        priceText: util.yuanShort(price),
        originalText: util.yuanShort(p.originalPrice || p.price)
      })
    }
  },

  methods: {
    onTap() {
      const id = this.data.product._id
      if (!id) return
      wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` })
      this.triggerEvent('tap', { product: this.data.product })
    },
    onAdd() {
      this.triggerEvent('add', { product: this.data.product })
    }
  }
})
