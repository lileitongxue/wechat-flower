const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data: {
    statusTabs: [
      { key: 'all', label: '全部' },
      { key: 'on', label: '在售' },
      { key: 'off', label: '已下架' }
    ],
    status: 'all',
    keyword: '',
    list: [],
    total: 0,
    page: 1,
    hasMore: true,
    loading: false
  },

  onLoad(options) {
    if (options.status) this.setData({ status: options.status })
    this._debouncedSearch = util.debounce(() => this.reload(), 400)
  },

  onShow() {
    this.reload()
  },

  reload() {
    this.setData({ list: [], page: 1, hasMore: true })
    return this.fetch()
  },

  fetch() {
    if (this.data.loading) return Promise.resolve()
    this.setData({ loading: true })
    const { status, keyword, page } = this.data
    return api.admin('products', { status, keyword: keyword.trim(), page, pageSize: 15 })
      .then(res => {
        const mapped = (res.list || []).map(p => ({
          ...p,
          priceText: util.yuanShort(p.price)
        }))
        const list = page === 1 ? mapped : this.data.list.concat(mapped)
        this.setData({ list, total: res.total, loading: false, hasMore: list.length < res.total })
      })
      .catch(() => this.setData({ loading: false, hasMore: false }))
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading) return
    this.setData({ page: this.data.page + 1 })
    this.fetch()
  },

  onStatus(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.status) return
    this.setData({ status: key })
    this.reload()
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value })
    this._debouncedSearch()
  },

  onClearKeyword() {
    this.setData({ keyword: '' })
    this.reload()
  },

  onSearch() {
    this.reload()
  },

  onToggle(e) {
    const { id, status } = e.currentTarget.dataset
    const next = status === 'on' ? 'off' : 'on'
    api.admin('toggleProduct', { productId: id, status: next }, { loading: true })
      .then(() => {
        util.success(next === 'on' ? '已上架' : '已下架')
        this.reload()
      })
      .catch(() => {})
  },

  onStock(e) {
    const { id, name, stock } = e.currentTarget.dataset
    wx.showModal({
      title: `修改库存：${name}`,
      editable: true,
      placeholderText: `当前 ${stock}，填入新的库存数`,
      confirmColor: '#c2185b',
      success: (r) => {
        if (!r.confirm) return
        const absolute = Math.floor(Number(r.content))
        if (Number.isNaN(absolute) || absolute < 0) return util.toast('请输入非负整数')
        api.admin('adjustStock', { productId: id, absolute, reason: '管理端手动修改' }, { loading: true })
          .then(res => {
            util.success(`库存已改为 ${res.stock}`)
            this.reload()
          })
          .catch(() => {})
      }
    })
  },

  onDelete(e) {
    const { id, name } = e.currentTarget.dataset
    util.confirm(`确定删除「${name}」？删除后不可恢复，建议优先使用下架。`, '删除商品')
      .then(yes => {
        if (!yes) return
        api.admin('deleteProduct', { productId: id }, { loading: true })
          .then(() => {
            util.success('已删除')
            this.reload()
          })
          .catch(() => {})
      })
  },

  goEdit(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset.id) || ''
    wx.navigateTo({ url: `/pages/admin/product-edit/product-edit${id ? '?id=' + id : ''}` })
  }
})
