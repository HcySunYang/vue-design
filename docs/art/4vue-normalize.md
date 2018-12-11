# Vue 选项的规范化

<p class="tip">注意：本节讨论依旧沿用前文的例子</p>

## 弄清楚传递给 mergeOptions 函数的三个参数

这一小节我们继续前面的讨论，看一看 `mergeOptions` 都做了些什么。根据 `core/instance/init.js` 顶部的引用关系可知，`mergeOptions` 函数来自于 `core/util/options.js` 文件，事实上不仅仅是 `mergeOptions` 函数，整个文件所做的一切都为了一件事：选项的合并。

不过在我们深入 `core/util/options.js` 文件之前，我们有必要搞清楚一件事，就是如下代码中：

```js
vm.$options = mergeOptions(
    resolveConstructorOptions(vm.constructor),
    options || {},
    vm
)
```

传递给 `mergeOptions` 函数的三个参数到底是什么。

其中第一个参数是通过调用一个函数得到的，这个函数叫做 `resolveConstructorOptions`，并将 `vm.constructor` 作为参数传递进去。第二个参数 `options` 就是我们调用 `Vue` 构造函数时透传进来的对象，第三个参数是当前 `Vue` 实例，现在我们逐一去看。

`resolveConstructorOptions` 是一个函数，这个函数就声明在 `core/instance/init.js` 文件中，如下：

```js
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}
```

在具体去看代码之前，大家能否通过这个函数的名字猜一猜这个函数的作用呢？其名字是 `resolve Constructor Options` 那么这个函数是不是用来 *解析构造者的 `options`* 的呢？答案是：对，就是干这个的。接下来我们就具体看一下它是怎么做的，首先第一句：

```js
let options = Ctor.options
```

其中 `Ctor` 即传递进来的参数 `vm.constructor`，在我们的例子中他就是 `Vue` 构造函数，可能有的同学会问：难道它还有不是 `Vue` 构造函数的时候吗？当然，当你使用 `Vue.extend` 创造一个子类并使用子类创造实例时，那么 `vm.constructor` 就不是 `Vue` 构造函数，而是子类，比如：

```js
const Sub = Vue.extend()
const s = new Sub()
```

那么 `s.constructor` 自然就是 `Sub` 而非 `Vue`，大家知道这一点即可，但在我们的例子中，这里的 `Ctor` 就是 `Vue` 构造函数，而有关于 `Vue.extend` 的东西，我们后面会专门讨论的。

所以，`Ctor.options` 就是 `Vue.options`，然后我们再看 `resolveConstructorOptions` 的返回值是什么？如下：

```js
return options
```

也就是把 `Vue.options` 返回回去了，所以这个函数的确就像他的名字那样，是用来获取构造者的 `options` 的。不过同学们可能注意到了，`resolveConstructorOptions` 函数的第一句和最后一句代码中间还有一坨包裹在 `if` 语句块中的代码，那么这坨代码是干什么的呢？

我可以很明确地告诉大家，这里水稍微有那么点深，比如 `if` 语句的判断条件 `Ctor.super`，`super` 这是子类才有的属性，如下：

```js
const Sub = Vue.extend()
console.log(Sub.super)  // Vue
```

也就是说，`super` 这个属性是与 `Vue.extend` 有关系的，事实也的确如此。除此之外判断分支内的第一句代码：

```js
const superOptions = resolveConstructorOptions(Ctor.super)
```

我们发现，又递归地调用了 `resolveConstructorOptions` 函数，只不过此时的参数是构造者的父类，之后的代码中，还有一些关于父类的 `options` 属性是否被改变过的判断和操作，并且大家注意这句代码：

```js
// check if there are any late-modified/attached options (#4976)
const modifiedOptions = resolveModifiedOptions(Ctor)
```

我们要注意的是注释，有兴趣的同学可以根据注释中括号内的 `issue` 索引去搜一下相关的问题，这句代码是用来解决使用 `vue-hot-reload-api` 或者 `vue-loader` 时产生的一个 `bug` 的。

