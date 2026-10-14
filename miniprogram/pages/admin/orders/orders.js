const api = require('../../../utils/api')
const util = require('../../../utils/util')

/** 状态 → 展示配色 */
const STATUS_CLASS = {
  pending_pay: 'warn',
  paid: 'hot',
  preparing: 'hot',
  delivering: 'hot',
  pending_pickup: 'hot',
  completed: 'done',
  cancelled: 'gray',
  refunding: 'warn',
  refunded: 'gray'
}

const STATUS_TEXT = {
  pending_pay: '待付款',
  paid: '待处理',
  preparing: '备货中',
  delivering: '配送中',
  pending_pickup: '待自提',
  completed: '已完成',
  cancelled: '已取消',
  refunding: '退款中',
  refunded: '已退款'
}

/** 商家可执行的下一步操作 */
const NEXT_ACTIONS = {
  paid: [
    { status: 'preparing', label: '开始备货', primary: true },
    { status: 'refunding', label: '退款' }
  ],
  preparing: [
    { status: 'delivering', label: '确认发货', primary: true },
    { status: 'pending_pickup', label: '备货完成(自提)' }
  ],
  delivering: [{ status: 'completed', label: '确认送达', primary: true }],
  pending_pickup: [{ status: 'completed', label: '完成自提', primary: true }],
  refunding: [
    { status: 'refunded', label: '确认退款', primary: true },
    { status: 'paid', label: '驳回退款' }
  ]
}

Page({
  data: {
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'paid', label: '待处理' },
      { key: 'preparing', label: '备货中' },
      { key: 'receiving', label: '配送/自提' },
      { key: 'refunding', label: '退款中' },
      { key: 'completed', label: '已完成' },
      { key: 'pending_pay', label: '待付款' }
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
    this.reload()
  },

  onShow() {
    if (this._dirty) {
      this._dirty = false
      this.reload()
    }
  },

  reload() {
    this.setData({ list: [], page: 1, hasMore: true })
    return this.fetch()
  },

  fetch() {
    if (this.data.loading) return Promise.resolve()
    this.setData({ loading: true })
    const { status, keyword, page } = this.data
    return api.admin('orders', { status, keyword: keyword.trim(), page, pageSize: 15 })
      .then(res => {
        const mapped = (res.list || []).map(o => ({
          ...o,
          statusText: STATUS_TEXT[o.status] || o.status,
          statusClass: STATUS_CLASS[o.status] || '',
          totalText: util.yuan(o.totalAmount),
          createdAtText: util.formatTime(o.createdAt, 'MM-DD HH:mm'),
          addressText: o.address
            ? `${o.address.province}${o.address.city}${o.address.district}${o.address.detail}`
            : '',
          nextActions: NEXT_ACTIONS[o.status] || []
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

  onTab(e) {
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

  onSearch() { this.reload() },

  /** 推进订单状态；发货需要补充配送信息 */
  onAction(e) {
    const { id, status, label } = e.currentTarget.dataset
    if (status === 'delivering') return this.askCourier(id)

    util.confirm(`确定执行「${label}」？`, '订单操作').then(yes => {
      if (!yes) return
      api.admin('updateOrderStatus', { orderId: id, status, note: label }, { loading: true })
        .then(() => {
          util.success('已更新')
          this.reload()
        })
        .catch(() => {})
    })
  },

  askCourier(orderId) {
    wx.showModal({
      title: '确认发货',
      editable: true,
      placeholderText: '配送员姓名+电话，如：张师傅 13800138000',
      confirmColor: '#c2185b',
      success: (r) => {
        if (!r.confirm) return
        const text = (r.content || '').trim()
        const m = text.match(/(1[3-9]\d{9})/)
        api.admin('updateOrderStatus', {
          orderId,
          status: 'delivering',
          note: '商家已发货',
          courierName: m ? text.replace(m[1], '').trim() : text,
          courierPhone: m ? m[1] : ''
        }, { loading: true })
          .then(() => {
            util.success('已发货')
            this.reload()
          })
          .catch(() => {})
      }
    })
  },

  goDetail(e) {
    this._dirty = true
    wx.navigateTo({
      url: `/pages/admin/admin-order-detail/admin-order-detail?id=${e.currentTarget.dataset.id}`
    })
  }
})
