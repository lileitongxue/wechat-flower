const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    list: [],
    loading: true,
    /** 从下单页进入时为选择模式，点击即返回 */
    selectMode: false
  },

  onLoad(options) {
    this.setData({ selectMode: options.select === '1' })
  },

  onShow() {
    this.load()
  },

  load() {
    return api.member('addresses')
      .then(res => this.setData({ list: res.list || [], loading: false }))
      .catch(() => this.setData({ loading: false }))
  },

  onPick(e) {
    if (!this.data.selectMode) return
    const addr = this.data.list[Number(e.currentTarget.dataset.index)]
    if (!addr) return
    // 下单页通过设为默认地址来读取选择结果，逻辑更简单也更符合预期
    api.member('saveAddress', {
      addressId: addr._id,
      name: addr.name,
      phone: addr.phone,
      province: addr.province,
      city: addr.city,
      district: addr.district,
      detail: addr.detail,
      location: addr.location,
      isDefault: true
    }, { toast: false })
      .then(() => wx.navigateBack())
      .catch(() => wx.navigateBack())
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/address-edit/address-edit' })
  },

  onEdit(e) {
    wx.navigateTo({ url: `/pages/address-edit/address-edit?id=${e.currentTarget.dataset.id}` })
  },

  /** 从微信收货地址一键导入 */
  chooseWxAddress() {
    wx.chooseAddress({
      success: (res) => {
        api.member('saveAddress', {
          name: res.userName,
          phone: res.telNumber,
          province: res.provinceName,
          city: res.cityName,
          district: res.countyName,
          detail: res.detailInfo,
          isDefault: this.data.list.length === 0
        }, { loading: true })
          .then(() => {
            util.success('已导入')
            this.load()
          })
          .catch(() => {})
      },
      fail: (err) => {
        if ((err.errMsg || '').includes('auth deny')) {
          util.toast('需要授权通讯地址才能导入')
        }
      }
    })
  }
})