现在大家知道这里的水有多深了吗？关于这些问题，我们在讲 `Vue.extend` 时都会给大家一一解答，不过有一个因素从来没有变，那就是 `resolveConstructorOptions` 这个函数的作用永远都是用来获取当前实例构造者的 `options` 属性的，即使 `if` 判断分支内也不例外，因为 `if` 分支只不过是处理了 `options`，最终返回的永远都是 `options`。

所以根据我们的例子，`resolveConstructorOptions` 函数目前并不会走 `if` 判断分支，即此时这个函数相当于：

```js
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  return options
}
```

所以，根据我们的例子，此时的 `mergeOptions` 函数的第一个参数就是 `Vue.options`，那么大家还记得 `Vue.options` 长成什么样子吗？不记得也没关系，这就得益于我们整理的 [附录/Vue构造函数整理-全局API](../appendix/vue-global-api.md) 了，通过查看我们可知 `Vue.options` 如下：

```js
Vue.options = {
	components: {
		KeepAlive
		Transition,
    	TransitionGroup
	},
	directives:{
	    model,
        show
	},
	filters: Object.create(null),
	_base: Vue
}
```

接下来，我们再看看第二个参数 `options`，这个参数实际上就是我们调用 `Vue` 构造函数的透传进来的选项，所以根据我们的例子 `options` 的值如下：

```js
{
  el: '#app',
  data: {
    test: 1
  }
}
```

而第三个参数 `vm` 就是 `Vue` 实例对象本身，综上所述，最终如下代码：

```js
vm.$options = mergeOptions(
  resolveConstructorOptions(vm.constructor),
  options || {},
  vm
)
```

相当于：

```js
vm.$options = mergeOptions(
  // resolveConstructorOptions(vm.constructor)
  {
    components: {
      KeepAlive
      Transition,
      TransitionGroup
    },
    directives:{
      model,
      show
    },
    filters: Object.create(null),
    _base: Vue
  },
  // options || {}
  {
    el: '#app',
    data: {
      test: 1
    }
  },
  vm
)
```

现在我们已经搞清楚传递给 `mergeOptions` 函数的三个参数分别是什么了，那么接下来我们就打开 `core/util/options.js` 文件并找到  `mergeOptions` 方法，看一看都发生了什么。

## 检查组件名称是否符合要求

打开 `core/util/options.js` 文件，找到 `mergeOptions` 方法，这个方法上面有一段注释：

```js
/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
```

合并两个选项对象为一个新的对象，这个函数在实例化和继承的时候都有用到，这里要注意两点：第一，这个函数将会产生一个新的对象；第二，这个函数不仅仅在实例化对象(即`_init`方法中)的时候用到，在继承(`Vue.extend`)中也有用到，所以这个函数应该是一个用来合并两个选项对象为一个新对象的通用程序。

所以我们现在就看看它是怎么去合并两个选项对象的，找到 `mergeOptions` 函数，开始的一段代码如下：

```js
if (process.env.NODE_ENV !== 'production') {
  checkComponents(child)
}
```

在非生产环境下，会以 `child` 为参数调用 `checkComponents` 方法，我们看看 `checkComponents` 是做什么的，这个方法同样定义在 `core/util/options.js` 文件中，内容如下：

```js
/**
 * Validate component names
 */
function checkComponents (options: Object) {
  for (const key in options.components) {
    validateComponentName(key)
  }
}
```

由注释可知，这个方法是用来校验组件的名字是否符合要求的，首先 `checkComponents` 方法使用一个 `for in` 循环遍历 `options.components` 选项，将每个子组件的名字作为参数依次传递给 `validateComponentName` 函数，所以 `validateComponentName` 函数才是真正用来校验名字的函数，该函数就定义在 `checkComponents` 函数下方，源码如下：

```js
export function validateComponentName (name: string) {
  if (!/^[a-zA-Z][\w-]*$/.test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'can only contain alphanumeric characters and the hyphen, ' +
      'and must start with a letter.'
    )
  }
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}
```

