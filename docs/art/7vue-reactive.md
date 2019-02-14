# 揭开数据响应系统的面纱

::: tip 注意
本节中将频繁的使用 `依赖` 和 `观察者` 这两个词汇，它们的意义是相同的。
:::

## 完整目录

[[toc]]

相信很多同学都对 `Vue` 的数据响应系统有或多或少的了解，本章将完整地覆盖 `Vue` 响应系统的边边角角，让你对其拥有一个完善的认识。接下来我们还是接着上一章的话题，从 `initState` 函数开始。我们知道 `initState` 函数是很多选项初始化的汇总，在 `initState` 函数内部使用 `initProps` 函数初始化 `props` 属性；使用 `initMethods` 函数初始化 `methods` 属性；使用 `initData` 函数初始化 `data` 选项；使用 `initComputed` 函数和 `initWatch` 函数初始化 `computed` 和 `watch` 选项。那么我们从哪里开始讲起呢？这里我们决定以 `initData` 为切入点为大家讲解 `Vue` 的响应系统，因为 `initData` 几乎涉及了全部的数据响应相关的内容，这样将会让大家在理解 `props`、`computed`、`watch` 等选项时不费吹灰之力，且会有一种水到渠成的感觉。

话不多说，如下是 `initState` 函数中用于初始化 `data` 选项的代码：

```js
if (opts.data) {
  initData(vm)
} else {
  observe(vm._data = {}, true /* asRootData */)
}
```

首先判断 `opts.data` 是否存在，即 `data` 选项是否存在，如果存在则调用 `initData(vm)` 函数初始化 `data` 选项，否则通过 `observe` 函数观测一个空的对象，并且 `vm._data` 引用了该空对象。其中 `observe` 函数是将 `data` 转换成响应式数据的核心入口，另外实例对象上的 `_data` 属性我们在前面的章节中讲解 `$data` 属性的时候讲到过，`$data` 属性是一个访问器属性，其代理的值就是 `_data`。

下面我们就从 `initData(vm)` 开始开启数据响应系统的探索之旅。

## 实例对象代理访问数据 data

我们找到 `initData` 函数，该函数与 `initState` 函数定义在同一个文件中，即 `core/instance/state.js` 文件，`initData` 函数的一开始是这样一段代码：

```js
let data = vm.$options.data
data = vm._data = typeof data === 'function'
  ? getData(data, vm)
  : data || {}
```

首先定义 `data` 变量，它是 `vm.$options.data` 的引用。在 [Vue选项的合并](./5vue-merge.md) 一节中我们知道 `vm.$options.data` 其实最终被处理成了一个函数，且该函数的执行结果才是真正的数据。在上面的代码中我们发现其中依然存在一个使用 `typeof` 语句判断 `data` 数据类型的操作，我们知道经过 `mergeOptions` 函数处理后 `data` 选项必然是一个函数，那么这里的判断还有必要吗？答案是有，这是因为 `beforeCreate` 生命周期钩子函数是在 `mergeOptions` 函数之后 `initData` 之前被调用的，如果在 `beforeCreate` 生命周期钩子函数中修改了 `vm.$options.data` 的值，那么在 `initData` 函数中对于 `vm.$options.data` 类型的判断就是必要的了。

回到上面那段代码，如果 `vm.$options.data` 的类型为函数，则调用 `getData` 函数获取真正的数据，`getData` 函数就定义在 `initData` 函数的下面，我们看看其作用是什么：

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

另外我们注意到在 `getData` 函数的开头调用了 `pushTarget()` 函数，并且在 `finally` 语句块中调用了 `popTarget()`，这么做的目的是什么呢？这么做是为了防止使用 `props` 数据初始化 `data` 数据时收集冗余的依赖，等到我们分析 `Vue` 是如何收集依赖的时候会回头来说明。总之 `getData` 函数的作用就是：**“通过调用 `data` 选项从而获取数据对象”**。

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

上面的代码中首先使用 `Object.keys` 函数获取 `data` 对象的所有键，并将由 `data` 对象的键所组成的数组赋值给 `keys` 常量。接着分别用 `props` 常量和 `methods` 常量引用 `vm.$options.props` 和 `vm.$options.methods`。然后开启一个 `while` 循环，该循环用来遍历 `keys` 数组，那么遍历 `keys` 数组的目的是什么呢？我们来看循环体内的第一段 `if` 语句：

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

在这个例子中无论是定义在 `data` 中的数据对象，还是定义在 `methods` 对象中的函数，都可以通过实例对象代理访问。所以当 `data` 数据对象中的 `key` 与 `methods` 对象中的 `key` 冲突时，岂不就会产生覆盖掉的现象，所以为了避免覆盖 `Vue` 是不允许在 `methods` 中定义与 `data` 字段的 `key` 重名的函数的。而这个工作就是在 `while` 循环中第一个语句块中的代码去完成的。

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

同样的 `Vue` 实例对象除了代理访问 `data` 数据和 `methods` 中的方法之外，还代理访问了 `props` 中的数据，所以上面这段代码的作用是如果发现 `data` 数据字段的 `key` 已经在 `props` 中有定义了，那么就会打印警告。另外这里有一个优先级的关系：**props优先级 > data优先级 > methods优先级**。即如果一个 `key` 在 `props` 中有定义了那么就不能在 `data` 和 `methods` 中出现了；如果一个 `key` 在 `data` 中出现了那么就不能在 `methods` 中出现了。

另外上面的代码中当 `if` 语句的条件不成立，则会判断 `else if` 语句中的条件：`!isReserved(key)`，该条件的意思是判断定义在 `data` 中的 `key` 是否是保留键，大家可以在 [core/util 目录下的工具方法全解](../appendix/core-util.md) 中查看对于 `isReserved` 函数的讲解。`isReserved` 函数通过判断一个字符串的第一个字符是不是 `$` 或 `_` 来决定其是否是保留的，`Vue` 是不会代理那些键名以 `$` 或 `_` 开头的字段的，因为 `Vue` 自身的属性和方法都是以 `$` 或 `_` 开头的，所以这么做是为了避免与 `Vue` 自身的属性和方法相冲突。

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

最后经过一系列的处理，`initData` 函数来到了最后一句代码：

```js
// observe data
observe(data, true /* asRootData */)
```

调用 `observe` 函数将 `data` 数据对象转换成响应式的，可以说这句代码才是响应系统的开始，不过在讲解 `observe` 函数之前我们有必要总结一下 `initData` 函数所做的事情，通过前面的分析可知 `initData` 函数主要完成如下工作：

* 根据 `vm.$options.data` 选项获取真正想要的数据（注意：此时 `vm.$options.data` 是函数）
* 校验得到的数据是否是一个纯对象
* 检查数据对象 `data` 上的键是否与 `props` 对象上的键冲突
* 检查 `methods` 对象上的键是否与 `data` 对象上的键冲突
* 在 `Vue` 实例对象上添加代理访问数据对象的同名属性
* 最后调用 `observe` 函数开启响应式之路

## 数据响应系统的基本思路

接下来我们将重点讲解数据响应系统的实现，在具体到源码之前我们有必要了解一下数据响应系统实现的基本思路，这有助于我们更好地理解源码的目的，毕竟每一行代码都有它存在的意义。

在 `Vue` 中，我们可以使用 `$watch` 观测一个字段，当字段的值发生变化的时候执行指定的观察者，如下：

```js
const ins = new Vue({
  data: {
    a: 1
  }
})

ins.$watch('a', () => {
  console.log('修改了 a')
})
```

这样当我们试图修改 `a` 的值时：`ins.a = 2`，在控制台将会打印 `'修改了 a'`。现在我们将这个问题抽象一下，假设我们有数据对象 `data`，如下：

```js
const data = {
  a: 1
}
```

我们还有一个叫做 `$watch` 的函数：

```js
function $watch () {...}
```

`$watch` 函数接收两个参数，第一个参数是要观测的字段，第二个参数是当该字段的值发生变化后要执行的函数，如下：

```js
$watch('a', () => {
  console.log('修改了 a')
})
```

要实现这个功能，说复杂也复杂说简单也简单，复杂在于我们需要考虑的内容比较多，比如如何避免收集重复的依赖，如何深度观测，如何处理数组以及其他边界条件等等。简单在于如果不考虑那么多边界条件的话，要实现这样一个功能还是很容易的，这一小节我们就从简入手，致力于让大家思路清晰，至于各种复杂情况的处理我们会在真正讲解源码的部分一一为大家解答。

要实现上文的功能，我们面临的第一个问题是，如何才能知道属性被修改了(或被设置了)。这时候我们就要依赖 `Object.defineProperty` 函数，通过该函数为对象的每个属性设置一对 `getter/setter` 从而得知属性被读取和被设置，如下：

```js
Object.defineProperty(data, 'a', {
  set () {
    console.log('设置了属性 a')
  },
  get () {
    console.log('读取了属性 a')
  }
})
```

这样我们就实现了对属性 `a` 的设置和获取操作的拦截，有了它我们就可以大胆地思考一些事情，比如： **能不能在获取属性 `a` 的时候收集依赖，然后在设置属性 `a` 的时候触发之前收集的依赖呢？** 嗯，这是一个好思路，不过既然要收集依赖，我们起码需要一个”筐“，然后将所有收集到的依赖通通放到这个”筐”里，当属性被设置的时候将“筐”里所有的依赖都拿出来执行就可以了，落实到代码如下：

```js
// dep 数组就是我们所谓的“筐”
const dep = []
Object.defineProperty(data, 'a', {
  set () {
    // 当属性被设置的时候，将“筐”里的依赖都执行一次
    dep.forEach(fn => fn())
  },
  get () {
    // 当属性被获取的时候，把依赖放到“筐”里
    dep.push(fn)
  }
})
```

如上代码所示，我们定义了常量 `dep`，它是一个数组，这个数组就是我们所说的“筐”，当获取属性 `a` 的值时将触发 `get` 函数，在 `get` 函数中，我们将收集到的依赖放入“筐”内，当设置属性 `a` 的值时将触发 `set` 函数，在 `set` 函数内我们将“筐”里的依赖全部拿出来执行。

但是新的问题出现了，上面的代码中我们假设 `fn` 函数就是我们需要收集的依赖(`观察者`)，但 `fn` 从何而来呢？ **也就是说如何在获取属性 `a` 的值时收集依赖呢？** 为了解决这个问题我们需要思考一下我们现在都掌握了哪些条件，这个时候我们就需要在 `$watch` 函数中做文章了，我们知道 `$watch` 函数接收两个参数，第一个参数是一个字符串，即数据字段名,比如 `'a'`，第二个参数是依赖该字段的函数：

```js
$watch('a', () => {
  console.log('设置了 a')
})
```

重点在于 **`$watch` 函数是知道当前正在观测的是哪一个字段的**，所以一个思路是我们在 `$watch` 函数中读取该字段的值，从而触发字段的 `get` 函数，同时将依赖收集，如下代码：

