## Vue的初始化之数据响应系统

在上一章节中我们提到要先讲解 `initState` 函数，那我们就跟随着上一章的脚步，打开 `core/instance/state.js` 文件，找到 `initState` 函数，如下：

```js
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}
```

以上是 `initState` 函数的全部代码，我们慢慢来看，首先在 `Vue` 实例对象添加一个属性 `vm._watchers = []`，其初始值是一个数组。随后定义了常量 `opts`，它是 `vm.$options` 的引用。接着执行了如下两句代码：

```js
if (opts.props) initProps(vm, opts.props)
if (opts.methods) initMethods(vm, opts.methods)
```

如果 `opts.props` 存在，即选项中有 `props`，那么就调用 `initProps` 初始化 `props` 选项。同样的，如果 `opts.methods` 存在，则调用 `initMethods` 初始化 `methods` 选项。

在往下执行的是这段代码：

```js
if (opts.data) {
  initData(vm)
} else {
  observe(vm._data = {}, true /* asRootData */)
}
```

首先判断 `data` 选项是否存在，如果存在则调用 `initData` 初始化 `data` 选项，如果不存在则直接调用 `observe` 函数观测一个空对象：`{}`。最后执行的是如下这段代码：

```js
if (opts.computed) initComputed(vm, opts.computed)
if (opts.watch && opts.watch !== nativeWatch) {
  initWatch(vm, opts.watch)
}
```

采用同样的方式初始化 `computed` 选项，但是对于 `watch` 选项仅仅判断 `opts.watch` 是否存在是不足够的，还要判断 `opts.watch` 是不是原生的 `watch` 对象。因在 `Firefox` 中原生提供了 `Object.prototype.watch` 函数，所以即使没有 `opts.watch` 选项，如果在火狐浏览器中依然能够通过原型链访问到原生的 `Object.prototype.watch`。但这其实不是我们预期想要的结果，所以这里加了一层判断避免把原生 `watch` 函数误认为是我们预期的 `opts.watch` 选项。之后才会调用 `initWatch` 函数初始化 `opts.watch` 选项。

通过阅读 `initState` 函数，我们可以发现 `initState` 其实是很多选项初始化的汇总，包括：`props`、`methods`、`data`、`computed` 和 `watch` 等。并且我们注意到 `props` 选项的初始化要早与 `data` 选项的初始化，那么这是不是可以使用 `props` 初始化 `data` 数据的原因呢？答案是：“是的”。接下来我们就深入讲解这些初始化工作都做了什么事情。