`validateComponentName` 函数由两个 `if` 语句块组成，所以可想而知，对于组件的名字要满足这两条规则才行，这两条规则就是这两个 `if` 分支的条件语句：

* ①：组件的名字要满足正则表达式：`/^[a-zA-Z][\w-]*$/`
* ②：要满足：条件 `isBuiltInTag(name) || config.isReservedTag(name)` 不成立

对于第一条规则，`Vue` 限定组件的名字由普通的字符和中横线(-)组成，且必须以字母开头。

对于第二条规则，首先将 `options.components` 对象的 `key` 小写化作为组件的名字，然后以组件的名字为参数分别调用两个方法：`isBuiltInTag` 和 `config.isReservedTag`，其中 `isBuiltInTag` 方法的作用是用来检测你所注册的组件是否是内置的标签，这个方法可以在 [shared/util.js 文件工具方法全解](../appendix/shared-util.md) 中查看其实现，于是我们可知：`slot` 和 `component` 这两个名字被 `Vue` 作为内置标签而存在的，你是不能够使用的，比如这样：

```js
new Vue({
  components: {
    'slot': myComponent
  }
})
```

你将会得到一个警告，该警告的内容就是 `checkComponents` 方法中的 `warn` 文案：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-10-03-084701.jpg)

除了检测注册的组件名字是否为内置的标签之外，还会检测是否是保留标签，即通过 `config.isReservedTag` 方法进行检测，大家是否还记得 `config.isReservedTag` 在哪里被赋值的？前面我们讲到过在 `platforms/web/runtime/index.js` 文件中有这样一段代码：

```js
// install platform specific utils
Vue.config.mustUseProp = mustUseProp
Vue.config.isReservedTag = isReservedTag
Vue.config.isReservedAttr = isReservedAttr
Vue.config.getTagNamespace = getTagNamespace
Vue.config.isUnknownElement = isUnknownElement
```

其中：

```js
Vue.config.isReservedTag = isReservedTag
```

就是在给 `config.isReservedTag` 赋值，其值为来自于 `platforms/web/util/element.js` 文件的 `isReservedTag` 函数，大家可以在附录 [platforms/web/util 目录下的工具方法全解](../appendix/web-util.md) 中查看该方法的作用及实现，可知在 `Vue` 中 `html` 标签和部分 `SVG` 标签被认为是保留的。所以这段代码是在保证选项被合并前的合理合法。最后大家注意一点，这些工作是在非生产环境下做的，所以在非生产环境下开发者就能够发现并修正这些问题，所以在生产环境下就不需要再重复做一次校验检测了。

另外要说一点，我们的例子中并没有使用 `components` 选项，但是这里还是给大家顺便介绍了一下。如果按照我们的例子的话，`mergeOptions` 函数中的很多代码都不会执行，但是为了保证让大家理解整个选项合并所做的事情，这里都会有所介绍。

## 允许合并另一个实例构造者的选项

我们继续看代码，接下来的一段代码同样是一个 `if` 语句块：

```js
if (typeof child === 'function') {
  child = child.options
}
```

这说明 `child` 参数除了是普通的选项对象外，还可以是一个函数，如果是函数的话就取该函数的 `options` 静态属性作为新的 `child`，我们想一想什么样的函数具有 `options` 静态属性呢？现在我们知道 `Vue` 构造函数本身就拥有这个属性，其实通过 `Vue.extend` 创造出来的子类也是拥有这个属性的。所以这就允许我们在进行选项合并的时候，去合并一个 `Vue` 实例构造者的选项了。

## 规范化 props（normalizeProps）

接着看代码，接下来是三个用来规范化选项的函数调用：

```js
normalizeProps(child, vm)
normalizeInject(child, vm)
normalizeDirectives(child)
```

这三个函数是用来规范选项的，什么意思呢？以 `props` 为例，我们知道在 `Vue` 中，我们在使用 `props` 的时候有两种写法，一种是使用字符串数组，如下：

