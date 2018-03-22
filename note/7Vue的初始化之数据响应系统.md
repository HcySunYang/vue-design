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

#### 实例对象代理访问数据 data

我们找到 `initData` 函数，该函数与 `initState` 函数定义在同一个文件中，即 `core/instance/state.js` 文件，`initData` 函数的一开始是这样一段代码：

```js
let data = vm.$options.data
data = vm._data = typeof data === 'function'
  ? getData(data, vm)
  : data || {}
```

首先定义 `data` 变量，它是 `vm.$options.data` 的引用。在 [5Vue选项的合并](/note/5Vue选项的合并) 一节中我们知道 `vm.$options.data` 其实最终被处理成了一个函数，且该函数的执行结果才是真正的数据。在上面的代码中我们发现其中依然存在一个使用 `typeof` 语句判断 `data` 数据类型的操作，实际上这个判断是完全没有必要的，原始是当 `data` 选项存在的时候，那么经过 `mergeOptions` 函数处理后，`data` 选项必然是一个函数，只有当 `data` 选项不存在的时候它的值是 `undefined`，而在 `initState` 函数中如果 `opts.data` 不存在则根本不会执行 `initData` 函数，所以既然执行了 `initData` 函数那么 `vm.$options.data` 必然是一个函数，所以这里的判断是没有必要的。所以可以直接写成：

```js
data = vm._data = getData(data, vm)
```

这句话的调用了 `getData` 函数，`getData` 函数就定义在 `initData` 函数的下面，我们看看其作用是什么：

```js
export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}
```

`getData` 函数接收两个参数：第一个参数是 `data` 选项，我们知道 `data` 选项是一个函数，第二个参数是 `Vue` 实例对象。`getData` 函数的作用其实就是通过调用 `data` 函数获取真正的数据对象并返回，即：`data.call(vm, vm)`，而且我们注意到 `data.call(vm, vm)` 被包裹在 `try...catch` 语句块中，这是为了捕获 `data` 函数中可能出现的错误。同时如果有错误发生那么则返回一个空对象作为数据对象：`return {}`。

另外我们注意到在 `getData` 函数的开头调用了 `pushTarget()` 函数，并且在 `finally` 语句块中调用了 `popTarget()`，这么做的目的是什么呢？这么做是为了防止使用 `props` 数据初始化 `data` 数据时收集冗余依赖的，等到我们分析 `Vue` 是如何收集依赖的时候会回头来说明。总之 `getData` 函数的作用就是：**“通过调用 `data` 选项从而获取数据对象”**。

我们再回到 `initData` 函数中：

```js
data = vm._data = getData(data, vm)
```

当通过 `getData` 拿到最终的数据对象后，将该对象赋值给 `vm._data` 属性，同时重写了 `data` 变量，此时 `data` 变量已经不是函数了，而是最终的数据对象。

紧接着是一个 `if` 语句块：

```js
if (!isPlainObject(data)) {
  data = {}
  process.env.NODE_ENV !== 'production' && warn(
    'data functions should return an object:\n' +
    'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
    vm
  )
}
```

上面的代码中使用 `isPlainObject` 函数判断变量 `data` 是不是一个纯对象，如果不是纯对象那么在非生产环境会打印警告信息。我们知道，如果一切都按照预期进行，那么此时 `data` 已经是一个最终的数据对象了，但这仅仅是我们的期望而已，毕竟 `data` 选项是开发者编写的，如下：

```js
new Vue({
  data () {
    return '我就是不返回对象'
  }
})
```

上面的代码中 `data` 函数返回了一个字符串而不是对象，所以我们需要判断一下 `data` 函数返回值的类型。

再往下是这样一段代码：

```js
// proxy data on instance
const keys = Object.keys(data)
const props = vm.$options.props
const methods = vm.$options.methods
let i = keys.length
while (i--) {
  const key = keys[i]
  if (process.env.NODE_ENV !== 'production') {
    if (methods && hasOwn(methods, key)) {
      warn(
        `Method "${key}" has already been defined as a data property.`,
        vm
      )
    }
  }
  if (props && hasOwn(props, key)) {
    process.env.NODE_ENV !== 'production' && warn(
      `The data property "${key}" is already declared as a prop. ` +
      `Use prop default value instead.`,
      vm
    )
  } else if (!isReserved(key)) {
    proxy(vm, `_data`, key)
  }
}
```

上面的代码中首先使用 `Object.keys` 函数获取 `data` 对象的所有键，并将由 `data` 对象的键所组成的数组赋值给 `keys` 常量。接着分别用 `props` 常量和 `methods` 常量引用 `vm.$options.props` 和 `vm.$options.methods`。然后开启一个 `while` 循环，该循环的作用是便利 `keys` 数组，那么这个循环的作用是什么呢？我们来看循环体内的第一段 `if` 语句：

