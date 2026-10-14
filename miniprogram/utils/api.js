/**
 * 云函数调用统一封装。
 * 所有云函数都返回 { success, data, message, code }，这里把失败转成 reject，
 * 页面只需关心 data，错误统一由 catch 处理。
 */

/** 不需要弹 toast 的错误码（页面自行处理） */
const SILENT_CODES = ['NO_AUTH', 'PAY_NOT_CONFIGURED']

/**
 * @param {string} name 云函数名
 * @param {string} action 操作名
 * @param {object} data 其它参数
 * @param {object} opts { loading: 是否显示加载态, toast: 失败是否弹提示 }
 */
function call(name, action, data = {}, opts = {}) {
  const { loading = false, toast = true, loadingText = '加载中' } = opts
  if (loading) wx.showLoading({ title: loadingText, mask: true })

  return wx.cloud.callFunction({
    name,
    data: { action, ...data }
  }).then(res => {
    const result = res.result || {}
    if (result.success) return result.data
    const err = new Error(result.message || '操作失败')
    err.code = result.code
    throw err
  }).catch(err => {
    // 云函数未部署等基础设施错误，给出更可操作的提示
    const message = normalizeError(err)
    if (toast && !SILENT_CODES.includes(err.code)) {
      wx.showToast({ title: message, icon: 'none', duration: 2500 })
    }
    const e = new Error(message)
    e.code = err.code || 'CALL_FAILED'
    throw e
  }).finally(() => {
    if (loading) wx.hideLoading()
  })
}

function normalizeError(err) {
  const raw = err.errMsg || err.message || '网络异常'
  if (raw.includes('FunctionName parameter could not be found') || raw.includes('function not found')) {
    return '云函数未部署，请在开发者工具中右键 cloudfunctions 目录上传'
  }
  if (raw.includes('Environment not found') || raw.includes('env not exists')) {
    return '云开发环境未初始化，请先在控制台开通'
  }
  if (raw.includes('database collection not exists') || raw.includes('collection not exists')) {
    return '数据库集合不存在，请先运行初始化'
  }
  if (raw.includes('timeout')) return '请求超时，请检查网络'
  return raw.replace(/^cloud\.callFunction:fail\s*/, '')
}

/** 上传图片到云存储，返回 fileID */
function uploadImage(filePath, dir = 'products') {
  const ext = (filePath.match(/\.(\w+)$/) || [, 'jpg'])[1]
  const cloudPath = `${dir}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`
  return wx.cloud.uploadFile({ cloudPath, filePath }).then(res => res.fileID)
}

module.exports = {
  call,
  uploadImage,
  // 按云函数分组的便捷方法，页面里读起来更直观
  login: (action, data, opts) => call('login', action, data, opts),
  shop: (action, data, opts) => call('shop', action, data, opts),
  order: (action, data, opts) => call('order', action, data, opts),
  pay: (action, data, opts) => call('pay', action, data, opts),
  reservation: (action, data, opts) => call('reservation', action, data, opts),
  member: (action, data, opts) => call('member', action, data, opts),
  admin: (action, data, opts) => call('admin', action, data, opts),
  seed: (action, data, opts) => call('seed', action, data, opts)
}
