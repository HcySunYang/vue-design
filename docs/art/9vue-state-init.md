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

在这一小节我们主要聚焦在如下这句代码：

```js
const value = validateProp(key, propsOptions, propsData, vm)
```

也就是 `props` 的校验，和一些其他工作，比如获取默认值等。如上这句代码是在 `initProps` 函数体内的 `for...in` 循环语句，传递给 `validateProp` 函数的四个参数分别是：

* `key`：`prop` 的名字
* `propsOptions`：整个 `props` 选项对象
* `propsData`：整个 `props` 数据来源对象
* `vm`：组件实例对象

假如我们定义了如下组件：

```js
{
  name: 'someComp',
  props: {
    prop1: String
  }
}
```

并像如下代码这样使用：

```html
<some-comp prop1="str" />
```

那么 `validateProp` 函数接收的四个参数将会是：

```js
// props 的名字
key = 'prop1'
// props 选项参数
propOptions = {
  prop1: {
    type: String
  }
}
// props 数据
propsData = {
  prop1: 'str'
}
// 组件实例对象
vm = vm
```

了解了 `validateProp` 函数的参数之后，我们可以开始研究 `validateProp` 函数内的代码了，在该函数的一开头定义了两个常量和一个变量，如下：

```js
const prop = propOptions[key]
const absent = !hasOwn(propsData, key)
let value = propsData[key]
```

其中常量 `prop` 的值为 `propOptions[key]`，也就是名字为 `key` 的 `props` 的定义，拿上面的例子来说，如果 `key` 的值为 `prop1`，那么常量 `prop` 的值为：

```js
const prop = {
  type: String
}
```

第二个常量是 `absent`，它是一个布尔值，代表着对应的 `prop` 在 `propsData` 上是否有数据，或者换句话说外界是否传递了该 `prop` 给组件。如果 `absent` 为真，则代表 `prop` 数据缺失。

第三个定义的 `value` 是一个变量，它的值是通过读取 `propsData` 得到的，当然了如果外界没有向组件传递相应的 `prop` 数据，那么 `value` 就是 `undefined`。

再往下定义了 `booleanIndex` 常量：

```js
const booleanIndex = getTypeIndex(Boolean, prop.type)
```

`booleanIndex` 常量的值是调用 `getTypeIndex` 函数的返回值，那么 `getTypeIndex` 函数的作用是什么呢？首先 `getTypeIndex` 函数接收两个参数，这两个参数都是某一个类型数据结构的构造函数，它可以是 `javascript` 原生数据类型的构造函数，也可以是自定义构造函数。`getTypeIndex` 函数的作用准备的说是用来查找第一个参数所指定的类型构造函数是否存在于第二个参数所指定的类型构造函数数组中，没错第二个参数可能是一个数组，比如我们像如下这样定义 `props`：

```js
props: {
  prop1: [Number, String]
}
```

那么经过规范化后 `propOptions` 将是：

```js
propOptions = {
  prop1: {
    type: [Number, String]
  }
}
```

回过头来，如果 `getTypeIndex` 函数第一个参数所指定的类型构造函数存在于第二个参数所指定的类型构造函数数组中，那么 `getTypeIndex` 函数将返回第一个参数在第二个参数数组中的位置，否则返回 `-1`，这说明第一个参数指定的类型构造函数不在第二个参数指定类型构造函数数组中。最后补充一下，第二个参数可能是数组也可能是单一的一个类型构造函数。

具体看一下 `getTypeIndex` 函数的实现，找到 `getTypeIndex` 函数，它定义在 `src/core/util/props.js` 文件的最下方，如下：

```js
function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}
```

我们可以看到在 `getTypeIndex` 函数内部首先检测了 `expectedTypes` 是否为数组，如果不是数组那说明是一个单一的类型构造函数，此时会执行如下高亮的代码：

```js {2}
if (!Array.isArray(expectedTypes)) {
  return isSameType(expectedTypes, type) ? 0 : -1
}
```

这句代码调用了 `isSameType` 函数，并将两个类型构造函数作为参数传递，`isSameType` 函数的作用就是用来判断给定的两个类型构造函数是否相同，找到 `isSameType` 函数，它定义在 `getTypeIndex` 函数的上方，如下：

