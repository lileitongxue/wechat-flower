const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data: {
    form: {
      productId: '',
      name: '',
      subtitle: '',
      categoryId: '',
      images: [],
      priceYuan: '',
      originalPriceYuan: '',
      stock: '',
      unit: '束',
      sort: 99,
      material: '',
      packaging: '',
      flowerLanguage: '',
      description: '',
      notice: '',
      tags: [],
      status: 'on',
      isHot: false,
      supportReservation: true
    },
    tagsText: '',
    categories: [],
    categoryNames: [],
    categoryIndex: -1,
    saving: false
  },

  onLoad(options) {
    wx.setNavigationBarTitle({ title: options.id ? '编辑商品' : '上架新商品' })
    this.loadCategories().then(() => {
      if (options.id) this.loadProduct(options.id)
    })
  },

  loadCategories() {
    return api.admin('categories')
      .then(res => {
        const list = res.list || []
        this.setData({
          categories: list,
          categoryNames: list.map(c => c.name)
        })
      })
      .catch(() => {})
  },

  loadProduct(id) {
    return api.admin('productDetail', { productId: id })
      .then(res => {
        const p = res.product
        const images = p.images && p.images.length ? p.images : (p.cover ? [p.cover] : [])
        this.setData({
          form: {
            productId: p._id,
            name: p.name || '',
            subtitle: p.subtitle || '',
            categoryId: p.categoryId || '',
            images,
            priceYuan: util.yuan(p.price || 0),
            originalPriceYuan: p.originalPrice ? util.yuan(p.originalPrice) : '',
            stock: String(p.stock == null ? '' : p.stock),
            unit: p.unit || '束',
            sort: p.sort == null ? 99 : p.sort,
            material: p.material || '',
            packaging: p.packaging || '',
            flowerLanguage: p.flowerLanguage || '',
            description: p.description || '',
            notice: p.notice || '',
            tags: p.tags || [],
            status: p.status || 'on',
            isHot: !!p.isHot,
            supportReservation: p.supportReservation !== false
          },
          tagsText: (p.tags || []).join(','),
          categoryIndex: this.data.categories.findIndex(c => c._id === p.categoryId)
        })
      })
      .catch(() => {})
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onTags(e) {
    const text = e.detail.value
    this.setData({
      tagsText: text,
      'form.tags': text.split(/[,，\s]+/).filter(Boolean).slice(0, 6)
    })
  },

  onCategory(e) {
    const index = Number(e.detail.value)
    this.setData({
      categoryIndex: index,
      'form.categoryId': this.data.categories[index]._id
    })
  },

  onStatusChange(e) {
    this.setData({ 'form.status': e.detail.value ? 'on' : 'off' })
  },

  onHotChange(e) {
    this.setData({ 'form.isHot': e.detail.value })
  },

  onReservationChange(e) {
    this.setData({ 'form.supportReservation': e.detail.value })
  },

  chooseImg() {
    const remain = 9 - this.data.form.images.length
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        wx.showLoading({ title: '上传中', mask: true })
        // 并发上传，全部完成后一次性写入
        Promise.all(res.tempFiles.map(f => api.uploadImage(f.tempFilePath, 'products')))
          .then(ids => {
            this.setData({ 'form.images': this.data.form.images.concat(ids) })
            util.success(`已上传 ${ids.length} 张`)
          })
          .catch(() => util.toast('图片上传失败'))
          .finally(() => wx.hideLoading())
      }
    })
  },

  previewImg(e) {
    wx.previewImage({
      current: e.currentTarget.dataset.url,
      urls: this.data.form.images
    })
  },

  removeImg(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = this.data.form.images.slice()
    images.splice(index, 1)
    this.setData({ 'form.images': images })
  },

  onSave() {
    const f = this.data.form
    if (!f.name.trim()) return util.toast('请填写商品名称')
    if (!f.categoryId) return util.toast('请选择分类')
    const price = util.toFen(f.priceYuan)
    if (price <= 0) return util.toast('请填写正确的售价')
    const stock = Math.floor(Number(f.stock))
    if (Number.isNaN(stock) || stock < 0) return util.toast('请填写正确的库存')

    this.setData({ saving: true })
    api.admin('saveProduct', {
      productId: f.productId,
      product: {
        name: f.name.trim(),
        subtitle: f.subtitle,
        categoryId: f.categoryId,
        cover: f.images[0] || '',
        images: f.images,
        price,
        originalPrice: f.originalPriceYuan ? util.toFen(f.originalPriceYuan) : 0,
        stock,
        unit: f.unit || '束',
        sort: Number(f.sort) || 99,
        material: f.material,
        packaging: f.packaging,
        flowerLanguage: f.flowerLanguage,
        description: f.description,
        notice: f.notice,
        tags: f.tags,
        status: f.status,
        isHot: f.isHot,
        supportReservation: f.supportReservation
      }
    }, { loading: true, loadingText: '保存中' })
      .then(() => {
        util.success('已保存')
        setTimeout(() => wx.navigateBack(), 800)
      })
      .catch(() => this.setData({ saving: false }))
  }
})