```js
const data = {
  a: 1
}

const dep = []
Object.defineProperty(data, 'a', {
  set () {
    dep.forEach(fn => fn())
  },
  get () {
    // 此时 Target 变量中保存的就是依赖函数
    dep.push(Target)
  }
})

// Target 是全局变量
let Target = null
function $watch (exp, fn) {
  // 将 Target 的值设置为 fn
  Target = fn
  // 读取字段值，触发 get 函数
  data[exp]
}
```

上面的代码中，首先我们定义了全局变量 `Target`，然后在 `$watch` 中将 `Target` 的值设置为 `fn` 也就是依赖，接着读取字段的值 `data[exp]` 从而触发被设置的属性的 `get` 函数，在 `get` 函数中，由于此时 `Target` 变量就是我们要收集的依赖，所以将 `Target` 添加到 `dep` 数组。现在我们添加如下测试代码：

```js
$watch('a', () => {
  console.log('第一个依赖')
})
$watch('a', () => {
  console.log('第二个依赖')
})
```

此时当你尝试设置 `data.a = 3` 时，在控制台将分别打印字符串 `'第一个依赖'` 和 `'第二个依赖'`。我们仅仅用十几行代码就实现了这样一个最基本的功能，但其实现在的实现存在很多缺陷，比如目前的代码仅仅能够实现对字段 `a` 的观测，如果添加一个字段 `b` 呢？所以最起码我们应该使用一个循环将定义访问器属性的代码包裹起来，如下：

```js
const data = {
  a: 1,
  b: 1
}

for (const key in data) {
  const dep = []
  Object.defineProperty(data, key, {
    set () {
      dep.forEach(fn => fn())
    },
    get () {
      dep.push(Target)
    }
  })
}
```

这样我们就可以使用 `$watch` 函数观测任意一个 `data` 对象下的字段了，但是细心的同学可能早已发现上面代码的坑，即：

```js
console.log(data.a) // undefined
```

直接在控制台打印 `data.a` 输出的值为 `undefined`，这是因为 `get` 函数没有任何返回值，所以获取任何属性的值都将是 `undefined`，其实这个问题很好解决，如下：

```js
for (let key in data) {
  const dep = []
  let val = data[key] // 缓存字段原有的值
  Object.defineProperty(data, key, {
    set (newVal) {
      // 如果值没有变什么都不做
      if (newVal === val) return
      // 使用新值替换旧值
      val = newVal
      dep.forEach(fn => fn())
    },
    get () {
      dep.push(Target)
      return val  // 将该值返回
    }
  })
}
```

只需要在使用 `Object.defineProperty` 函数定义访问器属性之前缓存一下原来的值即 `val`，然后在 `get` 函数中将 `val` 返回即可，除此之外还要记得在 `set` 函数中使用新值(`newVal`)重写旧值(`val`)。

但这样就完美了吗？当然没有，这距离完美可以说还相差十万八千里，比如当数据 `data` 是嵌套的对象时，我们的程序只能检测到第一层对象的属性，如果数据对象如下：

```js
const data = {
  a: {
    b: 1
  }
}
```

对于以上对象结构，我们的程序只能把 `data.a` 字段转换成响应式属性，而 `data.a.b` 依然不是响应式属性，但是这个问题还是比较容易解决的，只需要递归定义即可：

```js
function walk (data) {
  for (let key in data) {
    const dep = []
    let val = data[key]
    // 如果 val 是对象，递归调用 walk 函数将其转为访问器属性
    const nativeString = Object.prototype.toString.call(val)
    if (nativeString === '[object Object]') {
      walk(val)
    }
    Object.defineProperty(data, key, {
      set (newVal) {
        if (newVal === val) return
        val = newVal
        dep.forEach(fn => fn())
      },
      get () {
        dep.push(Target)
        return val
      }
    })
  }
}

walk(data)
```

如上代码我们将定义访问器属性的逻辑放到了函数 `walk` 中，并增加了一段判断逻辑如果某个属性的值仍然是对象，则递归调用 `walk` 函数。这样我们就实现了深度定义访问器属性。

但是虽然经过上面的改造 `data.a.b` 已经是访问器属性了，但是如下代码依然不能正确执行：

```js
$watch('a.b', () => {
  console.log('修改了字段 a.b')
})
```

来看看目前 `$watch` 函数的代码：

```js
function $watch (exp, fn) {
  Target = fn
  // 读取字段值，触发 get 函数
  data[exp]
}
```

读取字段值的时候我们直接使用 `data[exp]`，如果按照 `$watch('a.b', fn)` 这样调用 `$watch` 函数，那么 `data[exp]` 等价于 `data['a.b']`，这显然是不正确的，正确的读取字段值的方式应该是 `data['a']['b']`。所以我们需要稍微做一点小小的改造：

```js
const data = {
  a: {
    b: 1
  }
}

function $watch (exp, fn) {
  Target = fn
  let pathArr,
      obj = data
  // 检查 exp 中是否包含 .
  if (/\./.test(exp)) {
    // 将字符串转为数组，例：'a.b' => ['a', 'b']
    pathArr = exp.split('.')
    // 使用循环读取到 data.a.b
    pathArr.forEach(p => {
      obj = obj[p]
    })
    return
  }
  data[exp]
}
```

我们对 `$watch` 函数做了一些改造，首先检查要读取的字段是否包含 `.`，如果包含 `.` 说明读取嵌套对象的字段，这时候我们使用字符串的 `split('.')` 函数将字符串转为数组，所以如果访问的路径是 `a.b` 那么转换后的数组就是 `['a', 'b']`，然后使用一个循环从而读取到嵌套对象的属性值，不过需要注意的是读取到嵌套对象的属性值之后应该立即 `return`，不需要再执行后面的代码。

下面我们再进一步，我们思考一下 `$watch` 函数的原理是什么？其实 `$watch` 函数所做的事情就是想方设法地访问到你要观测的字段，从而触发该字段的 `get` 函数，进而收集依赖(观察者)。现在我们传递给 `$watch` 函数的第一个参数是一个字符串，代表要访问数据的哪一个字段属性，那么除了字符串之外可不可以是一个函数呢？假设我们有一个函数叫做 `render`，如下

```js
const data = {
  name: '霍春阳',
  age: 24
}

function render () {
  return document.write(`姓名：${data.name}; 年龄：${data.age}`)
}
```

可以看到 `render` 函数依赖了数据对象 `data`，那么 `render` 函数的执行是不是会触发 `data.name` 和 `data.age` 这两个字段的 `get` 拦截器呢？答案是肯定的，当然会！所以我们可以将 `render` 函数作为 `$watch` 函数的第一个参数：

```js
$watch(render, render)
```

为了能够保证 `$watch` 函数正常执行，我们需要对 `$watch` 函数做如下修改：

```js
function $watch (exp, fn) {
  Target = fn
  let pathArr,
      obj = data
  // 如果 exp 是函数，直接执行该函数
  if (typeof exp === 'function') {
    exp()
    return
  }
  if (/\./.test(exp)) {
    pathArr = exp.split('.')
    pathArr.forEach(p => {
      obj = obj[p]
    })
    return
  }
  data[exp]
}
```

在上面的代码中，我们检测了 `exp` 的类型，如果是函数则直接执行之，由于 `render` 函数的执行会触发数据字段的 `get` 拦截器，所以依赖会被收集。同时我们要注意传递给 `$watch` 函数的第二个参数：

```js
$watch(render, render)
```

第二个参数依然是 `render` 函数，也就是说当依赖发生变化时，会重新执行 `render` 函数，这样我们就实现了数据变化，并将变化自动应用到 `DOM`。其实这大概就是 `Vue` 的原理，但我们做的还远远不够，比如上面这句代码，第一个参数中 `render` 函数的执行使得我们能够收集依赖，当依赖变化时会重新执行第二个参数中的 `render` 函数，但不要忘了这又会触发一次数据字段的 `get` 拦截器，所以此时已经收集了两遍重复的依赖，那么我们是不是要想办法避免收集冗余的依赖呢？除此之外我们也没有对数组做处理，我们将这些问题留到后面，看看在 `Vue` 中它是如何处理的。

现在我们这个不严谨的实现暂时就到这里，意图在于让大家明白数据响应系统的整体思路，为接下来真正进入 `Vue` 源码做必要的铺垫。

## observe 工厂函数

了解了数据响应系统的基本思路，我们是时候回过头来深入研究 `Vue` 的数据响应系统是如何实现的了，我们回到 `initData` 函数的最后一句代码：

```js
// observe data
observe(data, true /* asRootData */)
```

调用了 `observe` 函数观测数据，`observe` 函数来自于 `core/observer/index.js` 文件，打开该文件找到 `observe` 函数：

```js
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
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
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}
```

如上是 `observe` 函数的全部代码， `observe` 函数接收两个参数，第一个参数是要观测的数据，第二个参数是一个布尔值，代表将要被观测的数据是否是根级数据。在 `observe` 函数的一开始是一段 `if` 判断语句：

```js
if (!isObject(value) || value instanceof VNode) {
  return
}
```

用来判断如果要观测的数据不是一个对象或者是 `VNode` 实例，则直接 `return` 。接着定义变量 `ob`，该变量用来保存 `Observer` 实例，可以发现 `observe` 函数的返回值就是 `ob`。紧接着又是一个 `if...else` 分支：

```js
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
```

我们先看 `if` 分支的判断条件，首先使用 `hasOwn` 函数检测数据对象 `value` 自身是否含有 `__ob__` 属性，并且 `__ob__` 属性应该是 `Observer` 的实例。如果为真则直接将数据对象自身的 `__ob__` 属性的值作为 `ob` 的值：`ob = value.__ob__`。那么 `__ob__` 是什么呢？其实当一个数据对象被观测之后将会在该对象上定义 `__ob__` 属性，所以 `if` 分支的作用是用来避免重复观测一个数据对象。

接着我们再来看看 `else...if` 分支，如果数据对象上没有定义 `__ob__` 属性，那么说明该对象没有被观测过，进而会判断 `else...if` 分支，如果 `else...if` 分支的条件为真，那么会执行 `ob = new Observer(value)` 对数据对象进行观测。也就是说只有当数据对象满足所有 `else...if` 分支的条件才会被观测，我们看看需要满足什么条件：

* 第一个条件是 `shouldObserve` 必须为 `true`

`shouldObserve` 变量也定义在 `core/observer/index.js` 文件内，如下：

```js
/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}
```

该变量的初始值为 `true`，在 `shouldObserve` 变量的下面定义了 `toggleObserving` 函数，该函数接收一个布尔值参数，用来切换 `shouldObserve` 变量的真假值，我们可以把 `shouldObserve` 想象成一个开关，为 `true` 时说明打开了开关，此时可以对数据进行观测，为 `false` 时可以理解为关闭了开关，此时数据对象将不会被观测。为什么这么设计呢？原因是有一些场景下确实需要这个开关从而达到一些目的，后面我们遇到的时候再仔细来说。

* 第二个条件是 `!isServerRendering()` 必须为真

`isServerRendering()` 函数的返回值是一个布尔值，用来判断是否是服务端渲染。也就是说只有当不是服务端渲染的时候才会观测数据，关于这一点 `Vue` 的服务端渲染文档中有相关介绍，我们不做过多说明。