```js
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}
function isSameType (a, b) {
  return getType(a) === getType(b)
}
```

通过如上代码可知 `isSameType` 函数是通过调用 `getType` 函数获取到类型的描述后进行比较的，有的同学可能会问直接将两个类型作比较不就可以了吗？为什么要这么麻烦？实际上这么做肯定是有原因的，我们可以看到在 `getType` 函数上方有这样一段注释：

```js
/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
```

这是在说简单的类型之间直接比较在不同的 `iframes / vms` 之间是不管用的，我们回想一下如何判断一个数据是否是数组的方法，其中一个方法就是使用 `instanceof` 操作符：

```js
someData instanceof Array
```

这种方式的问题就在于，不同 `iframes` 之间的 `Array` 构造函数本身都是不相等的。所以以上判断方法只适用于在同一个 `iframes` 环境下。

同理，为了做到更严谨的判断，我们需要使用 `getType` 函数，如下：

```js
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}
```

`getType` 函数很简单，它接收一个函数作为参数，然后使用正则去匹配该函数 `toString()` 后的字符串，并捕获函数的名字，最后如果捕获成功则返回函数名字，否则返回空字符串。这样一来，在做类型比较的时候本质上是做字符串之间的比较，这样就永远不会有问题。

我们再回到 `isSameType` 函数：

```js
function isSameType (a, b) {
  return getType(a) === getType(b)
}
```

可知如果两个参数给定的类型构造函数相同则 `isSameType` 函数返回真，否则返回假。我们再来查看 `getTypeIndex` 函数：

```js {3}
function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}
```

如果 `expectedTypes` 不是数组，那么如果传递给 `getTypeIndex` 函数的两个参数类型相同，则返回数字 `0`，否则返回数字 `-1`。

接着如果 `expectedTypes` 是一个数组，则通过 `for` 循环遍历该数组中的每一个类型构造函数，并使用 `isSameType` 函数让其与给定的类型构造函数做对比，如果二者相同则直接返回给定类型构造函数在 `expectedTypes` 数组中的位置，如果没有在 `expectedTypes` 数组中找到给定的类型构造函数则 `getTypeIndex` 函数最后会返回 `-1`。

总之 `getTypeIndex` 函数的返回值如果大于 `-1`，则说明给定的类型构造函数在期望的类型构造函数之中。

再回过头来看这段代码：

```js
const booleanIndex = getTypeIndex(Boolean, prop.type)
if (booleanIndex > -1) {
  if (absent && !hasOwn(prop, 'default')) {
    value = false
  } else if (value === '' || value === hyphenate(key)) {
    // only cast empty string / same name to boolean if
    // boolean has higher priority
    const stringIndex = getTypeIndex(String, prop.type)
    if (stringIndex < 0 || booleanIndex < stringIndex) {
      value = true
    }
  }
}
```

也就是说常量 `booleanIndex` 的值如果大于 `-1`，说明在定义 `props` 时指定了 `Boolean` 类型。此时如上代码中 `if` 语句块的内容将被执行，在 `if` 语句块内首先检测如下条件：

```js
absent && !hasOwn(prop, 'default')
```

其中 `absent` 常量我们前面介绍过，它为真说明外界没有向组件传递该 `prop`，所以如上条件所代表的意思是：**外界没有为组件传递该 `prop`，并且该 `prop` 也没有指定默认值**。在这种情况下如果你指定该 `prop` 的类型为 `Boolean`，那么 `Vue` 会自动将该 `prop` 的值设置为 `false`。

如果 `absent` 为假，说明外界向组件传递了该 `prop`，此时会进入 `else...if` 判断，判断条件如下：

```js
value === '' || value === hyphenate(key)
```

这说明外界向组件传递的 `prop` 要么是一个空字符串，要么就是一个名字由驼峰转连字符后与值为相同字符串的 `prop`，如下：

```html
<!-- 值为空字符串 -->
<some-comp prop1="" />
<!-- 名字由驼峰转连字符后与值为相同字符串 -->
<some-comp someProp="some-prop" />
```

