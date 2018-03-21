## Vue的初始化之数据响应系统

相信很多同学都对 `Vue` 的数据响应系统有或多或少的了解，本章将完整的覆盖 `Vue` 响应系统的边边角角，让你对其拥有一个完善的认识。接下来我们还是接着上一章的话题，从 `initState` 函数开始。我们知道 `initState` 函数是很多选项初始化的汇总，在 `initState` 函数内部使用 `initProps` 函数初始化 `props` 属性；使用 `initMethods` 函数初始化 `methods` 属性；使用 `initData` 函数初始化 `data` 选项；使用 `initComputed` 函数和 `initWatch` 函数初始化 `computed` 和 `watch` 选项。那么我们从哪里开始讲起呢？这里我们决定以 `initData` 为切入点为大家讲解 `Vue` 的响应系统，因为 `initData` 几乎涉及了全部的数据响应相关的内容，这样将会让大家在理解 `props`、`computed`、`watch` 等选项时不费吹灰之力，且会有一种水到渠成的感觉。

话不多说，如下是 `initState` 函数中用于初始化 `data` 选项的代码：

```js
if (opts.data) {
  initData(vm)
} else {
  observe(vm._data = {}, true /* asRootData */)
}
```

首先判断 `opts.data` 是否存在，即 `data` 选项是否存在，如果存在则调用 `initData(vm)` 函数初始化 `data` 选项，否则通过 `observe` 函数观测一个空的对象，并且 `vm._data` 引用了该空对象。其中 `observe` 函数是将 `data` 转换成响应式数据的核心入口，另外实例对象上的 `_data` 属性我们在前面的章节中讲解 `$data` 属性的时候讲到过，`$data` 属性是一个访问器属性，其代理的值就是 `_data`，所以 `$data` 与 `_data` 是完全等价的。

下面我们就从 `initData(vm)` 开始开启数据响应系统的探索之旅。