* 第三个条件是 `(Array.isArray(value) || isPlainObject(value))` 必须为真

这个条件很好理解，只有当数据对象是数组或纯对象的时候，才有必要对其进行观测。

* 第四个条件是 `Object.isExtensible(value)` 必须为真

也就是说要被观测的数据对象必须是**可扩展的**。一个普通的对象默认就是可扩展的，以下三个方法都可以使得一个对象变得不可扩展：`Object.preventExtensions()`、`Object.freeze()` 以及 `Object.seal()`。

* 第五个条件是 `!value._isVue` 必须为真

我们知道 `Vue` 实例对象拥有 `_isVue` 属性，所以这个条件用来避免 `Vue` 实例对象被观测。

当一个对象满足了以上五个条件时，就会执行 `else...if` 语句块的代码，即创建一个 `Observer` 实例：

```js
ob = new Observer(value)
```

## Observer 构造函数

其实真正将数据对象转换成响应式数据的是 `Observer` 函数，它是一个构造函数，同样定义在 `core/observer/index.js` 文件下，如下是简化后的代码：

```js
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that has this object as root $data

  constructor (value: any) {
    // 省略...
  }

  walk (obj: Object) {
    // 省略...
  }
  
  observeArray (items: Array<any>) {
    // 省略...
  }
}
```

可以清晰的看到 `Observer` 类的实例对象将拥有三个实例属性，分别是 `value`、`dep` 和 `vmCount` 以及两个实例方法 `walk` 和 `observeArray`。`Observer` 类的构造函数接收一个参数，即数据对象。下面我们就从 `constructor` 方法开始，研究实例化一个 `Observer` 类时都做了哪些事情。

### 数据对象的 `__ob__` 属性

如下是 `constructor` 方法的全部代码：

```js
constructor (value: any) {
  this.value = value
  this.dep = new Dep()
  this.vmCount = 0
  def(value, '__ob__', this)
  if (Array.isArray(value)) {
    const augment = hasProto
      ? protoAugment
      : copyAugment
    augment(value, arrayMethods, arrayKeys)
    this.observeArray(value)
  } else {
    this.walk(value)
  }
}
```

`constructor` 方法的参数就是在实例化 `Observer` 实例时传递的参数，即数据对象本身，可以发现，实例对象的 `value` 属性引用了数据对象：

```js
this.value = value
```

实例对象的 `dep` 属性，保存了一个新创建的 `Dep` 实例对象：

```js
this.dep = new Dep()
```

那么这里的 `Dep` 是什么呢？就像我们在 `了解数据响应系统基本思路` 中所讲到的，它就是一个收集依赖的“筐”。但这个“筐”并不属于某一个字段，后面我们会发现，这个筐是属于某一个对象或数组的。

实例对象的 `vmCount` 属性被设置为 `0`：`this.vmCount = 0`。

初始化完成三个实例属性之后，使用 `def` 函数，为数据对象定义了一个 `__ob__` 属性，这个属性的值就是当前 `Observer` 实例对象。其中 `def` 函数其实就是 `Object.defineProperty` 函数的简单封装，之所以这里使用 `def` 函数定义 `__ob__` 属性是因为这样可以定义不可枚举的属性，这样后面遍历数据对象的时候就能够防止遍历到 `__ob__` 属性。

假设我们的数据对象如下：

```js
const data = {
  a: 1
}
```

那么经过 `def` 函数处理之后，`data` 对象应该变成如下这个样子：

```js
const data = {
  a: 1,
  // __ob__ 是不可枚举的属性
  __ob__: {
    value: data, // value 属性指向 data 数据对象本身，这是一个循环引用
    dep: dep实例对象, // new Dep()
    vmCount: 0
  }
}
```

### 响应式数据之纯对象的处理

接着进入一个 `if...else` 判断分支：

```js
if (Array.isArray(value)) {
  const augment = hasProto
    ? protoAugment
    : copyAugment
  augment(value, arrayMethods, arrayKeys)
  this.observeArray(value)
} else {
  this.walk(value)
}
```

该判断用来区分数据对象到底是数组还是一个纯对象，因为对于数组和纯对象的处理方式是不同的，为了更好地理解我们先看数据对象是一个纯对象的情况，这个时候代码会走 `else` 分支，即执行 `this.walk(value)` 函数，我们知道这个函数实例对象方法，找到这个方法：

```js
walk (obj: Object) {
  const keys = Object.keys(obj)
  for (let i = 0; i < keys.length; i++) {
    defineReactive(obj, keys[i])
  }
}
```

`walk` 方法很简单，首先使用 `Object.keys(obj)` 获取对象所有可枚举的属性，然后使用 `for` 循环遍历这些属性，同时为每个属性调用了 `defineReactive` 函数。

### defineReactive 函数

那我们就看一看 `defineReactive` 函数都做了什么，该函数也定义在 `core/observer/index.js` 文件，内容如下：

```js
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

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

`defineReactive` 函数的核心就是 **将数据对象的数据属性转换为访问器属性**，即为数据对象的属性设置一对 `getter/setter`，但其中做了很多处理边界条件的工作。`defineReactive` 接收五个参数，但是在 `walk` 方法中调用 `defineReactive` 函数时只传递了前两个参数，即数据对象和属性的键名。我们看一下 `defineReactive` 的函数体，首先定义了 `dep` 常量，它是一个 `Dep` 实例对象：

```js
const dep = new Dep()
```

我们在讲解 `Observer` 的 `constructor` 方法时看到过，在 `constructor` 方法中为数据对象定义了一个 `__ob__` 属性，该属性是一个 `Observer` 实例对象，且该对象包含一个 `Dep` 实例对象：

```js
const data = {
  a: 1,
  __ob__: {
    value: data,
    dep: dep实例对象, // new Dep() , 包含 Dep 实例对象
    vmCount: 0
  }
}
```

当时我们说过 `__ob__.dep` 这个 `Dep` 实例对象的作用与我们在讲解数据响应系统基本思路一节中所说的“筐”的作用不同。至于他的作用是什么我们后面会讲到。其实与我们前面所说过的“筐”的作用相同的 `Dep` 实例对象是在 `defineReactive` 函数一开始定义的 `dep` 常量，即：

```js
const dep = new Dep()
```

这个 `dep` 常量所引用的 `Dep` 实例对象才与我们前面讲过的“筐”的作用相同。细心的同学可能已经注意到了 `dep` 在访问器属性的 `getter/setter` 中被闭包引用，如下：

```js
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  // 省略...

  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        // 这里闭包引用了上面的 dep 常量
        dep.depend()
        // 省略...
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      // 省略...

      // 这里闭包引用了上面的 dep 常量
      dep.notify()
    }
  })
}
```

如上面的代码中注释所写的那样，在访问器属性的 `getter/setter` 中，通过闭包引用了前面定义的“筐”，即 `dep` 常量。这里大家要明确一件事情，即 **每一个数据字段都通过闭包引用着属于自己的 `dep` 常量**。因为在 `walk` 函数中通过循环遍历了所有数据对象的属性，并调用 `defineReactive` 函数，所以每次调用 `defineReactive` 定义访问器属性时，该属性的 `setter/getter` 都闭包引用了一个属于自己的“筐”。假设我们有如下数据字段：

```js
const data = {
  a: 1,
  b: 2
}
```

那么字段 `data.a` 和 `data.b` 都将通过闭包引用属于自己的 `Dep` 实例对象，如下图所示：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-04-05-032455.jpg)

每个字段的 `Dep` 对象都被用来收集那些属于对应字段的依赖。

在定义 `dep` 常量之后，是这样一段代码：

```js
const property = Object.getOwnPropertyDescriptor(obj, key)
if (property && property.configurable === false) {
  return
}
```

首先通过 `Object.getOwnPropertyDescriptor` 函数获取该字段可能已有的属性描述对象，并将该对象保存在 `property` 常量中，接着是一个 `if` 语句块，判断该字段是否是可配置的，如果不可配置(`property.configurable === false`)，那么直接 `return` ，即不会继续执行 `defineReactive` 函数。这么做也是合理的，因为一个不可配置的属性是不能使用也没必要使用 `Object.defineProperty` 改变其属性定义的。

再往下是这样一段代码：

```js
// cater for pre-defined getter/setters
const getter = property && property.get
const setter = property && property.set
if ((!getter || setter) && arguments.length === 2) {
  val = obj[key]
}

let childOb = !shallow && observe(val)
```

这段代码的前两句定义了 `getter` 和 `setter` 常量，分别保存了来自 `property` 对象的 `get` 和 `set` 函数，我们知道 `property` 对象是属性的描述对象，一个对象的属性很可能已经是一个访问器属性了，所以该属性很可能已经存在 `get` 或 `set` 方法。由于接下来会使用 `Object.defineProperty` 函数重新定义属性的 `setter/getter`，这会导致属性原有的 `set` 和 `get` 方法被覆盖，所以要将属性原有的 `setter/getter` 缓存，并在重新定义的 `set` 和 `get` 方法中调用缓存的函数，从而做到不影响属性的原有读写操作。

上面这段代码中比较难理解的是 `if` 条件语句：

```js
(!getter || setter) && arguments.length === 2
```

其中 `arguments.length === 2` 这个条件好理解，当只传递两个参数时，说明没有传递第三个参数 `val`，那么此时需要根据 `key` 主动去对象上获取相应的值，即执行 `if` 语句块内的代码：`val = obj[key]`。那么 `(!getter || setter)` 这个条件的意思是什么呢？要理解这个条件我们需要思考一些实际应用的场景，或者说边界条件，但是现在还不适合给大家讲解，我们等到讲解完整个 `defineReactive` 函数之后，再回头来说。

在 `if` 语句块的下面，是这句代码：

```js
let childOb = !shallow && observe(val)
```

定义了 `childOb` 变量，我们知道，在 `if` 语句块里面，获取到了对象属性的值 `val`，但是 `val` 本身有可能也是一个对象，那么此时应该继续调用 `observe(val)` 函数观测该对象从而深度观测数据对象。但前提是 `defineReactive` 函数的最后一个参数 `shallow` 应该是假，即 `!shallow` 为真时才会继续调用 `observe` 函数深度观测，由于在 `walk` 函数中调用 `defineReactive` 函数时没有传递 `shallow` 参数，所以该参数是 `undefined`，那么也就是说默认就是深度观测。其实非深度观测的场景我们早就遇到过了，即 `initRender` 函数中在 `Vue` 实例对象上定义 `$attrs` 属性和 `$listeners` 属性时就是非深度观测，如下：

```js
defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true) // 最后一个参数 shallow 为 true
defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
```

大家要注意一个问题，即使用 `observe(val)` 深度观测数据对象时，这里的 `val` 未必有值，因为必须在满足条件 `(!getter || setter) && arguments.length === 2` 时，才会触发取值的动作：`val = obj[key]`，所以一旦不满足条件即使属性是有值的但是由于没有触发取值的动作，所以 `val` 依然是 `undefined`。这就会导致深度观测无效。

### 被观测后的数据对象的样子

现在我们需要明确一件事情，那就是一个数据对象经过了 `observe` 函数处理之后变成了什么样子，假设我们有如下数据对象：

```js
const data = {
  a: {
    b: 1
  }
}