如果你想如上代码那样为组件传递 `props`，并且这些指定了这些 `props` 的类型包括 `Boolean` 类型。那么此时 `else...if` 语句块的代码将被执行，如下：

```js
// only cast empty string / same name to boolean if
// boolean has higher priority
const stringIndex = getTypeIndex(String, prop.type)
if (stringIndex < 0 || booleanIndex < stringIndex) {
  value = true
}
```

这句代码首先定义了 `stringIndex` 常量，该常量的值是 `String` 类型在 `prop` 类型定义中的位置。接着是一个 `if` 条件语句，我们看一下判断条件：

```js
stringIndex < 0 || booleanIndex < stringIndex
```

如果 `stringIndex < 0` 则说明没有为该 `prop` 指定 `String` 类型，否则说明为 `prop` 指定了 `String` 类型，但由于之前的判断能够确定的是已经为 `prop` 指定了 `Boolean` 类型，那么说明此时至少为该 `prop` 指定了两种类型：`String` 和 `Boolean`。这时会将 `booleanIndex` 与 `stringIndex` 作比较，比较的目的是检测 `String` 和 `Boolean` 这两个类型谁定义在前面，所以如上条件成立所代表的意思是：

* 1、没有定义 `String` 类型
* 2、虽然定义了 `String` 类型，但是 `String` 类型的优先级没有 `Boolean` 高

这时会将该 `prop` 的值设置为 `true`，而非字符串。举个例子：

```js
{
  name: 'someComp',
  props: {
    prop1: {
      type: [String, Boolean]
    }
  }
}
```

上面的代码中我们定义了组件 `<some-comp/>`，并且定义了一个名字叫做 `prop1` 的 `prop`，我们为该 `prop` 制定了两个类型构造函数 `String` 和 `Boolean`，而且 `String` 的优先级要高于 `Boolean`，所以此时你如果像如下这样使用该组件：

```html
<!-- 值为空字符串 -->
<some-comp prop1="" />
<!-- 名字由驼峰转连字符后与值为相同字符串 -->
<some-comp someProp="some-prop" />
```

那么该组件接收到的 `prop` 就会作为普通字符串处理，即 `prop1` 的值就是空字符串或字符串 `'some-prop'`。

如果我们调换一下 `prop1` 的类型构造函数的顺序，如下：

```js {5}
{
  name: 'someComp',
  props: {
    prop1: {
      type: [Boolean, String]
    }
  }
}
```

我们先定义了 `Boolean` 类型，如果此时你依然像如下这样使用组件：

```html
<!-- 值为空字符串 -->
<some-comp prop1="" />
<!-- 名字由驼峰转连字符后与值为相同字符串 -->
<some-comp someProp="some-prop" />
```

那么 `prop1` 的值将会是布尔类型 `true`。最后补充一点，实际上如下两种使用 `props` 的方式是等价的：

```html
<some-comp prop1="" />
<!-- 等价于 -->
<some-comp prop1 />
``` 

最后我们再来回顾一下 `validateProp` 函数中的这段代码：

```js
const booleanIndex = getTypeIndex(Boolean, prop.type)
if (booleanIndex > -1) {
  if (absent && !hasOwn(prop, 'default')) {
    value = false
  } else if (value === '' || value === hyphenate(key)) {
    // only cast empty string / same name to boolean if
    // boolean has higher priority
    const stringIndex = getTypeIndex(String, prop.type)
    if (stringIndex < 0 || booleanIndex < stringIndex) {
      value = true
    }
  }
}
```

现在我们知道了这段代码的作用实际上对 `prop` 的类型为布尔值时的特殊处理。接下来我们继续查看 `validateProp` 函数的后续代码，如下：

```js
// check default value
if (value === undefined) {
  value = getPropDefaultValue(vm, prop, key)
  // since the default value is a fresh copy,
  // make sure to observe it.
  const prevShouldObserve = shouldObserve
  toggleObserving(true)
  observe(value)
  toggleObserving(prevShouldObserve)
}
```

