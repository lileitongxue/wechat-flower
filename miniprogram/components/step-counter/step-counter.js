Component({
  properties: {
    value: { type: Number, value: 1 },
    min: { type: Number, value: 1 },
    max: { type: Number, value: 99 }
  },
  methods: {
    onMinus() {
      if (this.data.value <= this.data.min) return
      this.triggerEvent('change', { value: this.data.value - 1 })
    },
    onPlus() {
      if (this.data.value >= this.data.max) {
        this.triggerEvent('overflow', { max: this.data.max })
        return
      }
      this.triggerEvent('change', { value: this.data.value + 1 })
    },
    onInput(e) {
      const raw = Math.floor(Number(e.detail.value) || this.data.min)
      const v = Math.min(Math.max(raw, this.data.min), this.data.max)
      // 输入被钳制时也要回写，避免输入框停留在非法值
      this.setData({ value: v })
      this.triggerEvent('change', { value: v })
    }
  }
})
