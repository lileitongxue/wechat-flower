/**
 * payCallback —— 微信支付结果回调（由 cloudPay 的 functionName 指向本函数）
 *
 * 注意：本函数由微信支付侧调用，event 不是 { action } 结构，
 * 因此不走 handler 包装，必须自行返回 { errcode, errmsg }。
 * 微信在未收到 errcode:0 时会重试，所以这里必须幂等。
 */
const { db, COLL, ORDER_STATUS, markPaid } = require('./common')

exports.main = async (event) => {
  console.log('支付回调', JSON.stringify(event))

  // 回调字段为下划线风格（out_trade_no），兼容驼峰以防 SDK 版本差异
  const outTradeNo = event.outTradeNo || event.out_trade_no
  const resultCode = event.resultCode || event.result_code
  const returnCode = event.returnCode || event.return_code
  const transactionId = event.transactionId || event.transaction_id
  const totalFee = Number(event.totalFee || event.total_fee || 0)
  const timeEnd = event.timeEnd || event.time_end

  if (returnCode && returnCode !== 'SUCCESS') {
    console.error('回调 return_code 非 SUCCESS，直接确认避免重试风暴')
    return { errcode: 0, errmsg: 'ignored' }
  }
  if (!outTradeNo) {
    console.error('回调缺少 out_trade_no')
    return { errcode: 0, errmsg: 'missing out_trade_no' }
  }
  if (resultCode !== 'SUCCESS') {
    console.warn('支付未成功', outTradeNo, resultCode)
    return { errcode: 0, errmsg: 'not success' }
  }

  try {
    const res = await db.collection(COLL.ORDERS).where({ orderNo: outTradeNo }).limit(1).get()
    const order = res.data[0]
    if (!order) {
      // 订单查不到也要回 0，否则微信会一直重试；记日志人工核查
      console.error('回调对应订单不存在', outTradeNo)
      return { errcode: 0, errmsg: 'order not found' }
    }

    // 金额校验：防止被伪造的回调篡改金额
    if (totalFee && totalFee !== order.totalAmount) {
      console.error('回调金额与订单不符', outTradeNo, totalFee, order.totalAmount)
      return { errcode: 0, errmsg: 'amount mismatch' }
    }

    if (order.status !== ORDER_STATUS.PENDING_PAY) {
      // 已处理过，幂等返回成功
      return { errcode: 0, errmsg: 'already handled' }
    }

    await markPaid(order, { transactionId, totalFee: totalFee || order.totalAmount, timeEnd })
    return { errcode: 0, errmsg: 'OK' }
  } catch (err) {
    console.error('回调处理异常', err)
    // 返回非 0 让微信重试
    return { errcode: -1, errmsg: err.message || 'internal error' }
  }
}