这段代码用来检测该 `prop` 的值是否是 `undefined`，我们知道 `prop` 是可以指定默认值的，当外界没有为组件传递该 `prop` 时，则取默认值作为该 `prop` 的数据。根据如上代码可知获取默认值的操作由 `getPropDefaultValue` 函数来完成，并将获取到的默认值重新赋值给 `value` 变量，获取完默认值之后我们可以看到如下这段代码：

```js
const prevShouldObserve = shouldObserve
toggleObserving(true)
observe(value)
toggleObserving(prevShouldObserve)
```

有这段代码首先使用 `prevShouldObserve` 常量保存了之前的 `shouldObserve` 状态，紧接着将开关开启，是的 `observe` 函数能够将 `value` 定义为响应式数据，最后又还原了 `shouldObserve` 的状态。之所以这么做是因为取到的默认值是非响应式的，我们需要将其重新定义为响应式数据。

接着我们再回头看一下 `getPropDefaultValue` 函数是如何获取默认值的，`getPropDefaultValue` 函数定义在 `validateProp` 函数的下方，如下是 `getPropDefaultValue` 函数的签名：

```js
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // 省略...
}
```

`getPropDefaultValue` 函数接收三个参数，分别是组件实例对象 `vm`、`prop` 的定义对象，以及 `prop` 的名字 `key`。在 `getPropDefaultValue` 函数体内，首先是这样一段代码：

```js
if (!hasOwn(prop, 'default')) {
  return undefined
}
const def = prop.default
```

我们知道在定义 `prop` 时可以在对象中使用 `default` 属性指定默认值，所以如上代码用来检测开发者在定义 `prop` 时是否指定了默认值，如果没有指定默认值则直接返回 `undefined`。另外如果开发者指定了默认值则定义 `def` 常量，用来保存默认值。

再往下是这样一段代码：

```js
if (process.env.NODE_ENV !== 'production' && isObject(def)) {
  warn(
    'Invalid default value for prop "' + key + '": ' +
    'Props with type Object/Array must use a factory function ' +
    'to return the default value.',
    vm
  )
}
```

在非生产环境下，如果你的 `prop` 默认值是对象类型，那么则会打印警告信息，告诉你需要用一个工厂函数返回这个对象类型的默认值，比如：

```js
props: {
  prop1: {
    default: {
      a: 1
    }
  },
  prop2: {
    default: [1, 2, 3]
  }
}
```

如上代码定义了两个 `prop`，其中 `prop1` 的默认值是一个对象，`prop2` 的默认值是一个数组，这两个 `prop` 都是不合法的，你需要用工程函数将默认值返回，如下：

```js
props: {
  prop1: {
    default () {
      return {
        a: 1
      }
    }
  },
  prop2: {
    default () {
      return [1, 2, 3]
    }
  }
}
```

这么做的目的是防止多个组件实例共享一份数据所造成的问题。

再往下是这样一段代码：

```js
if (vm && vm.$options.propsData &&
  vm.$options.propsData[key] === undefined &&
  vm._props[key] !== undefined
) {
  return vm._props[key]
}
```

我们现在还没有讲解创建子组件与根组件的区别，或许大家看到这段代码会有些疑惑。比如上面的 `if` 条件语句中有这样一个条件：

```js
vm.$options.propsData[key] === undefined
```

大家别忘了我们目前讲解的代码是 `getPropDefaultValue` 函数中的代码，代码既然已经执行到了 `getPropDefaultValue` 函数那么说明外界没有向组件传递该 `prop` 数据，那也就是说 `vm.$options.propsData[key]` 很显然的应该是 `undefined`。为什么还需要如上判断呢？实际上事情并非像我们想象的那样。这是因为**组件第一次创建与后续的更新走的是两套不太一致的逻辑**。为了证明这一点，我们需要打开 `src/core/instance/lifecycle.js` 文件找到 `updateChildComponent` 函数，大家现在只需要知道组件的更新是由 `updateChildComponent` 函数来完成的即可，在 `updateChildComponent` 函数内有这样一段代码：

