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

首先判断 `opts.data` 是否存在，即 `data` 选项是否存在，如果存在则调用 `initData(vm)` 函数初始化 `data` 选项，否则通过 `observe` 函数观测一个空的对象，并且 `vm._data` 引用了该空对象。其中 `observe` 函数是将 `data` 转换成响应式数据的核心入口，另外实例对象上的 `_data` 属性我们在前面的章节中讲解 `$data` 属性的时候讲到过，`$data` 属性是一个访问器属性，其代理的值就是 `_data`。

下面我们就从 `initData(vm)` 开始开启数据响应系统的探索之旅。

#### 实例对象代理访问数据 data

我们找到 `initData` 函数，该函数与 `initState` 函数定义在同一个文件中，即 `core/instance/state.js` 文件，`initData` 函数的一开始是这样一段代码：

```js
let data = vm.$options.data
data = vm._data = typeof data === 'function'
  ? getData(data, vm)
  : data || {}
```

首先定义 `data` 变量，它是 `vm.$options.data` 的引用。在 [5Vue选项的合并](/note/5Vue选项的合并) 一节中我们知道 `vm.$options.data` 其实最终被处理成了一个函数，且该函数的执行结果才是真正的数据。在上面的代码中我们发现其中依然存在一个使用 `typeof` 语句判断 `data` 数据类型的操作，实际上这个判断是完全没有必要的，原因是当 `data` 选项存在的时候，那么经过 `mergeOptions` 函数处理后，`data` 选项必然是一个函数，只有当 `data` 选项不存在的时候它的值是 `undefined`，而在 `initState` 函数中如果 `opts.data` 不存在则根本不会执行 `initData` 函数，所以既然执行了 `initData` 函数那么 `vm.$options.data` 必然是一个函数，所以这里的判断是没有必要的。所以可以直接写成：

```js
data = vm._data = getData(data, vm)
```

关于这个问题，我提交了一个 `PR`，详情可以查看这里：[https://github.com/vuejs/vue/pull/7875](https://github.com/vuejs/vue/pull/7875)

回到上面那句代码，这句话的调用了 `getData` 函数，`getData` 函数就定义在 `initData` 函数的下面，我们看看其作用是什么：

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

上面的代码中首先使用 `Object.keys` 函数获取 `data` 对象的所有键，并将由 `data` 对象的键所组成的数组赋值给 `keys` 常量。接着分别用 `props` 常量和 `methods` 常量引用 `vm.$options.props` 和 `vm.$options.methods`。然后开启一个 `while` 循环，该循环的用来遍历 `keys` 数组，那么遍历 `keys` 数组的目的是什么呢？我们来看循环体内的第一段 `if` 语句：

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

最后经过一系列的处理，`initData` 函数来到了最后一句代码：

```js
// observe data
observe(data, true /* asRootData */)
```

调用 `observe` 函数将 `data` 数据对象转换成响应式的，可以说这句代码才是响应系统的开始，不过在我们讲解 `observe` 函数之前我们有必要总结一下 `initData` 函数所做的事情，通过前面分析 `initData` 函数主要完成如下工作：

* 根据 `vm.$options.data` 选项获取真正想要的数据（注意：此时 `vm.$options.data` 是函数）
* 校验得到的数据是否是一个纯对象
* 检查数据对象 `data` 上的键是否与 `props` 冲突
* 检查 `methods` 对象上的键是否与 `data` 上的键冲突
* 在 `Vue` 实例对象上添加代理访问数据对象的同名属性
* 最后调用 `observe` 函数开启响应式之路

#### 数据响应系统的基本思路

接下来我们将重点讲解数据响应系统的实现，在具体到源码之前我们有必要了解一下数据响应系统实现的基本思路，这有助于我们更好的理解源码的目的，毕竟每一行代码都有它存在的意义。

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

要实现这个功能，说复杂也复杂说简单也简单，复杂在于我们需要考虑的内容比较多，比如如何避免收集重复的依赖，如何深度观测，如何处理数组以及其他边界条件等等。简单在于如果不考虑那么多边界条件的话，要实现这样一个功能还是很容易的，这一小节我们就从简入手，致力于让大家思路清晰，至于各种复杂情况的处理我们会在真正讲解源码的部分会依依为大家解答。

要实现上文的功能，我们面临的第一个问题是，如何才能知道属性被修改了(或被设置了)。这时候我们就要依赖 `Object.defineProperty` 函数，通过该函数将对象的属性转换为访问器属性，为属性设置一对 `getter/setter` 从而得知属性被读取和被设置，如下：

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

这样我们就实现了对属性 `a` 的设置和获取操作的拦截，有了它我们就可以大胆的思考一些事情，比如：**能不能在获取属性 `a` 的时候收集依赖，然后在设置属性 `a` 的时候触发之前收集的依赖呢？**嗯，这是一个好思路，不过既然要收集依赖，我们起码需要一个”筐“，然后将所有收集到的依赖通通放到这个”筐”里，当属性被设置的时候将“筐”里所有的依赖都拿出来执行，落实的代码如下：

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

但是新的问题出现了：**如何在获取属性 `a` 的值时收集依赖呢？**为了解决这个问题我们需要思考一下我们现在都掌握哪些条件，这个时候我们就需要在 `$watch` 函数中做文章了，我们知道 `$watch` 函数接收两个参数，第一个参数是一个字符串，即数据字段名,比如 `'a'`，第二个参数是依赖该字段的函数：

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
  // 读取字段值，触发 set 函数
  data[exp]
}
```

上面的代码中，首先我们定义了全局变量 `Target`，然后在 `$watch` 中将 `Target` 的值设置为 `fn` 也就是依赖，接着读取字段的值 `data[exp]` 从而触发 `set` 函数，在 `set` 函数中，由于此时 `Target` 变量就是我们要收集的依赖，所以将 `Target` 添加到 `dep` 数组。现在我们添加如下测试代码：

```js
$watch('a', () => {
  console.log('第一个依赖')
})
$watch('a', () => {
  console.log('第二个依赖')
})
```

此时当你尝试设置 `data.a = 3` 时，在控制台将分别打印字符串 `'第一个依赖'` 和 `'第二个依赖'`。我们仅仅用十几行代码就实现了这样一个最进本的功能，但其实现在的实现存在很多缺陷，比如目前的代码仅仅能够实现对字段 `a` 的观测，如果添加一个字段 `b` 呢？所以最起码我们应该使用一个循环将定义访问器属性的代码包裹起来，如下：

```js
const data = {
  a: 1,
  b: 1
}

