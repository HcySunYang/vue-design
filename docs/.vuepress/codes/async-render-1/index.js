
// 点击“开始渲染”按钮，执行 render 函数
const button = document.getElementById('start-render-button')
button.addEventListener('click', render)

// render 函数用来挂载 100 个组件
function render() {
  console.log('mount start')
  for (let j = 0; j < 500; j++) {
    mount()
  }
  console.log('mount end')
}

// 每个组件的挂载耗时 10 毫秒
let i = 0
function mount() {
  const now = performance.now()

  console.log(`挂载第 ${++i} 个组件`)

  while (performance.now() - now < 10) {}
}