```js {8}
if (propsData && vm.$options.props) {
  toggleObserving(false)
  const props = vm._props
  const propKeys = vm.$options._propKeys || []
  for (let i = 0; i < propKeys.length; i++) {
    const key = propKeys[i]
    const propOptions: any = vm.$options.props // wtf flow?
    props[key] = validateProp(key, propOptions, propsData, vm)
  }
  toggleObserving(true)
  // keep a copy of raw propsData
  vm.$options.propsData = propsData
}
```

注意如上高亮的那句代码，这句代码同样调用 `validateProp` 函数，所以 `getPropDefaultValue` 函数的如下代码完全是为组件更新时准备的：

```js
if (vm && vm.$options.propsData &&
  vm.$options.propsData[key] === undefined &&
  vm._props[key] !== undefined
) {
  return vm._props[key]
}
```

当执行 `updateChildComponent` 函数更新组件时，在调用 `validateProp` 函数之前 `vm.$options.propsData` 还没有被更新，注意如下高亮代码：

```js {13}
// updateChildComponent 函数
if (propsData && vm.$options.props) {
  toggleObserving(false)
  const props = vm._props
  const propKeys = vm.$options._propKeys || []
  for (let i = 0; i < propKeys.length; i++) {
    const key = propKeys[i]
    const propOptions: any = vm.$options.props // wtf flow?
    props[key] = validateProp(key, propOptions, propsData, vm)
  }
  toggleObserving(true)
  // keep a copy of raw propsData
  vm.$options.propsData = propsData
}
```

可以看到 `vm.$options.propsData` 的更新是在调用 `validateProp` 之后进行的，所以当组件更新时如下代码中的 `vm.$options.propsData` 是上一次组件更新或创建时的数据：

```js
if (vm && vm.$options.propsData &&
  vm.$options.propsData[key] === undefined &&
  vm._props[key] !== undefined
) {
  return vm._props[key]
}
```

明白了这些我们再来重新审视一下这些判断条件，其中条件 `vm.$options.propsData[key] === undefined` 说明上一次组件更新或创建时外界就没有向组件传递该 `prop` 数据，条件 `vm._props[key] !== undefined` 说明该 `prop` 存在非未定义的默认值，又由于上面这段代码存在于 `getPropDefaultValue` 函数中，所以如上 `if` 条件成立则说明：

* 1、当前组件处于更新状态，且没有传递该 `prop` 数据给组件
* 2、上一次更新或创建时外界也没有向组件传递该 `prop` 数据
* 3、上一次组件更新或创建时该 `prop` 拥有一个不为 `undefined` 的默认值

那么此时应该返回之前的 `prop` 值(即默认值)作为本次渲染该 `prop` 的默认值。这样就能避免触发没有意义的响应。为什么能避免触发无意义的响应呢？很简单，假设每次都重新获取默认值而不是返回之前的默认值，那么如下 `prop` 的默认值将总是会变化的：

```js
props: {
  prop1: {
    default () {
      return { a: 1 }
    }
  }
}
```

由于 `prop1` 的默认值是由工厂函数返回的对象，这个对象每次都是不同的，即使看上去数据是一样的，但他们具有不同的引用，这样每次都会触发响应，但试图并没有任何变化，也就是说触发了没有意义的响应。而解决办法就是前面所介绍的，返回上一次的默认值就可以了。

最后我们再来看 `getPropDefaultValue` 函数中的最后一段代码：

```js
return typeof def === 'function' && getType(prop.type) !== 'Function'
  ? def.call(vm)
  : def
```

我们知道 `def` 常量为该 `prop` 的 `default` 属性的值，它代表了默认值，但是由于默认值可能是由工厂函数执行产生的，所以如果 `def` 的类型是函数值通过执行 `def.call(vm)` 来获取默认值，否则直接使用 `def` 作为默认值。当然了我们还需要一个判断条件，即：

```js
getType(prop.type) !== 'Function'
```

这说明我们指定了该 `prop` 的默认值类型为函数类型，所以此时我们就不应该通过执行 `def` 函数来获取默认值了，应该直接将 `def` 函数本身作为默认值看待，因为该 `prop` 所期望的值就是一个函数。

再往下是 `validateProp` 函数的最后一段代码，如下：