for (let key in data) {
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

只需要在使用 `Object.defineProperty` 函数定义属性之前缓存一下原来的值即 `val`，然后在 `get` 函数中将 `val` 返回即可，除此之外还要记得在 `set` 函数中使用新值(`newVal`)重写旧值(`val`)。

但这样就完美了吗？当然没有，这距离完美可以说还相差十万八千里，比如当数据 `data` 是嵌套的对象时，我们的程序只能检测到第一层对象的属性，比如数据对象如下：

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
  // 读取字段值，触发 set 函数
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

我们对 `$watch` 函数做了一些改造，首先检查要读取的字段是否包含 `.`，如果包含 `.` 说明读取嵌套对象的字段，这时候我们使用字符串的 `split('.')` 函数将字符串转为数组，所以如果访问的路径是 `a.b` 那么转换后的数组就是 `['a', 'b']`，然后使用一个循环从而读取到嵌套对象的属性值，不过需要注意的是读取到嵌套对象的属性值之后应该立即返回 `return`，不需要再执行后面的代码。

下面我们再进一步，我们思考一下 `$watch` 函数的原理的是什么？其实 `$watch` 函数所做的事情就是想方设法的访问到你要观测的字段，从而触发该字段的 `get` 函数，进而收集观察者(依赖)。现在我们传递给 `$watch` 函数的第一个参数是一个字符串，代表要访问数据的哪一个字段属性，那么除了字符串之外可以不可以是一个函数呢？假设我们有一个函数叫做 `render`，如下

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

第二个参数依然是 `render` 函数，也就是说当依赖发生变化时，会重新执行 `render` 函数，这样我们就实现了数据变化，并将变化自动应用到 `DOM`。其实这大概就是 `Vue` 的原理，但我们做的还远远不够，比如上面这句代码，第一个参数中 `render` 函数的执行使得我们能够收集依赖，当依赖变化时会重新执行第二个参数中的 `render` 函数，但不要忘了这又会触发一次数据字段的 `get` 拦截器，所以此时已经收集了两遍依赖，那么我们是不是要想办法避免收集冗余的依赖呢？除此之外我么也没有对数组做处理，我们将这些问题留到后面，看看在 `Vue` 中它是如何处理的。

现在我们这个不严谨的实现暂时就到这里，意图在于让大家明白数据响应系统的整体思路，为接下来真正进入 `Vue` 源码做必要的铺垫。

#### observe 工厂函数

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

用来判断如果要观测的数据不是一个对象或者是 `VNode` 实例，则直接返回(`return`)。接着定义变量 `ob`，该变量用来保存 `Observer` 实例，可以发现 `observe` 函数的返回值就是 `ob`。紧接着又是一个 `if...else` 分支：

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

`isServerRendering()` 函数的返回值是一个布尔值，用来判断是否是服务端渲染。也就是说只有当不是服务端渲染的时候才会观测数据。这里我们留下一个疑问：为什么服务端渲染时不对数据进行观测？对于这个问题后面我们会讲到。

* 第三个条件是 `(Array.isArray(value) || isPlainObject(value))` 必须为真

这个条件很好理解，只有当数据对象是数组或纯对象的时候，才有必要对其进行观测。

* 第四个条件是 `Object.isExtensible(value)` 必须为真

也就是说要被观测的数据对象必须是**可扩展的**。一个普通的对象默认就是可扩展的，一下三个方法都可以使得一个对象变得不可扩展：`Object.preventExtensions()`、`Object.freeze()` 以及 `Object.seal()`。

* 第五个条件是 `!value._isVue` 必须为真

我们知道 `Vue` 实例对象拥有 `_isVue` 属性，所以这个条件用来避免 `Vue` 实例对象被观测。

当一个对象满足了以上五个条件时，就会执行 `else...if` 语句块的代码，即创建一个 `Observer` 实例：

```js
ob = new Observer(value)
```

#### Observer 构造函数

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

##### 数据对象的 `__ob__` 属性

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

那么这里的 `Dep` 是什么呢？就像我们在了解数据响应系统基本思路中所讲到的，它就是一个收集依赖的“筐”。但这个“筐”并不属于某一个字段，后面我们会发现，这个框是属于某一个对象或数组的。

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

##### 响应式数据之纯对象的处理

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

该判断用来区分数据对象到底是数组还是一个纯对象的，因为对于数组和纯对象的处理方式是不同的，为了更好理解我们先看数据对象是一个纯对象的情况，这个时候代码会走 `else` 分支，即执行 `this.walk(value)` 函数，我们知道这个函数实例对象方法，找到这个方法：

```js
walk (obj: Object) {
  const keys = Object.keys(obj)
  for (let i = 0; i < keys.length; i++) {
    defineReactive(obj, keys[i])
  }
}
```

`walk` 方法很简单，首先使用 `Object.keys(obj)` 获取对象属性所有可枚举的属性，然后使用 `for` 循环遍历这些属性，同时为每个属性调用了 `defineReactive` 函数。

###### defineReactive 函数

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
    },
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
  })
}
```

`defineReactive` 函数的核心就是将**数据对象的数据属性转换为访问器属性**，即为数据对象的属性设置一对 `getter/setter`，但其中做了很多处理边界条件的工作。`defineReactive` 接收五个参数，但是在 `walk` 方法中调用 `defineReactive` 函数时只传递了前两个参数，即数据对象和属性的键名。我们看一下 `defineReactive` 的函数体，首先定义了 `dep` 常量，它是一个 `Dep` 实例对象：

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

如上面的代码中注释所写的那样，在访问器属性的 `getter/setter` 中，通过闭包引用了前面定义的“筐”，即 `dep` 常量。这里大家要明确一件事情，即**每一个数据字段都通过闭包引用着属于自己的 `dep` 常量**。因为在 `walk` 函数中通过循环遍历了所有数据对象的属性，并调用 `defineReactive` 函数，所以每次调用 `defineReactive` 定义访问器属性时，该属性的 `setter/getter` 都闭包引用了一个属于自己的“筐”。假设我们有如下数据字段：

```js
const data = {
  a: 1,
  b: 2
}
```

那么字段 `data.a` 和 `data.b` 都将通过闭包引用了属于自己的 `Dep` 实例对象，如下图所示：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-04-05-032455.jpg)

每个字段的 `Dep` 对象都被用来收集那些属于对应字段的依赖。

在定义 `dep` 常量之后，是这样一段代码：

```js
const property = Object.getOwnPropertyDescriptor(obj, key)
if (property && property.configurable === false) {
  return
}
```

首先通过 `Object.getOwnPropertyDescriptor` 函数获取该字段可能已有的属性描述对象，并将该对象保存在 `property` 常量中，接着是一个 `if` 语句块，判断该字段是否是可配置的，如果不可配置(`property.configurable === false`)，那么直接返回(`return`)，即不会继续执行 `defineReactive` 函数。这么做也是合理的，因为一个不可配置的属性是不能使用也没必要使用 `Object.defineProperty` 改变其属性定义的。

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

这段代码的前两句定义了 `getter` 和 `setter` 常量，分别保存了来自 `property` 对象的 `get` 和 `set` 函数，我们知道 `property` 对象是属性的描述对象，一个对象的属性很可能已经是一个访问器属性了，所以该属性很可能已经存在 `get` 或 `set` 方法。由于接下来会使用 `Object.defineProperty` 函数重新定义属性的 `setter/getter`，这会导致属性原有的 `set` 和 `get` 方法被覆盖，所以要将属性原有的 `setter/getter` 缓存，并在重新定义的 `set` 和 `get` 方法中调用缓存的函数，从而做到不影响属性的原有读取操作。

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

大家要注意一个问题，即使用 `observe(val)` 深度观测数据对象时，这里的 `val` 未必有值，因为必须在满足条件 `(!getter || setter) && arguments.length === 2` 时，才会触发取值的动作：`val = obj[key]`，所以一旦不满足条件即使属性是有值的但是由于没有触发取值的动作，所以 `val` 依然是 `undefined`。这就会导致深度观测无效，因为我们在分析 `observe` 函数的时候知道，只有当数据对象是数组或对象时才会成功被观测。对于这个问题我们后面还会详细的说。

###### 被观测后的数据对象的样子

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

###### 在 get 函数中如何收集依赖

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

首先既然是 `getter`，那么当然要能够正确的返回属性的值，其次我们知道依赖的收集时机就是属性被读取的时候，所以 `get` 函数做了两件事：正确的返回属性值以及收集依赖，我们具体看一下代码，`get` 函数的第一句代码如下：

```js
const value = getter ? getter.call(obj) : val
```

首先判断是否存在 `getter`，我们知道 `getter` 常量中保存的属性原型的 `get` 函数，如果 `getter` 存在那么直接调用该函数，并以该函数的返回值作为属性的值，保证属性的原有读取操作正常运作。如果 `getter` 不存在则使用 `val` 作为属性的值。可以发现 `get` 函数的最后一句将 `value` 常量返回，这样 `get` 函数需要做的第一件事就完成了，即正确的返回属性值。

除了正确的返回属性值，还要收集依赖，而处于 `get` 函数第一行和最后一行代码中间的所有代码都是用来完成收集依赖这件事儿的，下面我们就看一下它是如何收集依赖的，由于我们还没有讲解过 `Dep` 这个类，所以现在大家可以简单的认为 `dep.depend()` 这句代码的执行就意味着依赖被收集了。接下来我们仔细看一下代码：

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

首先判断 `Dep.target` 是否存在，那么 `Dep.target` 是什么呢？其实 `Dep.target` 与我们在数据响应系统基本思路一节中所讲的 `Target` 作用相同，所以 `Dep.target` 中保存的值就是要被收集的依赖(函数)。所以如果 `Dep.target` 存在的话说明有依赖需要被收集，这个时候才需要执行 `if` 语句块内的代码，如果 `Dep.target` 不存在就意味着没有需要被收集的依赖，所以当然就不需要执行 `if` 语句块内的代码了。

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

对于属性 `a` 来讲，访问器属性 `a` 的 `setter/getter` 通过闭包引用了一个 `Dep` 实例对象，即属性 `a` 用来收集依赖的“筐”。除此之外访问器属性 `a` 的 `setter/getter` 还闭包引用着 `childOb`，且 `childOb === data.a.__ob__` 所以 `childOb.dep === data.a.__ob__.dep`。所以 `childOb.dep.depend()` 这句话的执行就说明，除了要将依赖收集到属性 `a` 自己的“筐”里之外，还要将同样的依赖收集到 `data.a.__ob__.dep` 这里”筐“里，为什么要将同样的依赖分别收集到这两个不同的”筐“里呢？其实答案就在于这两个”筐“里收集的依赖的触发时机是不同的，即作用不同，两个”筐“如下：

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

###### 在 set 函数中如何触发依赖




























