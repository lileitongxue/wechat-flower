const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data: {
    ranges: [
      { days: 7, label: '近 7 天' },
      { days: 14, label: '近 14 天' },
      { days: 30, label: '近 30 天' }
    ],
    days: 7,
    data: {},
    chart: [],
    ranking: [],
    revenueText: '0.00',
    avgText: '0.00'
  },

  onLoad() {
    this.load()
  },

  load() {
    return api.admin('stats', { days: this.data.days }, { loading: true })
      .then(res => {
        const trend = res.trend || []
        // 以区间内最高单日销售额为 100% 标尺
        const max = Math.max(...trend.map(t => t.revenue), 1)
        const orders = res.totalOrders || 0
        this.setData({
          data: res,
          revenueText: util.yuan(res.totalRevenue || 0),
          avgText: orders ? util.yuan(Math.round((res.totalRevenue || 0) / orders)) : '0.00',
          chart: trend.map(t => {
            const [, m, d] = t.date.split('-')
            return {
              date: t.date,
              label: `${Number(m)}/${Number(d)}`,
              percent: Math.round((t.revenue / max) * 100),
              valueText: t.revenue > 0 ? util.yuanShort(t.revenue) : ''
            }
          }),
          ranking: (res.ranking || []).map(r => ({
            ...r,
            revenueText: util.yuanShort(r.revenue)
          }))
        })
      })
      .catch(() => {})
  },

  onRange(e) {
    const days = Number(e.currentTarget.dataset.days)
    if (days === this.data.days) return
    this.setData({ days })
    this.load()
  }
})