observe(data)
```

数据对象 `data` 拥有一个叫做 `a` 的属性，且属性 `a` 的值是另外一个对象，该对象拥有一个叫做 `b` 的属性。那么经过 `observe` 处理之后， `data` 和 `data.a` 这两个对象都被定义了 `__ob__` 属性，并且访问器属性 `a` 和 `b` 的 `setter/getter` 都通过闭包引用着属于自己的 `Dep` 实例对象和 `childOb` 对象：

```js
const data = {
  // 属性 a 通过 setter/getter 通过闭包引用着 dep 和 childOb
  a: {
    // 属性 b 通过 setter/getter 通过闭包引用着 dep 和 childOb
    b: 1
    __ob__: {a, dep, vmCount}
  }
  __ob__: {data, dep, vmCount}
}
```

如下图所示：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-04-06-072754.jpg)

需要注意的是，属性 `a` 闭包引用的 `childOb` 实际上就是 `data.a.__ob__`。而属性 `b` 闭包引用的 `childOb` 是 `undefined`，因为属性 `b` 是基本类型值，并不是对象也不是数组。

### 在 get 函数中如何收集依赖

我们回过头来继续查看 `defineReactive` 函数的代码，接下来是 `defineReactive` 函数的关键代码，即使用 `Object.defineProperty` 函数定义访问器属性：

```js
Object.defineProperty(obj, key, {
  enumerable: true,
  configurable: true,
  get: function reactiveGetter () {
    // 省略...
  },
  set: function reactiveSetter (newVal) {
    // 省略...
})
```

当执行完以上代码实际上 `defineReactive` 函数就执行完毕了，对于访问器属性的 `get` 和 `set` 函数是不会执行的，因为此时没有触发属性的读取和设置操作。不过这不妨碍我们研究一下在 `get` 和 `set` 函数中都做了哪些事情，这里面就包含了我们在前面埋下伏笔的 `if` 条件语句的答案。我们先从 `get` 函数开始，看一看当属性被读取的时候都做了哪些事情，`get` 函数如下：

```js
get: function reactiveGetter () {
  const value = getter ? getter.call(obj) : val
  if (Dep.target) {
    dep.depend()
    if (childOb) {
      childOb.dep.depend()
      if (Array.isArray(value)) {
        dependArray(value)
      }
    }
  }
  return value
}
```

既然是 `getter`，那么当然要能够正确地返回属性的值才行，我们知道依赖的收集时机就是属性被读取的时候，所以 `get` 函数做了两件事：正确地返回属性值以及收集依赖，我们具体看一下代码，`get` 函数的第一句代码如下：

```js
const value = getter ? getter.call(obj) : val
```

首先判断是否存在 `getter`，我们知道 `getter` 常量中保存的是属性原有的 `get` 函数，如果 `getter` 存在那么直接调用该函数，并以该函数的返回值作为属性的值，保证属性的原有读取操作正常运作。如果 `getter` 不存在则使用 `val` 作为属性的值。可以发现 `get` 函数的最后一句将 `value` 常量返回，这样 `get` 函数需要做的第一件事就完成了，即正确地返回属性值。

除了正确地返回属性值，还要收集依赖，而处于 `get` 函数第一行和最后一行代码中间的所有代码都是用来完成收集依赖这件事儿的，下面我们就看一下它是如何收集依赖的，由于我们还没有讲解过 `Dep` 这个类，所以现在大家可以简单的认为 `dep.depend()` 这句代码的执行就意味着依赖被收集了。接下来我们仔细看一下代码：

```js
if (Dep.target) {
  dep.depend()
  if (childOb) {
    childOb.dep.depend()
    if (Array.isArray(value)) {
      dependArray(value)
    }
  }
}
```

首先判断 `Dep.target` 是否存在，那么 `Dep.target` 是什么呢？其实 `Dep.target` 与我们在 `数据响应系统基本思路` 一节中所讲的 `Target` 作用相同，所以 `Dep.target` 中保存的值就是要被收集的依赖(观察者)。所以如果 `Dep.target` 存在的话说明有依赖需要被收集，这个时候才需要执行 `if` 语句块内的代码，如果 `Dep.target` 不存在就意味着没有需要被收集的依赖，所以当然就不需要执行 `if` 语句块内的代码了。

在 `if` 语句块内第一句执行的代码就是：`dep.depend()`，执行 `dep` 对象的 `depend` 方法将依赖收集到 `dep` 这个“筐”中，这里的 `dep` 对象就是属性的 `getter/setter` 通过闭包引用的“筐”。

接着又判断了 `childOb` 是否存在，如果存在那么就执行 `childOb.dep.depend()`，这段代码是什么意思呢？要想搞清楚这段代码的作用，你需要知道 `childOb` 是什么，前面我们分析过，假设有如下数据对象：

```js
const data = {
  a: {
    b: 1
  }
}
```

该数据对象经过观测处理之后，将被添加 `__ob__` 属性，如下：

```js
const data = {
  a: {
    b: 1,
    __ob__: {value, dep, vmCount}
  },
  __ob__: {value, dep, vmCount}
}
```

对于属性 `a` 来讲，访问器属性 `a` 的 `setter/getter` 通过闭包引用了一个 `Dep` 实例对象，即属性 `a` 用来收集依赖的“筐”。除此之外访问器属性 `a` 的 `setter/getter` 还通过闭包引用着 `childOb`，且 `childOb === data.a.__ob__` 所以 `childOb.dep === data.a.__ob__.dep`。也就是说 `childOb.dep.depend()` 这句话的执行说明除了要将依赖收集到属性 `a` 自己的“筐”里之外，还要将同样的依赖收集到 `data.a.__ob__.dep` 这里”筐“里，为什么要将同样的依赖分别收集到这两个不同的”筐“里呢？其实答案就在于这两个”筐“里收集的依赖的触发时机是不同的，即作用不同，两个”筐“如下：

* 第一个”筐“是 `dep`
* 第二个”筐“是 `childOb.dep`

第一个”筐“里收集的依赖的触发时机是当属性值被修改时触发，即在 `set` 函数中触发：`dep.notify()`。而第二个”筐“里收集的依赖的触发时机是在使用 `$set` 或 `Vue.set` 给数据对象添加新属性时触发，我们知道由于 `js` 语言的限制，在没有 `Proxy` 之前 `Vue` 没办法拦截到给对象添加属性的操作。所以 `Vue` 才提供了 `$set` 和 `Vue.set` 等方法让我们有能力给对象添加新属性的同时触发依赖，那么触发依赖是怎么做到的呢？就是通过数据对象的 `__ob__` 属性做到的。因为 `__ob__.dep` 这个”筐“里收集了与 `dep` 这个”筐“同样的依赖。假设 `Vue.set` 函数代码如下：

```js
Vue.set = function (obj, key, val) {
  defineReactive(obj, key, val)
  obj.__ob__.dep.notify()
}
```

如上代码所示，当我们使用上面的代码给 `data.a` 对象添加新的属性：

```js
Vue.set(data.a, 'c', 1)
```

上面的代码之所以能够触发依赖，就是因为 `Vue.set` 函数中触发了收集在 `data.a.__ob__.dep` 这个”筐“中的依赖：

```js
Vue.set = function (obj, key, val) {
  defineReactive(obj, key, val)
  obj.__ob__.dep.notify() // 相当于 data.a.__ob__.dep.notify()
}

Vue.set(data.a, 'c', 1)
```

所以 `__ob__` 属性以及 `__ob__.dep` 的主要作用是为了添加、删除属性时有能力触发依赖，而这就是 `Vue.set` 或 `Vue.delete` 的原理。

在 `childOb.dep.depend()` 这句话的下面还有一个 `if` 条件语句，如下：

```js
if (Array.isArray(value)) {
  dependArray(value)
}
```

如果读取的属性值是数组，那么需要调用 `dependArray` 函数逐个触发数组每个元素的依赖收集，为什么这么做呢？那是因为 `Observer` 类在定义响应式属性时对于纯对象和数组的处理方式是不同，对于上面这段 `if` 语句的目的等到我们讲解到对于数组的处理时，会详细说明。

### 在 set 函数中如何触发依赖

在 `get` 函数中收集了依赖之后，接下来我们就要看一下在 `set` 函数中是如何触发依赖的，即当属性被修改的时候如何触发依赖。`set` 函数如下：

```js
set: function reactiveSetter (newVal) {
  const value = getter ? getter.call(obj) : val
  /* eslint-disable no-self-compare */
  if (newVal === value || (newVal !== newVal && value !== value)) {
    return
  }
  /* eslint-enable no-self-compare */
  if (process.env.NODE_ENV !== 'production' && customSetter) {
    customSetter()
  }
  if (setter) {
    setter.call(obj, newVal)
  } else {
    val = newVal
  }
  childOb = !shallow && observe(newVal)
  dep.notify()
}
```

我们知道 `get` 函数主要完成了两部分重要的工作，一个是返回正确的属性值，另一个是收集依赖。与 `get` 函数类似， `set` 函数也要完成两个重要的事情，第一正确地为属性设置新值，第二是能够触发相应的依赖。

首先 `set` 函数接收一个参数 `newVal`，即该属性被设置的新值。在函数体内，先执行了这样一句话：

```js
const value = getter ? getter.call(obj) : val

```

这句话与 `get` 函数体的第一句话相同，即取得属性原有的值，为什么要取得属性原来的值呢？很简单，因为我们需要拿到原有的值与新的值作比较，并且只有在原有值与新设置的值不相等的情况下才需要触发依赖和重新设置属性值，否则意味着属性值并没有改变，当然不需要做额外的处理。如下代码：

```js
/* eslint-disable no-self-compare */
if (newVal === value || (newVal !== newVal && value !== value)) {
  return
}
```

这里就对比了新值和旧值：`newVal === value`。如果新旧值全等，那么函数直接 `return`，不做任何处理。但是除了对比新旧值之外，我们还注意到，另外一个条件：

```js
(newVal !== newVal && value !== value)
```

如果满足该条件，同样不做任何处理，那么这个条件什么意思呢？`newVal !== newVal` 说明新值与新值自身都不全等，同时旧值与旧值自身也不全等，大家想一下在 `js` 中什么时候会出现一个值与自身都不全等的？答案就是 `NaN`：

```js
NaN === NaN // false
```

所以我们现在重新分析一下这个条件，首先 `value !== value` 成立那说明该属性的原有值就是 `NaN`，同时 `newVal !== newVal` 说明为该属性设置的新值也是 `NaN`，所以这个时候新旧值都是 `NaN`，等价于属性的值没有变化，所以自然不需要做额外的处理了，`set` 函数直接 `return` 。

再往下又是一个 `if` 语句块：

```js
/* eslint-enable no-self-compare */
if (process.env.NODE_ENV !== 'production' && customSetter) {
  customSetter()
}
```

上面这段代码的作用是，如果 `customSetter` 函数存在，那么在非生产环境下执行 `customSetter` 函数。其中 `customSetter` 函数是 `defineReactive` 函数的第四个参数。那么 `customSetter` 函数的作用是什么呢？其实我们在讲解 `initRender` 函数的时候就讲解过 `customSetter` 的作用，如下是 `initRender` 函数中的一段代码：

```js
defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
  !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
}, true)
```

上面的代码中使用 `defineReactive` 在 `Vue` 实例对象 `vm` 上定义了 `$attrs` 属性，可以看到传递给 `defineReactive` 函数的第四个参数是一个箭头函数，这个函数就是 `customSetter`，这个箭头函数的作用是当你尝试修改 `vm.$attrs` 属性的值时，打印一段信息：**`$attrs` 属性是只读的**。这就是 `customSetter` 函数的作用，用来打印辅助信息，当然除此之外你可以将 `customSetter` 用在任何适合使用它的地方。

我们回到 `set` 函数，再往下是这样一段代码：

```js
if (setter) {
  setter.call(obj, newVal)
} else {
  val = newVal
}
```

上面这段代码的意图很明显，即正确地设置属性值，首先判断 `setter` 是否存在，我们知道 `setter` 常量存储的是属性原有的 `set` 函数。即如果属性原来拥有自身的 `set` 函数，那么应该继续使用该函数来设置属性的值，从而保证属性原有的设置操作不受影响。如果属性原本就没有 `set` 函数，那么就设置 `val` 的值：`val = newVal`。

接下来就是 `set` 函数的最后两句代码，如下：

```js
childOb = !shallow && observe(newVal)
dep.notify()
```

我们知道，由于属性被设置了新的值，那么假如我们为属性设置的新值是一个数组或者纯对象，那么该数组或纯对象是未被观测的，所以需要对新值进行观测，这就是第一句代码的作用，同时使用新的观测对象重写 `childOb` 的值。当然了，这些操作都是在 `!shallow` 为真的情况下，即需要深度观测的时候才会执行。最后是时候触发依赖了，我们知道 `dep` 是属性用来收集依赖的”筐“，现在我们需要把”筐“里的依赖都执行一下，而这就是 `dep.notify()` 的作用。

至此 `set` 函数我们就讲解完毕了。

### 保证定义响应式数据行为的一致性

本节我们主要讲解 `defineReactive` 函数中的一段代码，即：

```js
if ((!getter || setter) && arguments.length === 2) {
  val = obj[key]
}
```

在之前的讲解中，我们没有详细地讲解如上代码所示的这段 `if` 语句块。该 `if` 语句有两个条件：

* 第一：`(!getter || setter)`
* 第二：`arguments.length === 2`

并且这两个条件要同时满足才能会根据 `key` 去对象 `obj` 上取值：`val = obj[key]`，否则就不会触发取值的动作，触发不了取值的动作就意味着 `val` 的值为 `undefined`，这会导致 `if` 语句块后面的那句深度观测的代码无效，即不会深度观测：

```js
// val 是 undefined，不会深度观测
let childOb = !shallow && observe(val)
```

对于第二个条件，很好理解，当传递参数的数量为 `2` 时，说明没有传递第三个参数 `val`，那么当然需要通过执行 `val = obj[key]` 去获取属性值。比较难理解的是第一个条件，即 `(!getter || setter)`，要理解这个问题你需要知道 `Vue` 代码的变更，以及为什么变更。其实在最初并没有上面这段 `if` 语句块，在 `walk` 函数中是这样调用 `defineReactive` 函数的：

```js
walk (obj: Object) {
  const keys = Object.keys(obj)
  for (let i = 0; i < keys.length; i++) {
    // 这里传递了第三个参数
    defineReactive(obj, keys[i], obj[keys[i]])
  }
}
```

可以发现在调用 `defineReactive` 函数的时候传递了第三个参数，即属性值。这是最初的实现，后来变成了如下这样：

```js
walk (obj: Object) {
  const keys = Object.keys(obj)
  for (let i = 0; i < keys.length; i++) {
    // 在 walk 函数中调用 defineReactive 函数时暂时不获取属性值
    defineReactive(obj, keys[i])
  }
}