```js
const ChildComponent = {
  props: ['someData']
}
```

另外一种是使用对象语法：

```js
const ChildComponent = {
  props: {
    someData: {
      type: Number,
      default: 0
    }
  }
}
```

其实不仅仅是 `props`，在 `Vue` 中拥有多种使用方法的选项有很多，这给开发者提供了非常灵活且便利的选择，但是对于 `Vue` 来讲，这并不是一件好事儿，因为 `Vue` 要对选项进行处理，这个时候好的做法就是，无论开发者使用哪一种写法，在内部都将其规范成同一种方式，这样在选项合并的时候就能够统一处理，这就是上面三个函数的作用。

现在我们就详细看看这三个规范化选项的函数都是怎么规范选项的，首先是 `normalizeProps` 函数，这看上去貌似是用来规范化 `props` 选项的，找到 `normalizeProps` 函数源码如下：

```js
/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props
  if (!props) return
  const res = {}
  let i, val, name
  if (Array.isArray(props)) {
    i = props.length
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        name = camelize(val)
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {
    for (const key in props) {
      val = props[key]
      name = camelize(key)
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  options.props = res
}
```

根据注释我们知道，这个函数最终是将 `props` 规范为对象的形式了，比如如果你的 `props` 是一个字符串数组：

```js
props: ["someData"]
```

那么经过这个函数，`props` 将被规范为：

```js
props: {
  someData:{
    type: null
  }
}
```

如果你的 `props` 是对象如下：

```js
props: {
  someData1: Number,
  someData2: {
    type: String,
    default: ''
  }
}
```

将被规范化为：

```js
props: {
  someData1: {
    type: Number
  },
  someData2: {
    type: String,
    default: ''
  }
}
```

现在我们具体看一下代码，首先是一个判断，如果选项中没有 `props` 选项，则直接 `return`，什么都不做：

```js
const props = options.props
if (!props) return
```

如果选项中有 `props`，那么就开始正式的规范化工作，首先声明了四个变量：

```js
const res = {}
let i, val, name
```

其中 `res` 变量是用来保存规范化后的结果的，我们可以发现 `normalizeProps` 函数的最后一行代码使用 `res` 变量覆盖了原有的 `options.props`：

```js
options.props = res
```

然后开始了判断分支，这个判断分支就是用来区分开发者在使用 `props` 时，到底是使用字符串数组的写法还是使用纯对象的写法的，我们先看字符串数组的情况：

```js
if (Array.isArray(props)) {
  i = props.length
  while (i--) {
    val = props[i]
    if (typeof val === 'string') {
      name = camelize(val)
      res[name] = { type: null }
    } else if (process.env.NODE_ENV !== 'production') {
      warn('props must be strings when using array syntax.')
    }
  }
} else if (isPlainObject(props)) {
  ...
} else if (process.env.NODE_ENV !== 'production') {
  ...
}
```

如果 `props` 是一个字符串数组，那么就使用 `while` 循环遍历这个数组，我们看这里有一个判断：

```js
if (typeof val === 'string') {
  ...
} else if (process.env.NODE_ENV !== 'production') {
  warn('props must be strings when using array syntax.')
}
```

也就是说 `props` 数组中的元素确确实实必须是字符串，否则在非生产环境下会给你一个警告。如果是字符串那么会执行这两句代码：

```js
name = camelize(val)
res[name] = { type: null }
```

首先将数组的元素传递给 `camelize` 函数，这个函数来自于 `shared/util.js` 文件，可以在附录 [shared/util.js 文件工具方法全解](../appendix/shared-util.md) 中查看详细解析，这个函数的作用是将中横线转驼峰。

然后在 `res` 对象上添加了与转驼峰后的 `props` 同名的属性，其值为 `{ type: null }`，这就是实现了对字符串数组的规范化，将其规范为对象的写法，只不过 `type` 的值为 `null`。

下面我们再看看当 `props` 选项不是数组而是对象时的情况：