```js
if (
  process.env.NODE_ENV !== 'production' &&
  // skip validation for weex recycle-list child component props
  !(__WEEX__ && isObject(value) && ('@binding' in value))
) {
  assertProp(prop, key, value, vm, absent)
}
```

经过前面的讲解，我们知道 `validateProp` 一开始并没有对 `props` 的类型做校验，首先如果一个 `prop` 的类型是布尔类型，则为其设置合理的布尔值，其次又调用了 `getPropDefaultValue` 函数获取 `prop` 的默认值，而如上这段代码才是真正用来对 `props` 的类型做校验的。通过如上 `if` 语句的条件可知，仅在非生产环境下才会对 `props` 做类型校验，另外还有一个条件是用来跳过 `weex` 环境下某种条件的判断的，我们不做讲解。总之真正的校验工作是由 `assertProp` 函数完成的。

`assertProp` 函数定义在 `getPropDefaultValue` 函数的下方，如下是其函数签名：

```js
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // 省略...
}
```

`assertProp` 函数接收五个参数，第一个参数 `prop` 为该prop的定义对象，第二个参数 `name` 是该 `prop` 的名字，第三个参数 `value` 是该 `prop` 的值，第四个参数 `vm` 为组件实例对象，第五个参数 `absent` 为一个布尔值代表外界是否向组件传递了该 `prop` 数据。我们来看 `assertProp` 函数的第一段代码，如下：

```js
if (prop.required && absent) {
  warn(
    'Missing required prop: "' + name + '"',
    vm
  )
  return
}
```

这段代码用来检测开发者是否传递了那些必须传递的 `prop` 数据，我们知道开发者可以在定义 `prop` 时指定 `required` 选项为 `true`，代表该 `prop` 为必传的。所以如上 `if` 语句的条件成立则说明该 `prop` 为必传 `prop`，但是外界却没有向组件传递该 `prop` 的值。此时需要打印警告信息提示开发者缺少必传的 `prop`。注意在打印完警告信息之后函数理解返回，不会执行后续操作。

再往下是这样一段代码：

```js
if (value == null && !prop.required) {
  return
}
```

可以看到如果这段代码中 `if` 语句条件成立，则函数立即返回，同样不会做后续的校验。如果该 `if` 语句条件成立，则说明 `value` 值为 `null` 或 `undefined`，并且该 `prop` 是非必须的，在这种情况下就不需要做后续的校验了。

再往下是这样一段代码：

```js
let type = prop.type
let valid = !type || type === true
const expectedTypes = []
if (type) {
  if (!Array.isArray(type)) {
    type = [type]
  }
  for (let i = 0; i < type.length && !valid; i++) {
    const assertedType = assertType(value, type[i])
    expectedTypes.push(assertedType.expectedType || '')
    valid = assertedType.valid
  }
}
```

这段代码的作用是用来做类型断言的，即判断外界传递的 `prop` 值的类型与期望的类型是否相符。首先定义了 `type` 变量它的值为 `prop.type` 的值。接着定义了 `valid` 变量，该变量为一个布尔值，代表着类型校验成功与否，我们可以看到其初始值为：

```js
let valid = !type || type === true
```

其中 `!type` 说明如果开发者在定义 `prop` 时没有规定该 `prop` 值的类型，则不需要校验，所以自然就认为无论外界传递了什么数据都是有效的，或者干脆在定义 `prop` 时直接将类型设置为 `true`，也代表不需要做 `prop` 校验。

再往下定义了 `expectedTypes` 常量，它的初始值为空数组，该常量用来保存类型的字符串表示，当校验失败时会通过打印该数组中收集的类型来提示开发者应该传递哪些类型的数据。接着进入一个 `if` 语句块，其判断条件为 `if (type)`，只有当 `type` 存在时才需要做类型校验，在改 `if` 语句块内首先是这样一段代码：

```js
if (!Array.isArray(type)) {
  type = [type]
}
```

检测 `type` 是否是一个数组，如果不是数组则将其包装成一个数组。然后开启一个 `for` 循环，该 `for` 循环用来遍历 `type` 数组，如下：