// ================= 分割线 =================

// 在 defineReactive 函数内获取属性值
if (!getter && arguments.length === 2) {
  val = obj[key]
}
```

在 `walk` 函数中调用 `defineReactive` 函数时去掉了第三个参数，而是在 `defineReactive` 函数体内增加了一段 `if` 分支语句，当发现调用 `defineReactive` 函数时传递了两个参数，同时只有在属性没有 `get` 函数的情况下才会通过 `val = obj[key]` 取值。

为什么要这么做呢？具体可以查看这个 [issue](https://github.com/vuejs/vue/pull/7302)。简单的说就是当属性原本存在 `get` 拦截器函数时，在初始化的时候不要触发 `get` 函数，只有当真正的获取该属性的值的时候，再通过调用缓存下来的属性原本的 `getter` 函数取值即可。所以看到这里我们能够发现，如果数据对象的某个属性原本就拥有自己的 `get` 函数，那么这个属性就不会被深度观测，因为当属性原本存在 `getter` 时，是不会触发取值动作的，即 `val = obj[key]` 不会执行，所以 `val` 是 `undefined`，这就导致在后面深度观测的语句中传递给 `observe` 函数的参数是 `undefined`。

举个例子，如下：

```js
const data = {
  getterProp: {
    a: 1
  }
}

new Vue({
  data,
  watch: {
    'getterProp.a': () => {
      console.log('这句话会输出')
    }
  }
})
```

上面的代码中，我们定义了数据 `data`，`data` 是一个嵌套的对象，在 `watch` 选项中观察了属性 `getterProp.a`，当我们修改 `getterProp.a` 的值时，以上代码是能够正常输出的，这也是预期行为。再看如下代码：

```js
const data = {}
Object.defineProperty(data, 'getterProp', {
  enumerable: true,
  configurable: true,
  get: () => {
    return {
      a: 1
    }
  }
})

const ins = new Vue({
  data,
  watch: {
    'getterProp.a': () => {
      console.log('这句话不会输出')
    }
  }
})
```

我们仅仅修改了定义数据对象 `data` 的方式，此时 `data.getterProp` 本身已经是一个访问器属性，且拥有 `get` 方法。此时当我们尝试修改 `getterProp.a` 的值时，在 `watch` 中观察 `getterProp.a` 的函数不会被执行。这是因为属性 `getterProp` 是一个拥有 `get` 拦截器函数的访问器属性，而当 `Vue` 发现该属性拥有原本的 `getter` 时，是不会深度观测的。

那么为什么当属性拥有自己的 `getter` 时就不会对其深度观测了呢？有两方面的原因，第一：由于当属性存在原本的 `getter` 时在深度观测之前不会取值，所以在深度观测语句执行之前取不到属性值从而无法深度观测。第二：之所以在深度观测之前不取值是因为属性原本的 `getter` 由用户定义，用户可能在 `getter` 中做任何意想不到的事情，这么做是出于避免引发不可预见行为的考虑。

我们回过头来再看这段 `if` 语句块：

```js
if (!getter && arguments.length === 2) {
  val = obj[key]
}
```

这么做难道不会有什么问题吗？当然有问题，我们知道当数据对象的某一个属性只拥有 `get` 拦截器函数而没有 `set` 拦截器函数时，此时该属性不会被深度观测。但是经过 `defineReactive` 函数的处理之后，该属性将被重新定义 `getter` 和 `setter`，此时该属性变成了既拥有 `get` 函数又拥有 `set` 函数。并且当我们尝试给该属性重新赋值时，那么新的值将会被观测。这时候矛盾就产生了：**原本该属性不会被深度观测，但是重新赋值之后，新的值却被观测了**。

这就是所谓的 **定义响应式数据时行为的不一致**，为了解决这个问题，采用的办法是当属性拥有原本的 `setter` 时，即使拥有 `getter` 也要获取属性值并观测之，这样代码就变成了最终这个样子：

```js
if ((!getter || setter) && arguments.length === 2) {
  val = obj[key]
}
```

### 响应式数据之数组的处理

以上就是响应式数据对于纯对象的处理方式，接下来我们将会对数组展开详细的讨论。回到 `Observer` 类的 `constructor` 函数，找到如下代码：

```js
if (Array.isArray(value)) {
  const augment = hasProto
    ? protoAugment
    : copyAugment
  augment(value, arrayMethods, arrayKeys)
  this.observeArray(value)
} else {
  this.walk(value)
}
```

在 `if` 条件语句中，使用 `Array.isArray` 函数检测被观测的值 `value` 是否是数组，如果是数组则会执行 `if` 语句块内的代码，从而实现对数组的观测。处理数组的方式与纯对象不同，我们知道数组是一个特殊的数据结构，它有很多实例方法，并且有些方法会改变数组自身的值，我们称其为变异方法，这些方法有：`push`、`pop`、`shift`、`unshift`、`splice`、`sort` 以及 `reverse` 等。这个时候我们就要考虑一件事，即当用户调用这些变异方法改变数组时需要触发依赖。换句话说我们需要知道开发者何时调用了这些变异方法，只有这样我们才有可能在这些方法被调用时做出反应。

### 拦截数组变异方法的思路

那么怎么样才能知道开发者何时调用了数组的变异方法呢？其实很简单，我们来思考这样一个问题，如下代码中 `sayHello` 函数用来打印字符串 `'hello'`：

```js
function sayHello () {
  console.log('hello')
}
```

但是我们有这样一个需求，在不改动 `sayHello` 函数源码的情况下，在打印字符串 `'hello'` 之前先输出字符串 `'Hi'`。这时候我们可以这样做：

```js
const originalSayHello = sayHello
sayHello = function () {
  console.log('Hi')
  originalSayHello()
}
```

看，这样就完美地实现了我们的需求，首先使用 `originalSayHello` 变量缓存原来的 `sayHello` 函数，然后重新定义 `sayHello` 函数，并在新定义的 `sayHello` 函数中调用缓存下来的 `originalSayHello`。这样我们就保证了在不改变 `sayHello` 函数行为的前提下对其进行了功能扩展。

这其实是一个很通用也很常见的技巧，而 `Vue` 正是通过这个技巧实现了对数据变异方法的拦截，即保持数组变异方法原有功能不变的前提下对其进行功能扩展。我们知道数组实例的变异方法是来自于数组构造函数的原型，如下图：

![http://7xlolm.com1.z0.glb.clouddn.com/2018-04-28-133359.jpg](http://7xlolm.com1.z0.glb.clouddn.com/2018-04-28-133359.jpg)

数组本身也是一个对象，所以它实例的 `__proto__` 属性指向的就是数组构造函数的原型，即 `arr.__proto__ === Array.prototype` 为真。我们的一个思路是通过设置 `__proto__` 属性的值为一个新的对象，且该新对象的原型是数组构造函数原来的原型对象，如下图所示：

![http://7xlolm.com1.z0.glb.clouddn.com/2018-04-28-153539.jpg](http://7xlolm.com1.z0.glb.clouddn.com/2018-04-28-153539.jpg)

我们知道数组本身也是一个对象，既然是对象那么当然可以访问其 `__proto__` 属性，上图中数组实例的 `__proto__` 属性指向了 `arrayMethods` 对象，同时 `arrayMethods` 对象的 `__proto__` 属性指向了真正的数组原型对象。并且 `arrayMethods` 对象上定义了与数组变异方法同名的函数，这样当通过数组实例调用变异方法时，首先执行的是 `arrayMethods` 上的同名函数，这样就能够实现对数组变异方法的拦截。用代码实现上图所示内容很简单，如下：

```js
// 要拦截的数组变异方法
const mutationMethods = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

