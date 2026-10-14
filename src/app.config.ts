export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/category/index',
    'pages/product/index',
    'pages/cart/index',
    'pages/checkout/index',
    'pages/order/index',
    'pages/appointment/index',
    'pages/coupon/index',
    'pages/login/index',
    'pages/profile/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '花遇鲜花',
    navigationBarTextStyle: 'black',
    enablePullDownRefresh: false,
  },
  tabBar: {
    color: '#9ca3af',
    selectedColor: '#16a34a',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/appointment/index', text: '预约' },
      { pagePath: 'pages/cart/index', text: '购物车' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ],
  },
});
