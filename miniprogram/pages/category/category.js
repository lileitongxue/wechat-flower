const app = getApp()
const api = require('../../utils/api')
const cart = require('../../utils/cart')
const util = require('../../utils/util')

const PAGE_SIZE = 10

Page({
  data: {
    categories: [],
    currentId: '',
    sortBy: 'default',
    sorts: [
      { key: 'default', label: '综合' },
      { key: 'sales', label: '销量' },
      { key: 'priceAsc', label: '价格↑' },
      { key: 'priceDesc', label: '价格↓' },
      { key: 'newest', label: '最新' }
    ],
    list: [],
    page: 1,
    hasMore: true,
    loading: false,
    refreshing: false
  },

  onLoad(options) {
    this.loadCategories().then(() => {
      if (options.categoryId) this.setData({ currentId: options.categoryId })
      this.reload()
    })
  },

  onShow() {
    cart.refreshBadge()
    // 首页点分类跳过来时，globalData 里会带上目标分类
    const pending = app.globalData.pendingCategoryId
    if (pending !== undefined && pending !== null) {
      app.globalData.pendingCategoryId = null
      if (pending !== this.data.currentId) {
        this.setData({ currentId: pending })
        if (this.data.categories.length) this.reload()
      }
    }
  },

  loadCategories() {
    return api.shop('categories', {}, { toast: false })
      .then(res => this.setData({ categories: res.list || [] }))
      .catch(() => {})
  },

  /** 重置分页并重新拉取 */
  reload() {
    this.setData({ list: [], page: 1, hasMore: true })
    return this.fetch()
  },

  fetch() {
    if (this.data.loading) return Promise.resolve()
    this.setData({ loading: true })
    const { currentId, sortBy, page } = this.data
    return api.shop('products', {
      categoryId: currentId,
      sortBy,
      page,
      pageSize: PAGE_SIZE
    }).then(res => {
      const list = page === 1 ? res.list : this.data.list.concat(res.list)
      this.setData({
        list,
        loading: false,
        hasMore: list.length < res.total
      })
    }).catch(() => this.setData({ loading: false, hasMore: false }))
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading) return
    this.setData({ page: this.data.page + 1 })
    this.fetch()
  },

  onRefresh() {
    this.setData({ refreshing: true })
    this.reload().finally(() => this.setData({ refreshing: false }))
  },

  onCategory(e) {
    const id = e.currentTarget.dataset.id || ''
    if (id === this.data.currentId) return
    this.setData({ currentId: id })
    this.reload()
  },

  onSort(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.sortBy) return
    this.setData({ sortBy: key })
    this.reload()
  },

  onAdd(e) {
    const r = cart.add(e.detail.product, 1)
    if (!r.ok) return util.toast(r.message)
    util.success('已加入购物车')
  }
})