const arrayMethods = Object.create(Array.prototype) // 实现 arrayMethods.__proto__ === Array.prototype
const arrayProto = Array.prototype  // 缓存 Array.prototype

mutationMethods.forEach(method => {
  arrayMethods[method] = function (...args) {
    const result = arrayProto[method].apply(this, args)

    console.log(`执行了代理原型的 ${method} 函数`)

    return result
  }
})
```

如上代码所示，我们通过 `Object.create(Array.prototype)` 创建了 `arrayMethods` 对象，这样就保证了 `arrayMethods.__proto__ === Array.prototype`。然后通过一个循环在 `arrayMethods` 对象上定义了与数组变异方法同名的函数，并在这些函数内调用了真正数组原型上的相应方法。我们可以测试一下，如下代码：

```js
const arr = []
arr.__proto__ = arrayMethods

arr.push(1)
```

可以发现控制台中打印了一句话：`执行了代理原型的 push 函数`。很完美，但是这实际上是存在问题的，因为 `__proto__` 属性是在 `IE11+` 才开始支持，所以如果是低版本的 `IE` 怎么办？比如 `IE9/10`，所以出于兼容考虑，我们需要做能力检测，如果当前环境支持 `__proto__` 时我们就采用上述方式来实现对数组变异方法的拦截，如果当前环境不支持 `__proto__` 那我们就需要另想办法了，接下来我们就介绍一下兼容的处理方案。

实际上兼容的方案有很多，其中一个比较好的方案是直接在数组实例上定义与变异方法同名的函数，如下代码：

```js
const arr = []
const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

arrayKeys.forEach(method => {
  arr[method] = arrayMethods[method]
})
```

上面代码中，我们通过 `Object.getOwnPropertyNames` 函数获取所有属于 `arrayMethods` 对象自身的键，然后通过一个循环在数组实例上定义与变异方法同名的函数，这样当我们尝试调用 `arr.push()` 时，首先执行的是定义在数组实例上的 `push` 函数，也就是 `arrayMethods.push` 函数。这样我们就实现了兼容版本的拦截。不过细心的同学可能已经注意到了，上面这种直接在数组实例上定义的属性是可枚举的，所以更好的做法是使用 `Object.defineProperty`：

```js
arrayKeys.forEach(method => {
  Object.defineProperty(arr, method, {
    enumerable: false,
    writable: true,
    configurable: true,
    value: arrayMethods[method]
  })
})
```

这样就完美了。

### 拦截数组变异方法在 Vue 中的实现

我们已经了解了拦截数组变异方法的思路，接下来我们就可以具体的看一下 `Vue` 源码是如何实现的。在这个过程中我们会讲解数组是如何通过变异方法触发依赖(`观察者`)的。

我们回到 `Observer` 类的 `constructor` 函数：

```js
constructor (value: any) {
  this.value = value
  this.dep = new Dep()
  this.vmCount = 0
  def(value, '__ob__', this)
  if (Array.isArray(value)) {
    const augment = hasProto
      ? protoAugment
      : copyAugment
    augment(value, arrayMethods, arrayKeys)
    this.observeArray(value)
  } else {
    this.walk(value)
  }
}
```

首先大家注意一点：无论是对象还是数组，都将通过 `def` 函数为其定义 `__ob__` 属性。接着我们来看一下 `if` 语句块的内容，如果被观测的值是一个数组，那么 `if` 语句块内的代码将被执行，即如下代码：

```js
const augment = hasProto
  ? protoAugment
  : copyAugment
augment(value, arrayMethods, arrayKeys)
this.observeArray(value)
```

首先定义了 `augment` 常量，这个常量的值根据 `hasProto` 的真假而定，如果 `hasProto` 为真则 `augment` 的值为 `protoAugment`，否则值为 `copyAugment`。那么 `hasProto` 是什么呢？大家可以在附录 [core/util 目录下的工具方法全解](../appendix/core-util.md) 中查看其讲解，其实 `hasProto` 是一个布尔值，它用来检测当前环境是否可以使用 `__proto__` 属性，如果 `hasProto` 为真则当前环境支持 `__proto__` 属性，否则意味着当前环境不能够使用 `__proto__` 属性。

如果当前环境支持使用 `__proto__` 属性，那么 `augment` 的值是 `protoAugment`，其中 `protoAugment` 就定义在 `Observer` 类的下方。源码如下：

```js
/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object, keys: any) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}
```

那么 `protoAugment` 函数的作用是什么呢？相信大家已经猜到了，正如我们在讲解拦截数据变异方法的思路中所说的那样，可以通过设置数组实例的 `__proto__` 属性，让其指向一个代理原型，从而做到拦截。我们看一下 `protoAugment` 函数是如何被调用的：

```js
const augment = hasProto
  ? protoAugment
  : copyAugment
augment(value, arrayMethods, arrayKeys)
```

当 `hasProto` 为真时，`augment` 引用的就是 `protoAugment` 函数，所以调用 `augment` 函数等价于调用 `protoAugment` 函数，可以看到传递给 `protoAugment` 函数的参数有三个。第一个参数是 `value`，其实就是数组实例本身；第二个参数是 `arrayMethods`，这里的 `arrayMethods` 与我们在拦截数据变异方法的思路中所讲解的 `arrayMethods` 是一样的，它就是代理原型；第三个参数是 `arrayKeys`，我们可以在 `src/core/observer/array.js` 文件中找到这样一行代码：

```js
const arrayKeys = Object.getOwnPropertyNames(arrayMethods)
```

其实 `arrayKeys` 是一个包含了所有定义在 `arrayMethods` 对象上的 `key`，其实也就是所有我们要拦截的数组变异方法的名字：

```js
arrayKeys = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]
```

但实际上 `protoAugment` 函数虽然接收三个参数，但它并没有使用第三个参数。可能有的同学会问为什么 `protoAugment` 函数没有使用第三个参数却依然声明了第三个参数呢？原因是为了让 `flow` 更好地工作。

我们回到 `protoAugment` 函数，如下：

```js
/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object, keys: any) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}
```

该函数的函数体只有一行代码：`target.__proto__ = src`。这行代码用来将数组实例的原型指向代理原型(`arrayMethods`)。下面我们具体看一下 `arrayMethods` 是如何实现的。打开 `src/core/observer/array.js` 文件：

```js
/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change
    ob.dep.notify()
    return result
  })
})
```

如上是 `src/core/observer/array.js` 文件的全部代码，该文件只做了一件事情，那就是导出 `arrayMethods` 对象：

```js
const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)
```

可以发现，`arrayMethods` 对象的原型是真正的数组构造函数的原型。接着定义了 `methodsToPatch` 常量：

```js
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]
```

`methodsToPatch` 常量是一个数组，包含了所有需要拦截的数组变异方法的名字。再往下是一个 `forEach` 循环，用来遍历 `methodsToPatch` 数组。该循环的主要目的就是使用 `def` 函数在 `arrayMethods` 对象上定义与数组变异方法同名的函数，从而做到拦截的目的，如下是简化后的代码：

```js
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__

    // 省略中间部分...

    // notify change
    ob.dep.notify()
    return result
  })
})
```

上面的代码中，首先缓存了数组原本的变异方法：

```js
const original = arrayProto[method]
```

然后使用 `def` 函数在 `arrayMethods` 上定义与数组变异方法同名的函数，在函数体内优先调用了缓存下来的数组变异方法：

```js
const result = original.apply(this, args)
```

并将数组原本变异方法的返回值赋值给 `result` 常量，并且我们发现函数体的最后一行代码将 `result` 作为返回值返回。这就保证了拦截函数的功能与数组原本变异方法的功能是一致的。

关键要注意这两句代码：

```js
const ob = this.__ob__

// 省略中间部分...

// notify change
ob.dep.notify()
```

定义了 `ob` 常量，它是 `this.__ob__` 的引用，其中 `this` 其实就是数组实例本身，我们知道无论是数组还是对象，都将会被定义一个 `__ob__` 属性，并且 `__ob__.dep` 中收集了所有该对象(或数组)的依赖(观察者)。所以上面两句代码的目的其实很简单，当调用数组变异方法时，必然修改了数组，所以这个时候需要将该数组的所有依赖(观察者)全部拿出来执行，即：`ob.dep.notify()`。

注意上面的讲解中我们省略了中间部分，那么这部分代码的作用是什么呢？如下：

```js
def(arrayMethods, method, function mutator (...args) {
  // 省略...
  let inserted
  switch (method) {
    case 'push':
    case 'unshift':
      inserted = args
      break
    case 'splice':
      inserted = args.slice(2)
      break
  }
  if (inserted) ob.observeArray(inserted)
  // 省略...
})
```

首先我们需要思考一下数组变异方法对数组的影响是什么？无非是 **增加元素**、**删除元素** 以及 **变更元素顺序**。有的同学可能会说还有 **替换元素**，实际上替换可以理解为删除和增加的复合操作。那么在这些变更中，我们需要重点关注的是 **增加元素** 的操作，即 `push`、`unshift` 和 `splice`，这三个变异方法都可以为数组添加新的元素，那么为什么要重点关注呢？原因很简单，因为新增加的元素是非响应式的，所以我们需要获取到这些新元素，并将其变为响应式数据才行，而这就是上面代码的目的。下面我们看一下具体实现，首先定义了 `inserted` 变量，这个变量用来保存那些被新添加进来的数组元素：`let inserted`。接着是一个 `switch` 语句，在 `switch` 语句中，当遇到 `push` 和 `unshift` 操作时，那么新增的元素实际上就是传递给这两个方法的参数，所以可以直接将 `inserted` 的值设置为 `args`：`inserted = args`。当遇到 `splice` 操作时，我们知道 `splice` 函数从第三个参数开始到最后一个参数都是数组的新增元素，所以直接使用 `args.slice(2)` 作为 `inserted` 的值即可。最后 `inserted` 变量中所保存的就是新增的数组元素，我们只需要调用 `observeArray` 函数对其进行观测即可：

```js
if (inserted) ob.observeArray(inserted)
```

以上是在当前环境支持 `__proto__` 属性的情况，如果不支持则 `augment` 的值为 `copyAugment` 函数，`copyAugment` 定义在 `protoAugment` 函数的下方：

```js
/**
 * Augment an target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}
```

`copyAugment` 函数接收的参数与 `protoAugment` 函数相同，不同的是 `copyAugment` 使用到了全部三个参数。在拦截数组变异方法的思路一节中我们讲解了在当前环境不支持 `__proto__` 属性的时候如何做兼容处理，实际上这就是 `copyAugment` 函数的作用。

我们知道 `copyAugment` 函数的第三个参数 `keys` 就是定义在 `arrayMethods` 对象上的所有函数的键，即所有要拦截的数组变异方法的名称。这样通过 `for` 循环对其进行遍历，并使用 `def` 函数在数组实例上定义与数组变异方法同名的且不可枚举的函数，这样就实现了拦截操作。

总之无论是 `protoAugment` 函数还是 `copyAugment` 函数，他们的目的只有一个：**把数组实例与代理原型或与代理原型中定义的函数联系起来，从而拦截数组变异方法**。下面我们再回到 `Observer` 类的 `constructor` 函数中，看如下代码：

```js
if (Array.isArray(value)) {
  const augment = hasProto
    ? protoAugment
    : copyAugment
  augment(value, arrayMethods, arrayKeys)
  this.observeArray(value)
} else {
  // 省略...
}
```

可以发现在 `augment` 函数调用语句之后，还以该数组实例作为参数调用了 `Observer` 实例对象的 `observeArray` 方法：

```js
this.observeArray(value)
```

这句话的作用是什么呢？或者说 `observeArray` 方法的作用是什么呢？我们知道，当被观测的数据(`value`)是数组时，会执行 `if` 语句块的代码，并调用 `augment` 函数从而拦截数组的变异方法，这样当我们尝试通过这些变异方法修改数组时是会触发相应的依赖(`观察者`)的，比如下面的代码：

```js
const ins = new Vue({
  data: {
    arr: [1, 2]
  }
})

ins.arr.push(3) // 能够触发响应
```

但是如果数组中嵌套了其他的数组或对象，那么嵌套的数组或对象却不是响应的：

```js
const ins = new Vue({
  data: {
    arr: [
      [1, 2]
    ]
  }
})

ins.arr.push(1) // 能够触发响应
ins.arr[0].push(3) // 不能触发响应
```

上面的代码中，直接调用 `arr` 数组的 `push` 方法是能够触发响应的，但调用 `arr` 数组内嵌套数组的 `push` 方法是不能触发响应的。为了使嵌套的数组或对象同样是响应式数据，我们需要递归的观测那些类型为数组或对象的数组元素，而这就是 `observeArray` 方法的作用，如下是 `observeArray` 方法的全部代码：

```js
/**
  * Observe a list of Array items.
  */