```js
const key = keys[i]
if (process.env.NODE_ENV !== 'production') {
  if (methods && hasOwn(methods, key)) {
    warn(
      `Method "${key}" has already been defined as a data property.`,
      vm
    )
  }
}
```

上面这段代码的意思是在非生产环境下如果发现在 `methods` 对象上定义了同样的 `key`，也就是说 `data` 数据的 `key` 与 `methods` 对象中定义的函数名称相同，那么会打印一个警告，提示开发者：**你定义在 `methods` 对象中的函数名称已经被作为 `data` 对象中某个数据字段的 `key` 了，你应该换一个函数名字**。为什么要这么做呢？如下：

```js
const ins = new Vue({
  data: {
    a: 1
  },
  methods: {
    b () {}
  }
})

ins.a // 1
ins.b // function
```

在这个例子中无论是定义在 `data` 数据对象，还是定义在 `methods` 对象中的函数，都可以通过实例对象代理访问。所以当 `data` 数据对象中的 `key` 与 `methods` 对象中的 `key` 冲突时，岂不就会产生覆盖掉的现象，所以为了避免覆盖 `Vue` 是不允许在 `methods` 中定义与 `data` 字段的 `key` 重名的函数的。而这个工作就是在 `while` 循环中第一个语句块中的代码去完成的。

接着我们看 `while` 循环中的第二个 `if` 语句块：

```js
if (props && hasOwn(props, key)) {
  process.env.NODE_ENV !== 'production' && warn(
    `The data property "${key}" is already declared as a prop. ` +
    `Use prop default value instead.`,
    vm
  )
} else if (!isReserved(key)) {
  proxy(vm, `_data`, key)
}
```

同样的 `Vue` 实例对象除了代理访问 `data` 数据和 `methods` 中的方法之外，还代理访问了 `props` 中的数据，所以上面这段代码的作用是如果发现 `data` 数据字段的 `key` 已经在 `props` 中有定义了，那么就会打印警告。另外这里有一个优先级的关系：**props优先级 > data优先级 > methods优先级**。即如果一个 `key` 在 `props` 中有定义了那么就不能在 `data` 中出现；如果一个 `key` 在 `data` 中出现了那么就不能在 `methods` 中出现了。

另外上面的代码中当 `if` 语句的条件不成立，则会判断 `else if` 语句中的条件：`!isReserved(key)`，该条件的意思是判断定义在 `data` 中的 `key` 是否是保留键，大家可以在 [core/util 目录下的工具方法全解](/note/附录/core-util) 中查看对于 `isReserved` 函数的讲解。`isReserved` 函数通过判断一个字符串的第一个字符是不是 `$` 或 `_` 来决定其是否是保留的，`Vue` 是不会代理那些键名以 `$` 或 `_` 开头的字段的，因为 `Vue` 自身的属性和方法都是以 `$` 或 `_` 开头的，所以这么做是为了避免与 `Vue` 自身的属性和方法相冲突。

如果 `key` 既不是以 `$` 开头，又不是以 `_` 开头，那么将执行 `proxy` 函数，实现实例对象的代理访问：

```js
proxy(vm, `_data`, key)
```

其中关键点在于 `proxy` 函数，该函数同样定义在 `core/instance/state.js` 文件中，其内容如下：

```js
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
```

`proxy` 函数的原理是通过 `Object.defineProperty` 函数在实例对象 `vm` 上定义与 `data` 数据字段同名的访问器属性，并且这些属性代理的值是 `vm._data` 上对应属性的值。举个例子，比如 `data` 数据如下：

```js
const ins = new Vue ({
  data: {
    a: 1
  }
})
```

当我们访问 `ins.a` 时实际访问的是 `ins._data.a`。而 `ins._data` 才是真正的数据对象。

最后经过一些列的处理，`initData` 函数来到了最后一句代码：

```js
// observe data
observe(data, true /* asRootData */)
```

调用 `observe` 函数将 `data` 数据对象转换成响应式的，可以说这句代码才是响应系统的开始，不过在我们讲解 `observe` 函数之前我们有必要总结一下 `initData` 函数所做的事情，通过前面分析 `initData` 函数主要完成如下工作：

* 根据 `vm.$options.data` 选项获取真正想要的数据
* 校验得到的数据是否是一个纯对象
* 检查数据对象 `data` 上的键是否与 `props` 冲突
* 检查 `methods` 对象上的键是否与 `data` 上的键冲突
* 在 `Vue` 实例对象上添加代理访问数据对象的同名属性
* 调用 `observe` 函数开启响应式之路