```js
if (Array.isArray(props)) {
  ...
} else if (isPlainObject(props)) {
  for (const key in props) {
    val = props[key]
    name = camelize(key)
    res[name] = isPlainObject(val)
      ? val
      : { type: val }
  }
} else if (process.env.NODE_ENV !== 'production') {
  ...
}
```

首先使用 `isPlainObject` 函数判断 `props` 是否是一个纯的对象，其中 `isPlainObject` 函数来自于 `shared/util.js` 文件，可以在附录 [shared/util.js 文件工具方法全解](../appendix/shared-util.md) 中查看详细解析。

如果是一个纯对象，也是需要规范化的，我们知道即使是纯对象也是有两种写法的，如下：

```js
props: {
  // 第一种写法，直接写类型
  someData1: Number,
  // 第二种写法，对象
  someData2: {
    type: String,
    default: ''
  }
}
```

最终第一种写法将被规范为对象的形式，具体实现是采用一个 `for in` 循环，检测 `props` 每一个键的值，如果值是一个纯对象那么直接使用，否则将值作为 `type` 的值：

```js
res[name] = isPlainObject(val)
  ? val
  : { type: val }
```

这样就实现了对纯对象语法的规范化。

最后还有一个判断分支，即当你传递了 `props` 选项，但其值既不是字符串数组又不是纯对象的时候，会给你一个警告：

```js
if (Array.isArray(props)) {
  ...
} else if (isPlainObject(props)) {
  ...
} else if (process.env.NODE_ENV !== 'production') {
  warn(
    `Invalid value for option "props": expected an Array or an Object, ` +
    `but got ${toRawType(props)}.`,
    vm
  )
}
```

在警告中使用了来自 `shared/util.js` 文件的 `toRawType` 方法获取你所传递的 `props` 的真实数据类型。

## 规范化 inject（normalizeInject）

现在我们已经了解了，原来 `Vue` 底层是这样处理 `props` 选项的，下面我们再来看看第二个规范化函数：`normalizeInject`，源码如下：

```js
/**
 * Normalize all injections into Object-based format
 */
function normalizeInject (options: Object, vm: ?Component) {
  const inject = options.inject
  if (!inject) return
  const normalized = options.inject = {}
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    for (const key in inject) {
      const val = inject[key]
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}
```

首先是这三句代码：

```js
const inject = options.inject
if (!inject) return
const normalized = options.inject = {}
```

第一句代码使用 `inject` 变量缓存了 `options.inject`，通过这句代码和函数的名字我们能够知道，这个函数是用来规范化 `inject` 选项的。第二句代码判断是否传递了 `inject` 选项，如果没有则直接 `return`。然后在第三句代码中重写了 `options.inject` 的值为一个空的 `JSON` 对象，并定义了一个值同样为空 `JSON` 对象的变量 `normalized`。现在变量 `normalized` 和 `options.inject` 将拥有相同的引用，也就是说当修改 `normalized` 的时候，`options.inject` 也将受到影响。

在这两句代码之后，同样是判断分支语句，判断 `inject` 选项是否是数组和纯对象，类似于对 `props` 的判断一样。说到这里我们需要了解一下 `inject` 选项了，这个选项是 `2.2.0` 版本新增，它要配合 `provide` 选项一同使用，具体介绍可以查看官方文档，这里我们举一个简单的例子：

```js
// 子组件
const ChildComponent = {
  template: '<div>child component</div>',
  created: function () {
    // 这里的 data 是父组件注入进来的
    console.log(this.data)
  },
  inject: ['data']
}

// 父组件
var vm = new Vue({
  el: '#app',
  // 向子组件提供数据
  provide: {
    data: 'test provide'
  },
  components: {
    ChildComponent
  }
})
```

上面的代码中，在子组件的 `created` 钩子中我们访问了 `this.data`，但是在子组件中我们并没有定义这个数据，之所以在没有定义的情况下能够使用，是因为我们使用了 `inject` 选项注入了这个数据，这个数据的来源就是父组件通过 `provide` 提供的。父组件通过 `provide` 选项向子组件提供数据，然后子组件中可以使用 `inject` 选项注入数据。这里我们的 `inject` 选项使用一个字符串数组，其实我们也可以写成对象的形式，如下：

