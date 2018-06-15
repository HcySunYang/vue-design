# 其他重要选项的初始化及实现

在前面的章节中，我们以 `initState` 函数为切入点讲解了数据响应系统，又通过数据响应系统讲解了 `watch` 和计算属性的实现，现在我们重新审视一下 `initState` 函数，如下：

```js {4,5}
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

如上高亮的代码所示，到目前为止整个 `initState` 函数中我们还剩下 `props` 以及 `method` 等选项的初始化和实现没有讲，接下来的内容我们将继续探索剩余选项的初始化及实现。

## props 的初始化及实现

### props 的初始化

首先我们要讲的是 `props` 选项的初始化及实现，在 `initState` 函数中可以看到如下这句代码：

```js
if (opts.props) initProps(vm, opts.props)
```

可以发现，只有当 `opts.props` 选项存在时才会调用 `initProps` 函数进行初始化工作。`initProps` 函数与其他选项的初始化函数类似，接收两个参数分别是组件实例对象 `vm` 和选项 `opts.props`。

在讲解 `initProps` 函数的具体实现之前，我们需要回顾一下 `opts.props` 的数据结构是什么样子的，在 [Vue 选项的规范化](./4vue-normalize.md) 一节中我们了解到 `props` 选项是经过规范化处理的，并且规范后的数据是纯对象格式，假如我们像如下代码这样使用 `props` 选项：

```js
props: ["someData"]
```

那么最终 `props` 选项将会被规范化为：

```js
props: {
  someData:{
    type: null
  }
}
```

如果我们像如下代码这样使用 `props` 选项：

```js
props: {
  someData1: Number
}
```

那么 `props` 选项将被规范化为：

```js
props: {
  someData1: {
    type: Number
  }
}
```

总之在被规范化后的 `props` 选项将会是一个对象，并且该对象每个属性的键名就是对应 `prop` 的名字，而且每个属性的值都是一个至少会包含一个 `type` 属性的对象。

明白了这些我们就可以开始研究 `initProps` 函数了，找到 `initProps` 函数，该函数的开头定义了四个常量：

```js
const propsData = vm.$options.propsData || {}
const props = vm._props = {}
// cache prop keys so that future props updates can iterate using Array
// instead of dynamic object key enumeration.
const keys = vm.$options._propKeys = []
const isRoot = !vm.$parent
```

首先定义了 `propsData` 常量，如果 `vm.$options.propsData` 存在，则使用 `vm.$options.propsData` 的值作为 `propsData` 常量的值，否则 `propsData` 常量的值为空对象。

那么 `vm.$options.propsData` 是什么呢？顾名思义 `propsData` 就是 `props` 数据，我们知道组件的 `props` 代表接收来自外界传递进来的数据，这些数据总要存在某个地方，使得我们在组件内使用，而 `vm.$options.propsData` 就是用来存储来自外界的组件数据的。

举个例子，如下是使用自定义组件并向组件传递数据的例子：

```html
<some-comp prop1="1" prop2="2" />
```

上面的代码中我们向自定义组件 `some-comp` 传递了两个属性，注意此时组件并没有把这两个属性作为 `props` 看待，但是如果自定义组件中显示声明了 `props`：

```js
{
  name: 'someCopm',
  props: ['prop1', 'prop2']
}
```

这时自定义组件 `some-comp` 才会把外界传递进来的属性作为 `props` 对待，并解析相应 `props` 数据。如何解析呢？拿上面的例子来说，会从如下模板中：

```html
<some-comp prop1="1" prop2="2" />
```

解析出两个 `props` 的键值对，并生成一个对象：

```js
{
  prop1: '1',
  prop2: '2'
}
```

实际上这个对象就是 `vm.$options.propsData` 的值：

```js
vm.$options.propsData = {
  prop1: '1',
  prop2: '2'
}
```

以上说明只是为了让大家明白 `propsData` 的作用和来历，有很多不严谨的地方，但足够让大家理解。更具体的内容我们会在编译器和子组件的创建相关章节中为大家详细说明。

这样我们就明白了第一个常量 `propsData` 的作用，它存储着外界传递进来的 `props` 的值。接着我们看一下第二个常量：

```js
const props = vm._props = {}
```

定义了 `props` 常量和 `vm._props` 属性，它和 `vm._props` 属性具有相同的引用并且初始值为空对象：`{}`。

再来看第三个常量：

```js
const keys = vm.$options._propKeys = []
```

定义了常量 `keys`，同时在 `vm.options` 上添加 `_propKeys` 属性，并且常量 `keys` 与 `vm.$options._propKeys` 属性具有相同的引用，且初始值是一个空数组：`[]`。

最后一个常量为 `isRoot`：

```js
const isRoot = !vm.$parent
```

`isRoot` 常量用来标识是否是根组件，因为根组件实例的 `$parent` 属性的值是不存在的，所以当 `vm.$parent` 为假时说明当前组件实例时根组件。

在这些常量的下面，是如下这段代码：

```js
if (!isRoot) {
  toggleObserving(false)
}
for (const key in propsOptions) {
  // 省略...
}
toggleObserving(true)
```

这段代码的重点在 `for...in` 循环语句块内，为了结构清晰如上代码中我们省略了 `for...in` 循环语句块内的代码。可以看到在 `for...in` 循环执行之前执行一段 `if` 条件语句块：

```js
if (!isRoot) {
  toggleObserving(false)
}
```

只要当前组件实例不是根节点，那么该 `if` 语句块内的代码将会被执行，即调用 `toggleObserving` 函数并传递 `false` 作为参数。另外我们也可以发现，在 `for...in` 循环之后再次调用了 `toggleObserving` 函数，只不过这一次所传递的参数是 `true`。我们前面遇到过 `toggleObserving` 函数，我们知道这个函数的作用类似一个开关，它会修改 `src/core/observer/index.js` 文件中 `shouldObserve` 变量的值。并且我们注意到 `observe` 函数中的这段代码，如下高亮代码所示：

```js {6}
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 省略...
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  // 省略...
  return ob
}
```

这意味着当你调用 `observe` 函数去观测一个数据对象时，只有当变量 `shouldObserve` 为真的时候才会进行观测。所以我们才说 `toggleObserving` 函数是一个开关，因为它能修改 `shouldObserve` 变量的值。

再回到如下代码：

```js {2,7}
if (!isRoot) {
  toggleObserving(false)
}
for (const key in propsOptions) {
  // 省略...
}
toggleObserving(true)
```

为什么这里在 `for...in` 循环之前“关闭开关”，在循环结束之后又“打开开关”呢？这么做肯定是有原因的，不过我们需要先弄清楚 `for...in` 循环语句块内做了什么事情才行，接下来我们开始研究这个 `for...in` 循环。

首先该 `for...in` 循环所遍历的对象是 `propsOptions`，它就是 `props` 选项参数，我们前面分析了它的格式，所以 `for...in` 循环中的 `key` 就是每个 `prop` 的名字。

在循环内的一开头是如下两句代码：

```js
keys.push(key)
const value = validateProp(key, propsOptions, propsData, vm)
```

首先将 `prop` 的名字(`key`)添加到 `keys` 数组中，我们知道常量 `keys` 与 `vm.$options._propKeys` 属性具有相同的引用，所以这等价于将 `key` 添加到 `vm.$options._propKeys` 属性中，至于为什么添加到 `vm.$options._propKeys` 属性，我们会在后面讲到。

接着定义了 `value` 常量，该常量的值为 `validateProp` 函数的返回值。一句话概括 `validateProp` 函数的作用：用来校验名字给定的 `prop` 数据是否符合预期的类型，并返回相应 `prop` 的值(或默认值)。至于 `validateProp` 函数的具体实现我们放到后面讲，现在大家只需要知道 `validateProp` 函数会返回给定名字的 `prop` 的值即可，也就是说常量 `value` 中保存着 `prop` 的值。

接着是一个 `if...else` 语句块：

```js
if (process.env.NODE_ENV !== 'production') {
  const hyphenatedKey = hyphenate(key)
  if (isReservedAttribute(hyphenatedKey) ||
      config.isReservedAttr(hyphenatedKey)) {
    warn(
      `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
      vm
    )
  }
  defineReactive(props, key, value, () => {
    if (vm.$parent && !isUpdatingChildComponent) {
      warn(
        `Avoid mutating a prop directly since the value will be ` +
        `overwritten whenever the parent component re-renders. ` +
        `Instead, use a data or computed property based on the prop's ` +
        `value. Prop being mutated: "${key}"`,
        vm
      )
    }
  })
} else {
  defineReactive(props, key, value)
}
```

在非生产环境下 `if` 语句块的代码将被执行，反之 `else` 语句块内的代码将被执行，前面我们说过，无论是生产环境还是非生产环境，应该保证行为一致才是最关键的一点。在如上代码中虽然 `if` 语句块内的代码很多，而 `else` 语句块只有一句代码，但其实他们的行为是一致的，之所以 `if` 语句块的代码会比较多，那是因为在非生产环境下要做很多打印警告信息使开发更加友好的工作。

所以如上 `if...else` 语句块最终的目的可以用一句代码来代替，即：

```js
defineReactive(props, key, value)
```

使用 `defineReactive` 函数将 `prop` 定义到常量 `props` 上，我们知道 `props` 常量与 `vm._props` 属性具有相同的引用，所以这等价于在 `vm._props` 上定义了 `prop` 数据。

同时大家注意 `defineReactive` 函数的调用被 `toggleObserving` 函数的调用所包围，如下：

```js {2,9,13}
if (!isRoot) {
  toggleObserving(false)
}
for (const key in propsOptions) {
  // 省略...
  if (process.env.NODE_ENV !== 'production') {
    // 省略...
  } else {
    defineReactive(props, key, value)
  }
  // 省略...
}
toggleObserving(true)
```

为了搞清楚其目的，我们需要找到 `defineReactive` 函数，注意如下高亮的代码：

```js {10}
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 省略...

  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 省略...
    },
    set: function reactiveSetter (newVal) {
      // 省略...
    }
  })
}
```

如上那句高亮的代码所示，在使用 `defineReactive` 函数定义属性时，会调用 `observe` 函数对值继续进行观测。但由于之前使用了 `toggleObserving(false)` 函数关闭了开关，所以上面高亮代码中调用 `observe` 函数是一个无效调用。所以我们可以得出一个结论：**在定义 `props` 数据时，不将 `prop` 值转换为响应式数据**，这里要注意的是：**由于 `props` 本身是通过 `defineReactive` 定义的，所以 `props` 本身是响应式的，但没有对值进行深度定义**。为什么这样做呢？很简单，我们知道 `props` 是来自外界的数据，或者更具体一点的说，`props` 是来自父组件的数据，这个数据如果是一个对象(包括纯对象和数组)，那么它本身可能已经是响应式的了，所以不再需要重复定义。另外在定义 `props` 数据之后，又调用 `toggleObserving(true)` 函数将开关开启，这么做的目的是不影响后续代码的功能，因为这个开关是全局的。

最后大家还要注意一点，如下：

```js
if (!isRoot) {
  toggleObserving(false)
}
```

这段代码说明，只有当不是根组件的时候才会关闭开关，这说明如果当前组件实例是根组件的话，那么定义的 `props` 的值也会被定义为响应式数据。

通过以上内容的讲解，我们应该知道的是 `props` 本质上与 `data` 是相同的，区别就在于二者数据来源不同，其中 `data` 数据定义的组件自身，我们称其为本地数据，而 `props` 数据来自于外界。

另外我们还有一段代码没有讲解，就是 `for...in` 循环的最后一段代码，如下：

```js
if (!(key in vm)) {
  proxy(vm, `_props`, key)
}
```

在讲解 `data` 选项初始化的时候我们见过类似的代码，如下：

```js
proxy(vm, `_data`, key)
```

所以这么做的目的就是在组件实例对象上第一与 `props` 同名的属性，使得我们能够通过组件实例对象直接访问 `props` 数据，但其最终代理的值仍然是 `vm._props` 对象下定义的 `props` 数据。另外我们要注意这里 `if` 语句条件：

```js {1}
if (!(key in vm)) {
  proxy(vm, `_props`, key)
}
```

只有当 `key` 不在组件实例对象上以及其原型链上有定义时才会进行代理，这是一个针对子组件的优化操作，对于子组件来讲这个代理工作在创建子组件构造函数时就完成了，即在 `Vue.extend` 函数中完成的，这么做的目的是避免每次创建子组件实例时都会调用 `proxy` 函数去做代理，由于 `proxy` 函数中使用了 `Object.defineProperty` 函数，该函数的性能表现不佳，所以这么做能够提升一定的性能指标。更多这部分的详细信息我们会在后面讲解 `Vue.extend` 函数及相关子组件创建时间的时候为大家详细说明。

最后我们再来看一下初始化 `props` 部分打印警告信息相关的内容，如下：

```js
if (process.env.NODE_ENV !== 'production') {
  const hyphenatedKey = hyphenate(key)
  if (isReservedAttribute(hyphenatedKey) ||
      config.isReservedAttr(hyphenatedKey)) {
    warn(
      `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
      vm
    )
  }
  defineReactive(props, key, value, () => {
    if (vm.$parent && !isUpdatingChildComponent) {
      warn(
        `Avoid mutating a prop directly since the value will be ` +
        `overwritten whenever the parent component re-renders. ` +
        `Instead, use a data or computed property based on the prop's ` +
        `value. Prop being mutated: "${key}"`,
        vm
      )
    }
  })
} else {
  defineReactive(props, key, value)
}
```

在非生产环境下会执行 `if` 语句块的代码，首先执行的如下这段代码：

```js
const hyphenatedKey = hyphenate(key)
if (isReservedAttribute(hyphenatedKey) ||
    config.isReservedAttr(hyphenatedKey)) {
  warn(
    `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
    vm
  )
}
```

首先使用 `hyphenate` 将 `prop` 的名字转为连字符加小写的形式，并将转换后的值赋值给 `hyphenatedKey` 常量，紧接着又是一个 `if` 条件语句块，其条件是在判断 `prop` 的名字是否是保留的属性(`attribute`)，如果是则会打印警告信息，警告你不能使用保留的属性(`attribute`)名作为 `prop` 的名字。

上面代码中的 `hyphenate` 和 `isReservedAttribute` 还是都来自于 `src/shared/util.js` 文件，可以在附录 [shared/util.js 文件工具方法全解](../appendix/shared-util.md) 中查看讲解。

接着使用了 `defineReactive` 函数定义 `props` 数据：

```js
defineReactive(props, key, value, () => {
  if (vm.$parent && !isUpdatingChildComponent) {
    warn(
      `Avoid mutating a prop directly since the value will be ` +
      `overwritten whenever the parent component re-renders. ` +
      `Instead, use a data or computed property based on the prop's ` +
      `value. Prop being mutated: "${key}"`,
      vm
    )
  }
})
```

可以看到与生产环境不同的是，在调用 `defineReactive` 函数时多传递了第四个参数，我们知道 `defineReactive` 函数的第三个参数是 `customSetter`，即自定义的 `setter`，这个 `setter` 会在你尝试修改 `props` 数据时触发，并打印警告信息提示你不要直接修改 `props` 数据。

### props 的校验







## methods 选项的初始化及实现

## provide 选项的初始化及实现

## inject 选项的初始化及实现