```js
for (let i = 0; i < type.length && !valid; i++) {
  const assertedType = assertType(value, type[i])
  expectedTypes.push(assertedType.expectedType || '')
  valid = assertedType.valid
}
```

在循环内部，首先调用 `assertType` 函数分别将该 `prop` 的值 `value` 以及类型作为参数传递，所以真正的类型断言是由 `assertType` 函数来完成的，`assertType` 函数的具体实现我们后面再讲，现在大家只需要知道 `assertType` 函数的返回值是一个如下结构的对象即可：

```js
{
  expectedType: 'String',
  valid: true
}
```

该对象拥有两个属性，分别是 `expectedType` 和 `valid`。其中 `expectedType` 属性就是类型的字符串表示，而 `valid` 属性是一个布尔值，它的真假代表了该 `prop` 值是否通过了校验。

再回头看如下代码：

```js
for (let i = 0; i < type.length && !valid; i++) {
  const assertedType = assertType(value, type[i])
  expectedTypes.push(assertedType.expectedType || '')
  valid = assertedType.valid
}
```

可以看到，定义了 `assertedType` 常量，该常量就是 `assertType` 函数的返回值。接着将 `assertedType.expectedType` 添加到 `expectedTypes` 数组中，然后使用 `assertedType.valid` 的值重写 `valid` 变量。我们可以注意到 `for` 循环的终止条件为：

```js
i < type.length && !valid
```

所以一旦某个类型校验通过，那么 `valid` 的值将变为真，此时 `for` 循环内的语句将不再执行，这是因为该 `prop` 值的类型只要满足期望类型中的一个即可。假设 `for` 循环遍历结束之后 `valid` 变量依然为假，则说明该 `prop` 值的类型不在期望的类型之中。此时在 `for` 循环之后的代码将发挥作用，如下：

```js
if (!valid) {
  warn(
    `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}` +
    `, got ${toRawType(value)}.`,
    vm
  )
  return
}
```

如果代码运行到了这里，且 `valid` 的值为假，那么则打印警告信息提示开发者所传递的 `prop` 值的类型不符合预期。通过上面代码我们可以看到，在提示信息中通过打印 `expectedTypes` 数组中的类型字符串来提示开发者该 `prop` 所期望的类型。同时通过 `toRawType` 函数获取真正的 `prop` 值的类型，用来提示开发者所传递的值的类型是什么。最后函数直接返回不做后续操作。

再往下将是 `assertProp` 函数的最后一段代码，如下：

```js
const validator = prop.validator
if (validator) {
  if (!validator(value)) {
    warn(
      'Invalid prop: custom validator check failed for prop "' + name + '".',
      vm
    )
  }
}
```

如果代码运行到了这里，说明前面的校验全部通过。但是我们知道在定义 `prop` 时可以通过 `validator` 属性指定一个校验函数实现自定义校验，该函数的返回值作为校验的结果。实际上在 `Vue` 内部实现非常简单，如上代码所示，定义了 `validator` 常量，它的值就是开发者定义的 `prop.validator` 函数，接着只需要调用该函数并判断其返回值的真假即可，如果返回值为假说明自定义校验失败，则直接打印警告信息提示开发者该 `prop` 自定义校验失败即可。

最后我们再来看一下 `assertType` 函数的实现，前面我们已经知道了 `assertType` 函数的作用，它接收两个参数，分别为 `prop` 的值和 `prop` 的类型，然后将值与类型之间做比较，检查是否符合预期并返回一个对象形式的检查结果供其他函数使用。

`assertType` 函数定义在 `assertProp` 函数的下方，如下：

```js
const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  // 省略...
}
```

可以看到在定义 `assertType` 函数之前定义了常量 `simpleCheckRE`，用来匹配字符串：`'String'`、`'Number'`、`'Boolean'`、`'Function'` 以及 `'Symbol'`，这个正则将会在 `assertType` 函数中用到。在 `assertType` 函数内部首先定义了 `valid` 变量以及 `expectedType` 常量，如下：

```js {5,6,9,10}
function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  // 省略...
  return {
    valid,
    expectedType
  }
}
```