observeArray (items: Array<any>) {
  for (let i = 0, l = items.length; i < l; i++) {
    observe(items[i])
  }
}
```

可以发现 `observeArray` 方法的实现很简单，只需要对数组进行遍历，并对数组元素逐个应用 `observe` 工厂函数即可，这样就会递归观测数组元素了。

### 数组的特殊性

本小节我们补讲 `defineReactive` 函数中的一段代码，如下：

```js {7-9}
get: function reactiveGetter () {
  const value = getter ? getter.call(obj) : val
  if (Dep.target) {
    dep.depend()
    if (childOb) {
      childOb.dep.depend()
      if (Array.isArray(value)) {
        dependArray(value)
      }
    }
  }
  return value
}
```

在 [get 函数中如何收集依赖](#在-get-函数中如何收集依赖) 一节中我们已经讲解了关于依赖收集的内容，但是当时我们留下了如上代码段中高亮的那三行代码没有讲，现在我们就重点看一下高亮的三句代码，为什么当被读取的属性是数组的时候需要调用 `dependArray` 函数？

为了弄清楚这个问题，假设我们有如下代码：

```js {2，8-10}
<div id="demo">
  {{arr}}
</div>

const ins = new Vue({
  el: '#demo',
  data: {
    arr: [
      { a: 1 }
    ]
  }
})
```

首先我们观察一下数据对象：

```js
{
  arr: [
    { a: 1 }
  ]
}
```

数据对象中的 `arr` 属性是一个数组，并且数组的一个元素是另外一个对象。我们在 [被观测后的数据对象的样子](#被观测后的数据对象的样子) 一节中讲过了，上面的对象在经过观测后将变成如下这个样子：

```js {3-4}
{
  arr: [
    { a: 1, __ob__ /* 我们将该 __ob__ 称为 ob2 */ },
    __ob__ /* 我们将该 __ob__ 称为 ob1 */
  ]
}
```

如上代码的注释所示，为了便于区别和讲解，我们分别称这两个 `__ob__` 属性为 `ob1` 和 `ob2`，然后我们再来观察一下模板：

```js
<div id="demo">
  {{arr}}
</div>
```

在模板里使用了数据 `arr`，这将会触发数据对象的 `arr` 属性的 `get` 函数，我们知道 `arr` 属性的 `get` 函数通过闭包引用了两个用来收集依赖的”筐“，一个是属于 `arr` 属性自身的 `dep` 对象，另一个是 `childOb.dep` 对象，其中 `childOb` 就是 `ob1`。这时依赖会被收集到这两个”筐“中，但大家要注意的是 `ob2.dep` 这个”筐“中，是没有收集到依赖的。有的同学会说：”模板中依赖的数据是 `arr`，并不是 `arr` 数组的第一个对象元素，所以 `ob2` 没有收集到依赖很正常啊“，这是一个错误的想法，因为依赖了数组 `arr` 就等价于依赖了数组内的所有元素，数组内所有元素的改变都可以看做是数组的改变。但由于 `ob2` 没有收集到依赖，所以现在就导致如下代码触发不了响应：

```js
ins.$set(ins.$data.arr[0], 'b', 2)
```

我们使用 `$set` 函数为 `arr` 数组的第一对象元素添加了一个属性 `b`，这是触发不了响应的。为了能够使得这段代码可以触发响应，就必须让 `ob2` 收集到依赖，而这就是 `dependArray` 函数的作用。如下是 `dependArray` 函数的代码：

```js
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
```

当被读取的数据对象的属性值是数组时，会调用 `dependArray` 函数，该函数将通过 `for` 循环遍历数组，并取得数组每一个元素的值，如果该元素的值拥有 `__ob__` 对象和 `__ob__.dep` 对象，那说明该元素也是一个对象或数组，此时只需要手动执行 `__ob__.dep.depend()` 即可达到收集依赖的目的。同时如果发现数组的元素仍然是一个数组，那么需要递归调用 `dependArray` 继续收集依赖。

那么为什么数组需要这样处理，而纯对象不需要呢？那是因为 **数组的索引是非响应式的**。现在我们已经知道了数据响应系统对纯对象和数组的处理方式是不同，对于纯对象只需要逐个将对象的属性重新定义为访问器属性，并且当属性的值同样为纯对象时进行递归定义即可，而对于数组的处理则是通过拦截数组变异方法的方式，也就是说如下代码是触发不了响应的：

```js {7}
const ins = new Vue({
  data: {
    arr: [1, 2]
  }
})

ins.arr[0] = 3  // 不能触发响应
```

上面的代码中我们试图修改 `arr` 数组的第一个元素，但这么做是触发不了响应的，因为对于数组来讲，其索引并不是“访问器属性”。正是因为数组的索引不是”访问器属性“，所以当有观察者依赖数组的某一个元素时是触发不了这个元素的 `get` 函数的，当然也就收集不到依赖。这个时候就是 `dependArray` 函数发挥作用的时候了。

## Vue.set($set) 和 Vue.delete($delete) 的实现

现在我们是时候讲解一下 `Vue.set` 和 `Vue.delete` 函数的实现了，我们知道 `Vue` 数据响应系统的原理的核心是通过 `Object.defineProperty` 函数将数据对象的属性转换为访问器属性，从而使得我们能够拦截到属性的读取和设置，但正如官方文档中介绍的那样，`Vue` 是没有能力拦截到为一个对象(或数组)添加属性(或元素)的，而 `Vue.set` 和 `Vue.delete` 就是为了解决这个问题而诞生的。同时为了方便使用， `Vue` 还在实例对象上定义了 `$set` 和 `$delete` 方法，实际上 `$set` 和 `$delete` 方法仅仅是 `Vue.set` 和 `Vue.delete` 的别名，为了证明这点，我们首先来看看 `$set` 和 `$delete` 的实现，还记得 `$set` 和 `$delete` 方法定义在哪里吗？不记得也没关系，我们可以通过查看附录 [Vue 构造函数整理-原型](../appendix/vue-prototype.md) 找到 `$set` 和 `$delete` 方法的定义位置，我们发现 `$set` 和 `$delete` 定义在 `src/core/instance/state.js` 文件的 `stateMixin` 函数中，如下代码：

```js {4-5}
export function stateMixin (Vue: Class<Component>) {
  // 省略...

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    // 省略...
  }
}
```

可以看到 `$set` 和 `$delete` 的值分别是是 `set` 和 `del`，根据文件头部的引用关系可知 `set` 和 `del` 来自 `src/core/observer/index.js` 文件中定义的 `set` 函数和 `del` 函数。

接着我们再来看看 `Vue.set` 和 `Vue.delete` 函数的定义，如果你同样不记得这两个函数时在哪里定义的也没关系，可以查看附录 [Vue 构造函数整理-全局API](../appendix/vue-global-api.md)，我们发现这两个函数是在 `initGlobalAPI` 函数中定义的，打开 `src/core/global-api/index.js` 文件，找到 `initGlobalAPI` 函数如下：

```js {4,5}
export function initGlobalAPI (Vue: GlobalAPI) {
  // 省略...

  Vue.set = set
  Vue.delete = del
  
  // 省略...
}
```

可以发现 `Vue.set` 函数和 `Vue.delete` 函数的值同样是来自 `src/core/observer/index.js` 文件中定义的 `set` 函数和 `del` 函数。现在我们可以坚信 `Vue.set` 其实就是 `$set`，而 `Vue.delete` 就是 `$delete`，所以现在我们只需要搞清楚定义在 `src/core/observer/index.js` 文件中的 `set` 函数和 `del` 函数是如何实现的就可以了。

### Vue.set/$set

首先我们来看一下 `Vue.set/$set` 函数，打开 `src/core/observer/index.js` 文件，找到 `set` 函数，它定义在 `defineReactive` 函数的下面，如下是 `set` 函数的定义：

```js
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 省略...
}
```

`set` 函数接收三个参数，相信很多同学都有使用过 `Vue.set/$set` 函数的经验，那么大家对这三个参数应该不陌生。第一个参数 `target` 是将要被添加属性的对象，第二个参数 `key` 以及第三个参数 `val` 分别是要添加属性的键名和值。

下面我们一点点来看 `set` 函数的代码，首先是一个 `if` 语句块：

```js
if (process.env.NODE_ENV !== 'production' &&
  (isUndef(target) || isPrimitive(target))
) {
  warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
}
```

该 `if` 语句块的判断条件中包含两个函数，分别是 `isUndef` 和 `isPrimitive`，可以在附录 [shared/util.js 文件工具方法全解](../appendix/shared-util.md) 中找到关于这两个函数的讲解。`isUndef` 函数用来判断一个值是否是 `undefined` 或 `null`，如果是则返回 `true`，`isPrimitive` 函数用来判断一个值是否是原始类型值，如果是则返回 `true`。所以如上代码 `if` 语句块的作用是：**如果 `set` 函数的第一个参数是 `undefined` 或 `null` 或者是原始类型值，那么在非生产环境下会打印警告信息**。这么做是合理的，因为理论上只能为对象(或数组)添加属性(或元素)。

紧接着又是一段 `if` 语句块，如下：

```js {1}
if (Array.isArray(target) && isValidArrayIndex(key)) {
  target.length = Math.max(target.length, key)
  target.splice(key, 1, val)
  return val
}
```

这段代码对 `target` 和 `key` 这两个参数做了校验，如果 `target` 是一个数组，并且 `key` 是一个有效的数组索引，那么就会执行 `if` 语句块的内容。在校验 `key` 是否是有效的数组索引时使用了 `isValidArrayIndex` 函数，可以在附录 [shared/util.js 文件工具方法全解](../appendix/shared-util.md) 中查看详细讲解。也就是说当我们尝试使用 `Vue.set/$set` 为数组设置某个元素值的时候就会执行 `if` 语句块的内容，如下例子：

```js {3,7}
const ins = new Vue({
  data: {
    arr: [1, 2]
  }
})

