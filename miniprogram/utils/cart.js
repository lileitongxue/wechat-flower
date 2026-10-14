/**
 * 购物车：存本地 Storage，下单时由 order 云函数以服务端价格重新计算。
 * 本地只保存 productId / quantity / 展示快照，价格仅用于界面即时反馈。
 */
const KEY = 'flower_cart_v1'
const MAX_KINDS = 30
const MAX_QTY = 99

function read() {
  try {
    const list = wx.getStorageSync(KEY)
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

function write(list) {
  try {
    wx.setStorageSync(KEY, list)
  } catch (e) {
    console.error('购物车写入失败', e)
  }
  refreshBadge(list)
  return list
}

/** 旧版本数据迁移占位：字段有变更时在这里兼容 */
function migrate() {
  const list = read()
  let changed = false
  const fixed = list.filter(i => i && i.productId).map(i => {
    if (typeof i.selected !== 'boolean') { i.selected = true; changed = true }
    if (!Number.isFinite(i.quantity) || i.quantity < 1) { i.quantity = 1; changed = true }
    return i
  })
  if (changed || fixed.length !== list.length) write(fixed)
  else refreshBadge(fixed)
  return fixed
}

/**
 * 加入购物车。已存在则累加数量。
 * @returns {{ok: boolean, message?: string, total: number}}
 */
function add(product, quantity = 1) {
  const list = read()
  const qty = Math.max(Math.floor(Number(quantity) || 1), 1)
  const idx = list.findIndex(i => i.productId === product._id)

  if (idx > -1) {
    const next = list[idx].quantity + qty
    if (next > MAX_QTY) return { ok: false, message: `单品最多 ${MAX_QTY} 件`, total: count(list) }
    if (product.stock != null && next > product.stock) {
      return { ok: false, message: `库存仅剩 ${product.stock} 件`, total: count(list) }
    }
    list[idx].quantity = next
    list[idx].price = product.memberPrice || product.price
    list[idx].stock = product.stock
  } else {
    if (list.length >= MAX_KINDS) {
      return { ok: false, message: `购物车最多 ${MAX_KINDS} 种商品`, total: count(list) }
    }
    if (product.stock != null && qty > product.stock) {
      return { ok: false, message: `库存仅剩 ${product.stock} 件`, total: count(list) }
    }
    list.push({
      productId: product._id,
      name: product.name,
      cover: product.cover || '',
      unit: product.unit || '束',
      price: product.memberPrice || product.price,
      originalPrice: product.price,
      stock: product.stock,
      quantity: qty,
      selected: true,
      addedAt: Date.now()
    })
  }
  write(list)
  return { ok: true, total: count(list) }
}

/** 直接设置数量；设为 0 则移除 */
function setQuantity(productId, quantity) {
  const list = read()
  const idx = list.findIndex(i => i.productId === productId)
  if (idx === -1) return { ok: false, message: '商品不在购物车', total: count(list) }
  const qty = Math.floor(Number(quantity) || 0)
  if (qty <= 0) {
    list.splice(idx, 1)
    write(list)
    return { ok: true, total: count(list) }
  }
  if (qty > MAX_QTY) return { ok: false, message: `单品最多 ${MAX_QTY} 件`, total: count(list) }
  const stock = list[idx].stock
  if (stock != null && qty > stock) {
    return { ok: false, message: `库存仅剩 ${stock} 件`, total: count(list) }
  }
  list[idx].quantity = qty
  write(list)
  return { ok: true, total: count(list) }
}

function remove(productId) {
  const list = read().filter(i => i.productId !== productId)
  write(list)
  return { ok: true, total: count(list) }
}

function removeMany(productIds = []) {
  const set = new Set(productIds)
  const list = read().filter(i => !set.has(i.productId))
  write(list)
  return { ok: true, total: count(list) }
}

function clear() {
  write([])
  return { ok: true, total: 0 }
}

function toggleSelect(productId, selected) {
  const list = read()
  const item = list.find(i => i.productId === productId)
  if (item) item.selected = selected == null ? !item.selected : !!selected
  write(list)
  return list
}

function selectAll(selected = true) {
  const list = read().map(i => ({ ...i, selected: !!selected }))
  write(list)
  return list
}

/** 商品总件数 */
function count(list) {
  return (list || read()).reduce((s, i) => s + (i.quantity || 0), 0)
}

/** 已勾选商品的小计（分） */
function selectedAmount(list) {
  return (list || read())
    .filter(i => i.selected)
    .reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0)
}

function selectedItems(list) {
  return (list || read()).filter(i => i.selected)
}

/** 同步 tabBar 角标 */
function refreshBadge(list) {
  const n = count(list)
  if (n > 0) {
    wx.setTabBarBadge({ index: 2, text: n > 99 ? '99+' : String(n) }).catch(() => {})
  } else {
    wx.removeTabBarBadge({ index: 2 }).catch(() => {})
  }
}

/** 用服务端校验结果同步本地价格与库存，返回失效项 */
function syncWithServer(validated = []) {
  const list = read()
  const invalid = []
  const map = new Map(validated.map(v => [v.productId, v]))
  const next = []
  for (const item of list) {
    const v = map.get(item.productId)
    if (!v) { next.push(item); continue }
    if (!v.valid && (v.reason === '商品已删除' || v.reason === '商品已下架')) {
      invalid.push({ name: v.name || item.name, reason: v.reason })
      continue
    }
    next.push({
      ...item,
      name: v.name || item.name,
      cover: v.cover || item.cover,
      price: v.price != null ? v.price : item.price,
      stock: v.stock != null ? v.stock : item.stock,
      quantity: v.stock != null ? Math.min(item.quantity, Math.max(v.stock, 1)) : item.quantity
    })
  }
  write(next)
  return { list: next, invalid }
}

module.exports = {
  read, write, migrate, add, setQuantity, remove, removeMany, clear,
  toggleSelect, selectAll, count, selectedAmount, selectedItems,
  refreshBadge, syncWithServer, MAX_QTY
}