可以发现变量 `valid` 以及常量 `expectedType` 将会被作为返回值对象的属性。其中 `expectedType` 常量的值为通过 `getType` 函数获取到的类型字符串表示。接着将进入一连串的 `if...elseif...else` 语句块，如下：

```js
if (simpleCheckRE.test(expectedType)) {
  const t = typeof value
  valid = t === expectedType.toLowerCase()
  // for primitive wrapper objects
  if (!valid && t === 'object') {
    valid = value instanceof type
  }
} else if (expectedType === 'Object') {
  valid = isPlainObject(value)
} else if (expectedType === 'Array') {
  valid = Array.isArray(value)
} else {
  valid = value instanceof type
}
```

我们一个一个来看，首先看 `if` 判断语句的条件：

```js
if (simpleCheckRE.test(expectedType))
```

使用 `simpleCheckRE` 去匹配字符串 `expectedType`，如果匹配成功则说明期望的类型为一下五种类型之一：`'String'`、`'Number'`、`'Boolean'`、`'Function'` 以及 `'Symbol'`，这五种类型有什么特点呢？它们的特点是都可以通过 `typeof` 操作符进行区分判断。在 `if` 语句块内执行的是如下代码：

```js
const t = typeof value
valid = t === expectedType.toLowerCase()
// for primitive wrapper objects
if (!valid && t === 'object') {
  valid = value instanceof type
}
```

首先定义了常量 `t`，它的值就是通过 `typeof` 操作符获取到 `value` 的类型字符串，然后使用 `t` 与 `expectedType` 的小写作比较，如果全等则说明该 `prop` 的值与期望类型相同，此时 `valid` 将会为真。接着是一个 `if` 判断语句，可以看到这个判断语句的条件为：

```js
if (!valid && t === 'object')
```

也就是说通过前面对比，发现该 `prop` 值的类型与期望的类型不符。大家注意如果上面的 `if` 语句条件为真，则我们能够确定以下几点：

* 1、期望的类型是这五种类型之一：`'String'`、`'Number'`、`'Boolean'`、`'Function'` 以及 `'Symbol'`
* 2、并且通过 `typeof` 操作符取到的该 `prop` 值的类型为 `object`

这时我们能够否定 `prop` 的值不符合预期吗？答案是不能的，因为在 `javascript` 有个概念叫做**基本包装类型**，比如可以这样定义一个字符串：

```js
const str = new String('基本包装类型')
```

此时通过 `typeof` 获取 `str` 的类型将得到 `'object'` 字符串。但 `str` 的的确确是一个字符串，所以在这种情况下我们还需要做进一步的检查，即：

```js {2}
if (!valid && t === 'object') {
  valid = value instanceof type
}
```

如上高亮代码所示使用 `instanceof` 操作符判断 `value` 是否是 `type` 的实例，如果是则依然认为该 `prop` 值是有效的。

处理完了以上类型的检查，还要处理对象和数组已经自定义类型的检查，如下：

```js
if (simpleCheckRE.test(expectedType)) {
  // 省略...
} else if (expectedType === 'Object') {
  valid = isPlainObject(value)
} else if (expectedType === 'Array') {
  valid = Array.isArray(value)
} else {
  valid = value instanceof type
}
```

可以看到如果 `expectedType` 全等于字符串 `'Object'`，则使用 `isPlainObject` 函数检查该 `prop` 值的有效性，如果 `expectedType` 全等于字符串 `'Array'`，则使用 `Array.isArray` 函数判断该 `prop` 值的有效性，如果 `expectedType` 没有匹配前面的任何 `if...elseif` 语句，那么 `else` 语句块的代码将被执行，此时说明开发者在定义 `prop` 时所指定的期望类型为自定义类型，如：

```js {6}
// 自定义类型构造函数
function Dog () {}

props: {
  prop1: {
    type: Dog
  }
}
```

对于自定义类型，只需要检查值是否为该自定义类型构造函数的实例即可。

以上就是我们对 `props` 选项的解析。

## methods 选项的初始化及实现

## provide 选项的初始化及实现

## inject 选项的初始化及实现