```js
// 子组件
const ChildComponent = {
  template: '<div>child component</div>',
  created: function () {
    console.log(this.d)
  },
  // 对象的语法类似于允许我们为注入的数据声明一个别名
  inject: {
    d: 'data'
  }
}
```

上面的代码中，我们使用对象语法代替了字符串数组的语法，对象语法实际上相当于允许我们为注入的数据声明一个别名。现在我们已经知道了 `inject` 选项的使用方法和写法，其写法与 `props` 一样拥有两种，一种是字符串数组，一种是对象语法。所以这个时候我们再回过头去看 `normalizeInject` 函数，其作用无非就是把两种写法规范化为一种写法罢了，由注释我们也能知道，最终规范化为对象语法。接下来我们就看看具体实现，首先是 `inject` 选项是数组的情况下，如下：

```js
if (Array.isArray(inject)) {
  for (let i = 0; i < inject.length; i++) {
    normalized[inject[i]] = { from: inject[i] }
  }
} else if (isPlainObject(inject)) {
  ...
} else if (process.env.NODE_ENV !== 'production') {
  ...
}
```

使用 `for` 循环遍历数组的每一个元素，将元素的值作为 `key`，然后将 `{ from: inject[i] }` 作为值。大家不要忘了一件事，那就是 `normalized` 对象和 `options.inject` 拥有相同的引用，所以 `normalized` 的改变就意味着 `options.inject` 的改变。

也就是说如果你的 `inject` 选项是这样写的：

```js
['data1', 'data2']
```

那么将被规范化为：

```js
{
  'data1': { from: 'data1' },
  'data2': { from: 'data2' }
}
```

当 `inject` 选项不是数组的情况下，如果是一个纯对象，那么将走 `else if` 分支：

```js
if (Array.isArray(inject)) {
  ...
} else if (isPlainObject(inject)) {
  for (const key in inject) {
    const val = inject[key]
    normalized[key] = isPlainObject(val)
      ? extend({ from: key }, val)
      : { from: val }
  }
} else if (process.env.NODE_ENV !== 'production') {
  ...
}
```

有的同学可能会问：`normalized` 函数的目的不就是将 `inject` 选项规范化为对象结构吗？那既然已经是对象了还规范什么呢？那是因为我们期望得到的对象是这样的：

```js
inject: {
  'data1': { from: 'data1' },
  'data2': { from: 'data2' }
}
```

即带有 `from` 属性的对象，但是开发者所写的对象可能是这样的：

```js
let data1 = 'data1'

// 这里为简写，这应该写在Vue的选项中
inject: {
  data1,
  d2: 'data2',
  data3: { someProperty: 'someValue' }
}
```

对于这种情况，我们将会把它规范化为：

```js
inject: {
  'data1': { from: 'data1' },
  'd2': { from: 'data2' },
  'data3': { from: 'data3', someProperty: 'someValue' }
}
```

而实现方式，就是 `else if` 分支内的代码所实现的，即如下代码：

```js
for (const key in inject) {
  const val = inject[key]
  normalized[key] = isPlainObject(val)
    ? extend({ from: key }, val)
    : { from: val }
}
```

使用 `for in` 循环遍历 `inject` 选项，依然使用 `inject` 对象的 `key` 作为 `normalized` 的 `key`，只不过要判断一下值(即 `val`)是否为纯对象，如果是纯对象则使用 `extend` 进行混合，否则直接使用 `val` 作为 `from` 字段的值，代码总体还是很简单的。

最后一个判断分支同样是在当你传递的 `inject` 选项既不是数组又不是纯对象的时候，在非生产环境下给你一个警告：

