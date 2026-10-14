const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    form: {
      addressId: '',
      name: '',
      phone: '',
      province: '',
      city: '',
      district: '',
      detail: '',
      isDefault: false
    },
    regionText: '',
    saving: false
  },

  onLoad(options) {
    if (options.id) {
      wx.setNavigationBarTitle({ title: '编辑地址' })
      this.loadAddress(options.id)
    } else {
      wx.setNavigationBarTitle({ title: '新增地址' })
    }
  },

  loadAddress(id) {
    api.member('addresses').then(res => {
      const addr = (res.list || []).find(a => a._id === id)
      if (!addr) return util.toast('地址不存在')
      this.setData({
        form: {
          addressId: addr._id,
          name: addr.name,
          phone: addr.phone,
          province: addr.province || '',
          city: addr.city || '',
          district: addr.district || '',
          detail: addr.detail,
          isDefault: !!addr.isDefault
        },
        regionText: [addr.province, addr.city, addr.district].filter(Boolean).join(' ')
      })
    }).catch(() => {})
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onDefaultChange(e) {
    this.setData({ 'form.isDefault': e.detail.value })
  },

  /** 用原生地区选择器，避免自带省市区数据包 */
  onRegion() {
    wx.showActionSheet({
      itemList: ['使用微信地址填充', '手动输入地区'],
      success: (res) => {
        if (res.tapIndex === 0) this.fillFromWx()
        else this.manualRegion()
      }
    })
  },

  fillFromWx() {
    wx.chooseAddress({
      success: (res) => {
        this.setData({
          'form.name': this.data.form.name || res.userName,
          'form.phone': this.data.form.phone || res.telNumber,
          'form.province': res.provinceName,
          'form.city': res.cityName,
          'form.district': res.countyName,
          'form.detail': this.data.form.detail || res.detailInfo,
          regionText: `${res.provinceName} ${res.cityName} ${res.countyName}`
        })
      },
      fail: () => util.toast('已取消或未授权')
    })
  },

  manualRegion() {
    wx.showModal({
      title: '输入地区',
      editable: true,
      placeholderText: '如：上海市 上海市 徐汇区',
      content: this.data.regionText,
      confirmColor: '#c2185b',
      success: (r) => {
        if (!r.confirm) return
        const parts = (r.content || '').trim().split(/\s+/)
        this.setData({
          'form.province': parts[0] || '',
          'form.city': parts[1] || '',
          'form.district': parts[2] || '',
          regionText: parts.filter(Boolean).join(' ')
        })
      }
    })
  },

  onSave() {
    const f = this.data.form
    if (!f.name.trim()) return util.toast('请填写收货人')
    if (!/^1[3-9]\d{9}$/.test(f.phone)) return util.toast('手机号格式有误')
    if (!f.detail.trim()) return util.toast('请填写详细地址')

    this.setData({ saving: true })
    api.member('saveAddress', f, { loading: true, loadingText: '保存中' })
      .then(() => {
        util.success('已保存')
        setTimeout(() => wx.navigateBack(), 800)
      })
      .catch(() => this.setData({ saving: false }))
  },

  onDelete() {
    util.confirm('删除后不可恢复', '删除地址').then(yes => {
      if (!yes) return
      api.member('deleteAddress', { addressId: this.data.form.addressId }, { loading: true })
        .then(() => {
          util.success('已删除')
          setTimeout(() => wx.navigateBack(), 800)
        })
        .catch(() => {})
    })
  }
})
