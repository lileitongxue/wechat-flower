/** 通用工具：金额、日期、提示、跳转 */

/** 分 → 元字符串，默认保留两位 */
function yuan(fen, decimals = 2) {
  const n = Number(fen) || 0
  return (n / 100).toFixed(decimals)
}

/** 分 → 元，整数时不显示小数（用于列表紧凑展示） */
function yuanShort(fen) {
  const n = Number(fen) || 0
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2)
}

/** 元 → 分，用于管理端录入 */
function toFen(yuanStr) {
  const n = Number(yuanStr)
  if (Number.isNaN(n)) return 0
  return Math.round(n * 100)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

/** 日期格式化，支持 Date / 时间戳 / ISO 字符串 */
function formatTime(value, fmt = 'YYYY-MM-DD HH:mm') {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return fmt
    .replace('YYYY', d.getFullYear())
    .replace('MM', pad(d.getMonth() + 1))
    .replace('DD', pad(d.getDate()))
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()))
    .replace('ss', pad(d.getSeconds()))
}

/** 相对时间：刚刚 / 5 分钟前 / 昨天 / 具体日期 */
function fromNow(value) {
  if (!value) return ''
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 172800000) return '昨天'
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  return formatTime(value, 'YYYY-MM-DD')
}

/** 倒计时文本，用于待付款订单 */
function countdown(createdAt, minutes = 30) {
  const deadline = new Date(createdAt).getTime() + minutes * 60000
  const left = deadline - Date.now()
  if (left <= 0) return ''
  const m = Math.floor(left / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return `${pad(m)}:${pad(s)}`
}

const toast = (title, icon = 'none') => wx.showToast({ title, icon, duration: 2000 })
const success = (title) => wx.showToast({ title, icon: 'success', duration: 1500 })

/** Promise 化的确认框 */
function confirm(content, title = '提示', confirmText = '确定') {
  return new Promise(resolve => {
    wx.showModal({
      title, content, confirmText, confirmColor: '#c2185b',
      success: res => resolve(res.confirm),
      fail: () => resolve(false)
    })
  })
}

/** 防抖，用于搜索框 */
function debounce(fn, wait = 300) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

/** 节流，用于滚动加载 */
function throttle(fn, wait = 500) {
  let last = 0
  return function (...args) {
    const now = Date.now()
    if (now - last < wait) return
    last = now
    return fn.apply(this, args)
  }
}

/** 拨打电话 */
function callPhone(phoneNumber) {
  if (!phoneNumber) return toast('暂无联系电话')
  wx.makePhoneCall({ phoneNumber: String(phoneNumber) })
}

/** 复制文本 */
function copy(data, tip = '已复制') {
  wx.setClipboardData({
    data: String(data),
    success: () => success(tip)
  })
}

module.exports = {
  yuan, yuanShort, toFen, formatTime, fromNow, countdown,
  toast, success, confirm, debounce, throttle, callPhone, copy
}