```js
if (Array.isArray(inject)) {
  ...
} else if (isPlainObject(inject)) {
  ...
} else if (process.env.NODE_ENV !== 'production') {
  warn(
    `Invalid value for option "inject": expected an Array or an Object, ` +
    `but got ${toRawType(inject)}.`,
    vm
  )
}
```

## 规范化 directives（normalizeDirectives）

最后一个规范化函数是 `normalizeDirectives`，源码如下：

```js
/**
 * Normalize raw function directives into object format.
 */
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key]
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}
```

看其代码内容，应该是规范化 `directives` 选项的。我们知道 `directives` 选项用来注册局部指令，比如下面的代码我们注册了两个局部指令分别是 `v-test1` 和 `v-test2`：

```js
<div id="app" v-test1 v-test2>{{test}}</div>

var vm = new Vue({
  el: '#app',
  data: {
    test: 1
  },
  // 注册两个局部指令
  directives: {
    test1: {
      bind: function () {
        console.log('v-test1')
      }
    },
    test2: function () {
      console.log('v-test2')
    }
  }
})
```

上面的代码中我们注册了两个局部指令，但是注册的方法不同，其中 `v-test1` 指令我们使用对象语法，而 `v-test2` 指令我们使用的则是一个函数。所以既然出现了允许多种写法的情况，那么当然要进行规范化了，而规范化的手段就如同 `normalizeDirectives` 代码中写的那样：

```js
for (const key in dirs) {
  const def = dirs[key]
  if (typeof def === 'function') {
    dirs[key] = { bind: def, update: def }
  }
}
```

注意 `if` 判断语句，当发现你注册的指令是一个函数的时候，则将该函数作为对象形式的 `bind` 属性和 `update` 属性的值。也就是说，可以把使用函数语法注册指令的方式理解为一种简写。

这样，我们就彻底了解了这三个用于规范化选项的函数的作用了，相信通过上面的介绍，大家对 `props`、`inject` 以及 `directives` 这三个选项会有一个新的认识。知道了 `Vue` 是如何做到允许我们采用多种写法，也知道了 `Vue` 是如何统一处理的，这也算是看源码的收获之一吧。

看完了 `mergeOptions` 函数里的三个规范化函数之后，我们继续看后面的代码，接下来是这样一段代码：

```js
const extendsFrom = child.extends
if (extendsFrom) {
  parent = mergeOptions(parent, extendsFrom, vm)
}
if (child.mixins) {
  for (let i = 0, l = child.mixins.length; i < l; i++) {
    parent = mergeOptions(parent, child.mixins[i], vm)
  }
}
```

很显然，这段代码是处理 `extends` 选项和 `mixins` 选项的，首先使用变量 `extendsFrom` 保存了对 `child.extends` 的引用，之后的处理都是用 `extendsFrom` 来做，然后判断 `extendsFrom` 是否为真，即 `child.extends` 是否存在，如果存在的话就递归调用 `mergeOptions` 函数将 `parent` 与 `extendsFrom` 进行合并，并将结果作为新的 `parent`。这里要注意，我们之前说过 `mergeOptions` 函数将会产生一个新的对象，所以此时的 `parent` 已经被新的对象重新赋值了。

接着检测 `child.mixins` 选项是否存在，如果存在则使用同样的方式进行操作，不同的是，由于 `mixins` 是一个数组所以要遍历一下。

经过了上面两个判断分支，此时的 `parent` 很可能已经不是当初的 `parent` 的，而是经过合并后产生的新对象。关于 `extends` 与 `mixins` 的更多东西以及这里递归调用 `mergeOptions` 所产生的影响，等我们看完整个 `mergeOptions` 函数对选项的处理之后会更容易理解，因为现在我们还不清楚 `mergeOptions` 到底怎么合并选项，等我们了解了 `mergeOptions` 的作用之后再回头来看一下这段代码。

到目前为止我们所看到的 `mergeOptions` 的代码，还都是对选项的规范化，或者说的明显一点：现在所做的事儿还都在对 `parent` 以及 `child` 进行预处理，而这是接下来合并选项的必要步骤。
