/**
 * pay —— 微信支付统一下单（云开发云调用方式）
 *
 * 云调用 cloudPay 不需要自己签名，但必须在云开发控制台完成「微信支付」配置，
 * 并把商户号、子商户号等填入 settings/pay 文档或环境变量。
 */
const { handler, db, COLL, ORDER_STATUS, BizError, cloud, markPaid } = require('./common')

/** 支付回调地址：cloudPay 用「云函数名」而非 URL */
const PAY_CALLBACK_FN = 'payCallback'

const actions = {
  /**
   * 发起支付：返回小程序 wx.requestPayment 所需的全部参数。
   * 对同一笔未支付订单重复调用是安全的（微信侧按 out_trade_no 幂等）。
   */
  async prepay(event, { openid }) {
    const { orderId } = event
    if (!orderId) throw new BizError('缺少订单号', 'INVALID_PARAM')

    const res = await db.collection(COLL.ORDERS).doc(orderId).get().catch(() => null)
    const order = res?.data
    if (!order) throw new BizError('订单不存在', 'NOT_FOUND')
    if (order._openid !== openid) throw new BizError('无权支付该订单', 'FORBIDDEN')
    if (order.status !== ORDER_STATUS.PENDING_PAY) {
      throw new BizError('该订单无需支付', 'INVALID_STATUS')
    }
    // 下单超过 30 分钟未支付视为失效，避免库存长期被占
    const ageMin = (Date.now() - new Date(order.createdAt).getTime()) / 60000
    if (ageMin > 30) throw new BizError('订单已超时，请重新下单', 'ORDER_EXPIRED')

    const cfg = await loadPayConfig()
    const body = order.items.length > 1
      ? `${order.items[0].name} 等 ${order.items.length} 件`
      : order.items[0].name

    const payload = {
      body: `${cfg.shopName}-${body}`.slice(0, 120),
      outTradeNo: order.orderNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: cfg.subMchId,
      totalFee: order.totalAmount,           // 单位：分
      envId: cfg.envId || process.env.SCF_NAMESPACE,
      functionName: PAY_CALLBACK_FN,
      nonceStr: randomStr(32),
      tradeType: 'JSAPI',
      openid
    }

    let result
    try {
      result = await cloud.cloudPay.unifiedOrder(payload)
    } catch (err) {
      console.error('统一下单失败', err)
      throw new BizError('支付下单失败，请确认商户号配置', 'PAY_INIT_FAILED')
    }
    if (result.returnCode !== 'SUCCESS' || result.resultCode !== 'SUCCESS') {
      throw new BizError(result.returnMsg || result.errCodeDes || '支付下单失败', 'PAY_INIT_FAILED')
    }

    await db.collection(COLL.ORDERS).doc(orderId).update({
      data: { prepayAt: new Date(), updatedAt: new Date() }
    })

    // payment 字段即 wx.requestPayment 的入参
    return { payment: result.payment, orderNo: order.orderNo }
  },

  /**
   * 支付结果主动查询：前端支付成功后调用，兜底回调延迟的情况。
   * 真正的状态变更仍以 payCallback 为准，这里只做一次补偿。
   */
  async queryPay(event, { openid }) {
    const { orderId } = event
    const res = await db.collection(COLL.ORDERS).doc(orderId).get().catch(() => null)
    const order = res?.data
    if (!order || order._openid !== openid) throw new BizError('订单不存在', 'NOT_FOUND')
    if (order.status !== ORDER_STATUS.PENDING_PAY) {
      return { status: order.status, paid: order.status !== ORDER_STATUS.CANCELLED }
    }

    const cfg = await loadPayConfig()
    let qr
    try {
      qr = await cloud.cloudPay.queryOrder({
        subMchId: cfg.subMchId,
        outTradeNo: order.orderNo,
        nonceStr: randomStr(32)
      })
    } catch (err) {
      console.error('查询支付结果失败', err)
      return { status: order.status, paid: false }
    }
    if (qr.tradeState === 'SUCCESS') {
      await markPaid(order, {
        transactionId: qr.transactionId,
        totalFee: Number(qr.totalFee || order.totalAmount),
        timeEnd: qr.timeEnd
      })
      return { status: ORDER_STATUS.PAID, paid: true }
    }
    return { status: order.status, paid: false, tradeState: qr.tradeState }
  }
}

async function loadPayConfig() {
  const res = await db.collection(COLL.SETTINGS).doc('pay').get().catch(() => null)
  const cfg = res?.data || {}
  const subMchId = cfg.subMchId || process.env.WX_SUB_MCH_ID
  if (!subMchId) {
    throw new BizError('未配置微信支付商户号，请在管理后台或环境变量中设置', 'PAY_NOT_CONFIGURED')
  }
  return {
    subMchId,
    envId: cfg.envId || process.env.WX_ENV_ID || '',
    shopName: cfg.shopName || '花知道鲜花'
  }
}

function randomStr(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

exports.main = handler(actions)