ins.$data.arr[0] = 3 // 不能触发响应
ins.$set(ins.$data.arr, 0, 3) // 能够触发响应
```

上面的代码中我们直接修改 `arr[0]` 的值是不能够触发响应的，但是如果我们使用 `$set` 函数重新设置 `arr` 数组索引为 `0` 的元素的值，这样是能够触发响应的，我们看看 `$set` 函数是如何实现的，注意如下高亮代码：

```js {2-4}
if (Array.isArray(target) && isValidArrayIndex(key)) {
  target.length = Math.max(target.length, key)
  target.splice(key, 1, val)
  return val
}
```

原理其实很简单，我们知道数组的 `splice` 变异方法能够完成数组元素的删除、添加、替换等操作。而 `target.splice(key, 1, val)` 就利用了替换元素的能力，将指定位置元素的值替换为新值，同时由于 `splice` 方法本身是能够触发响应的，所以一切看起来如此简单。

另外大家注意在调用 `target.splice` 函数之前，需要修改数组的长度：

```js
target.length = Math.max(target.length, key)
```

将数组的长度修改为 `target.length` 和 `key` 中的较大者，否则如果当要设置的元素的索引大于数组长度时 `splice` 无效。

再往下依然是一个 `if` 语句块，如下：

```js
if (key in target && !(key in Object.prototype)) {
  target[key] = val
  return val
}
```

如果 `target` 不是一个数组，那么必然就是纯对象了，当给一个纯对象设置属性的时候，假设该属性已经在对象上有定义了，那么只需要直接设置该属性的值即可，这将自动触发响应，因为已存在的属性是响应式的。但这里要注意的是 `if` 语句的两个条件：

* `key in target`
* `!(key in Object.prototype)`

这两个条件保证了 `key` 在 `target` 对象上，或在 `target` 的原型链上，同时必须不能在 `Object.prototype` 上。这里我们需要提一点，上面这段代码为什么不像如下代码这样做：

```js
if (hasOwn(target, key)) {
  target[key] = val
  return val
}
```

使用 `hasOwn` 检测 `key` 是不是属于 `target` 自身的属性不就好了？其实原本代码的确是这样写的，后来因为一个 `issue` 代码变成了现在这个样子，可以 [点击这里查看 issue](https://github.com/vuejs/vue/issues/6845)。

我们继续看代码，接下来是这样一段代码，这是 `set` 函数剩余的全部代码，如下：

```js {1,13-14}
const ob = (target: any).__ob__
if (target._isVue || (ob && ob.vmCount)) {
  process.env.NODE_ENV !== 'production' && warn(
    'Avoid adding reactive properties to a Vue instance or its root $data ' +
    'at runtime - declare it upfront in the data option.'
  )
  return val
}
if (!ob) {
  target[key] = val
  return val
}
defineReactive(ob.value, key, val)
ob.dep.notify()
return val
```

如果代码运行到了这里，那说明正在给对象添加一个全新的属性，注意上面代码中高亮的三句代码，第一句高亮的代码定义了 `ob` 常量，它是数据对象 `__ob__` 属性的引用。第二句高亮的代码使用 `defineReactive` 函数设置属性值，这是为了保证新添加的属性是响应式的。第三句高亮的代码调用了 `__ob__.dep.notify()` 从而触发响应。这就是添加全新属性触发响应的原理。

再看如下代码中高亮的部分：

```js {9-12}
const ob = (target: any).__ob__
if (target._isVue || (ob && ob.vmCount)) {
  process.env.NODE_ENV !== 'production' && warn(
    'Avoid adding reactive properties to a Vue instance or its root $data ' +
    'at runtime - declare it upfront in the data option.'
  )
  return val
}
if (!ob) {
  target[key] = val
  return val
}
defineReactive(ob.value, key, val)
ob.dep.notify()
return val
```

高亮的部分是一个 `if` 语句块，我们知道 `target` 也许原本就是非响应的，这个时候 `target.__ob__` 是不存在的，所以当发现 `target.__ob__` 不存在时，就简单的赋值即可。

最后我们来看一下剩下的这段 `if` 语句块：

```js
const ob = (target: any).__ob__
if (target._isVue || (ob && ob.vmCount)) {
  process.env.NODE_ENV !== 'production' && warn(
    'Avoid adding reactive properties to a Vue instance or its root $data ' +
    'at runtime - declare it upfront in the data option.'
  )
  return val
}
```

这个 `if` 语句块有两个条件，只要有一个条件成立，就会执行 `if` 语句块内的代码。我们来看第一个条件 `target._isVue`，我们知道 `Vue` 实例对象拥有 `_isVue` 属性，所以当第一个条件成立时，那么说明你正在使用 `Vue.set/$set` 函数为 `Vue` 实例对象添加属性，为了避免属性覆盖的情况出现，`Vue.set/$set` 函数不允许这么做，在非生产环境下会打印警告信息。

第二个条件是：`(ob && ob.vmCount)`，我们知道 `ob` 就是 `target.__ob__` 那么 `ob.vmCount` 是什么呢？为了搞清这个问题，我们回到 `observe` 工厂函数中，如下高亮代码：

```js {3-5}
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 省略...
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}
```

`observe` 函数接收两个参数，第二个参数指示着被观测的数据对象是否是根数据对象，什么叫根数据对象呢？那就看 `asRootData` 什么时候为 `true` 即可，我们找到 `initData` 函数中，他在 `src/core/instance/state.js` 文件中，如下：

```js {10}
function initData (vm: Component) {
  let data = vm.$options.data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  
  // 省略...

  // observe data
  observe(data, true /* asRootData */)
}
```

可以看到在调用 `observe` 观测 `data` 对象的时候 `asRootData` 参数为 `true`。而在后续的递归观测中调用 `observe` 的时候省略了 `asRootData` 参数。所以所谓的根数据对象就是 `data` 对象。这时候我们再来看如下代码：

```js {3-5}
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 省略...
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}
```

可以发现，根数据对象将拥有一个特质，即 `target.__ob__.vmCount > 0`，这样条件 `(ob && ob.vmCount)` 是成立的，也就是说：**当使用 `Vue.set/$set` 函数为根数据对象添加属性时，是不被允许的**。

那么为什么不允许在根数据对象上添加属性呢？因为这样做是永远触发不了依赖的。原因就是根数据对象的 `Observer` 实例收集不到依赖(观察者)，如下：

```js {4,6}
const data = {
  obj: {
    a: 1
    __ob__ // ob2
  },
  __ob__ // ob1
}
new Vue({
  data
})
```

如上代码所示，`ob1` 就是属于根数据的 `Observer` 实例对象，如果想要在根数据上使用 `Vue.set/$set` 并触发响应：

```js
Vue.set(data, 'someProperty', 'someVal')
```

那么 `data` 字段必须是响应式数据才行，这样当 `data` 字段被依赖时，才能够收集依赖(观察者)到两个“筐”中(`data属性自身的 dep`以及`data.__ob__`)。这样在 `Vue.set/$set` 函数中才有机会触发根数据的响应。但 `data` 本身并不是响应的，这就是问题所在。

### Vue.delete/$delete

接下来我们继续看一下 `Vue.delete/$delete` 函数的实现，仍然是 `src/core/observer/index.js` 文件，找到 `del` 函数：

```js
export function del (target: Array<any> | Object, key: any) {
  // 省略...
}
```

`del` 函数接收两个参数，分别是将要被删除属性的目标对象 `target` 以及要删除属性的键名 `key`，与 `set` 函数相同，在函数体的开头是如下 `if` 语句块：

```js
if (process.env.NODE_ENV !== 'production' &&
  (isUndef(target) || isPrimitive(target))
) {
  warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
}
```

检测 `target` 是否是 `undefined` 或 `null` 或者是原始类型值，如果是的话那么在非生产环境下会打印警告信息。

接着是如下这段 `if` 语句块：

```js
if (Array.isArray(target) && isValidArrayIndex(key)) {
  target.splice(key, 1)
  return
}
```

很显然，如果我们使用 `Vue.delete/$delete` 去删除一个数组的索引，如上这段代码将被执行，当然了前提是参数 `key` 需要是一个有效的数组索引。与为数组添加元素类似，移除数组元素同样使用了数组的 `splice` 方法，大家知道这样是能够触发响应的。

再往下是如下这段 `if` 语句块：

```js
const ob = (target: any).__ob__
if (target._isVue || (ob && ob.vmCount)) {
  process.env.NODE_ENV !== 'production' && warn(
    'Avoid deleting properties on a Vue instance or its root $data ' +
    '- just set it to null.'
  )
  return
}
```

与不能使用 `Vue.set/$set` 函数为根数据或 `Vue` 实例对象添加属性一样，同样不能使用 `Vue.delete/$delete` 删除 `Vue` 实例对象或根数据的属性。不允许删除 `Vue` 实例对象的属性，是出于安全因素的考虑。而不允许删除根数据对象的属性，是因为这样做也是触发不了响应的，关于触发不了响应的原因，我们在讲解 `Vue.set/$set` 时已经分析过了。

接下来是 `Vue.delete/$delete` 函数的最后一段代码，如下：

```js
if (!hasOwn(target, key)) {
  return
}
delete target[key]
if (!ob) {
  return
}
ob.dep.notify()
```

首先使用 `hasOwn` 函数检测 `key` 是否是 `target` 对象自身拥有的属性，如果不是那么直接返回(`return`)。很好理解，如果你将要删除的属性原本就不在该对象上，那么自然什么都不需要做。

如果 `key` 存在于 `target` 对象上，那么代码将继续运行，此时将使用 `delete` 语句从 `target` 上删除属性 `key`。最后判断 `ob` 对象是否存在，如果不存在说明 `target` 对象原本就不是响应的，所以直接返回(`return`)即可。如果 `ob` 对象存在，说明 `target` 对象是响应的，需要触发响应才行，即执行 `ob.dep.notify()`。
