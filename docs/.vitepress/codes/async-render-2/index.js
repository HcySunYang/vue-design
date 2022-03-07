
// 点击“开始渲染”按钮，执行 render 函数
const button = document.getElementById('start-render-button')
button.addEventListener('click', render)

const myInput = document.querySelector('.my-input')
myInput.addEventListener('keydown', function inputFn() {
  console.log('keydown')
})

// render 函数用来挂载 100 个组件
const p = Promise.resolve()
function render() {
  setTimeout(mount)
  console.log('mount end')
}

// 每个组件的挂载耗时 10 毫秒
let i = 0
function mount() {
  const now = performance.now()
  while (performance.now() - now < 10) {}
  i++
  console.log(`挂载第 ${i} 个组件`)
  if (i < 500) {
    setTimeout(mount)
    // p.then(mount)
    // requestIdleCallback(mount)
    // mount()
  }
}


document.querySelector('div')