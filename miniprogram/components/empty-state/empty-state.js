Component({
  properties: {
    icon: { type: String, value: '🌵' },
    text: { type: String, value: '这里空空如也' },
    hint: { type: String, value: '' },
    btnText: { type: String, value: '' }
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
