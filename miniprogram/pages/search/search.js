const api = require('../../utils/api')
const cart = require('../../utils/cart')
const util = require('../../utils/util')

const HISTORY_KEY = 'flower_search_history'
const MAX_HISTORY = 10

Page({
  data: {
    keyword: '',
    history: [],
    hotWords: ['红玫瑰', '永生花', '康乃馨', '向日葵', '生日花束', '开业花篮', '郁金香'],
    list: [],
    total: 0,
    page: 1,
    hasMore: true,
    loading: false,
    searched: false
  },

  onLoad() {
    this.setData({ history: this.readHistory() })
    // 输入即搜，防抖 400ms
    this._debouncedSearch = util.debounce(() => this.doSearch(), 400)
  },

  readHistory() {
    try {
      const h = wx.getStorageSync(HISTORY_KEY)
      return Array.isArray(h) ? h : []
    } catch (e) {
      return []
    }
  },

  saveHistory(kw) {
    const next = [kw, ...this.readHistory().filter(i => i !== kw)].slice(0, MAX_HISTORY)
    try { wx.setStorageSync(HISTORY_KEY, next) } catch (e) {}
    this.setData({ history: next })
  },

  clearHistory() {
    try { wx.removeStorageSync(HISTORY_KEY) } catch (e) {}
    this.setData({ history: [] })
  },

  onInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (!keyword.trim()) {
      this.setData({ searched: false, list: [], total: 0 })
      return
    }
    this._debouncedSearch()
  },

  onSearch() {
    this.doSearch(true)
  },

  onChip(e) {
    this.setData({ keyword: e.currentTarget.dataset.kw })
    this.doSearch(true)
  },

  onClear() {
    this.setData({ keyword: '', searched: false, list: [], total: 0 })
  },

  onCancel() {
    wx.navigateBack()
  },

  /** @param {boolean} record 是否写入搜索历史（手动提交才记） */
  doSearch(record = false) {
    const kw = this.data.keyword.trim()
    if (!kw) return
    if (record) this.saveHistory(kw)
    this.setData({ page: 1, hasMore: true, searched: true })
    return this.fetch()
  },

  fetch() {
    if (this.data.loading) return Promise.resolve()
    this.setData({ loading: true })
    const { keyword, page } = this.data
    return api.shop('products', { keyword: keyword.trim(), page, pageSize: 10 })
      .then(res => {
        const list = page === 1 ? res.list : this.data.list.concat(res.list)
        this.setData({
          list,
          total: res.total,
          loading: false,
          hasMore: list.length < res.total
        })
      })
      .catch(() => this.setData({ loading: false, hasMore: false }))
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading || !this.data.searched) return
    this.setData({ page: this.data.page + 1 })
    this.fetch()
  },

  onAdd(e) {
    const r = cart.add(e.detail.product, 1)
    if (!r.ok) return util.toast(r.message)
    util.success('已加入购物车')
  }
})
