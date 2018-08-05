# core/util 目录下的工具方法全解

## debug.js 文件代码说明

该文件主要导出四个函数，如下：

```js
export let warn = noop
export let tip = noop
export let generateComponentTrace = (noop: any) // work around flow check
export let formatComponentName = (noop: any)
```

这四个变量都被初始化为空函数·

接下来是这样一段代码：

```js
if (process.env.NODE_ENV !== 'production') {
  // ...
}
```

这些代码被包含在一个环境判断的语句块内，这说明，这些代码只有在非生产环境才会生效，而在这些代码中我们能看到如下语句：

```js
if (process.env.NODE_ENV !== 'production') {
  // 其他代码...

  warn = (msg, vm) => {
    // ...
  }

  tip = (msg, vm) => {
    // ...
  }

  formatComponentName = (vm, includeFile) => {
    // ...
  }

  generateComponentTrace = vm => {
    // ...
  }
}
```

上面的代码是简化过的，可以发现，在非生产环境下分别对 `warn`、`tip`、`formatComponentName` 以及 `generateComponentTrace` 进行了赋值，且值都为函数，接下来我们分别看一下这四个函数的作用，不过在这之前，我们需要介绍三个变量，也就是 `if` 语句块最开始的三个变量：

```js
const hasConsole = typeof console !== 'undefined'
const classifyRE = /(?:^|[-_])(\w)/g
const classify = str => str
  .replace(classifyRE, c => c.toUpperCase())
  .replace(/[-_]/g, '')
```

其中 `hasConsole` 用来检测宿主环境的 `console` 是否可用，`classifyRE` 是一个正则表达式：`/(?:^|[-_])(\w)/g`，用于 `classify` 函数，`classify` 函数的作用是将一个字符串的首字母以及中横线转为驼峰，代码很简单相信大家都能看得懂，`classify` 的使用如下：

```js
console.log(classify('aaa-bbb-ccc')) // AaaBbbCcc
```

### warn

### tip

### formatComponentName

## env.js 文件代码说明

### inBrowser

源码如下：

```js
export const inBrowser = typeof window !== 'undefined'
```

* 描述：检测当前宿主环境是否是浏览器

* 源码解析：通过判断 `window` 对象是否存在即可

### UA

源码如下：

```js
export const UA = inBrowser && window.navigator.userAgent.toLowerCase()
```

* 描述：获取当浏览器的 `user Agent`，简称 `UA`。

* 源码解析：首先使用 `inBrowser` 检测当前宿主环境是否是浏览器，如果是则通过 `window.navigator.userAgent.toLowerCase()` 获取当前浏览器的 `UA` 字符串，并将该字符串小写化之后赋值给 `UA` 常量。

### isIE

源码如下：

```js
export const isIE = UA && /msie|trident/.test(UA)
```

* 描述：判断当前浏览器是否是 `Internet Explorer` 浏览器。

* 源码解析：

大家可以访问这里 [Internet Explorer User Agent Strings](http://useragentstring.com/pages/useragentstring.php?name=Internet+Explorer) 查看 `IE2` 到 `IE11` 所有版本的用户代理字符串，我们能够发现在这些 `UA` 字符串中必然包含 `'trident'` 或者 `'msie'` 这两个字符串。所以只需要使用正则去匹配 `UA` 中是否包含这两个字符串即可判断是否为 `IE` 浏览器。

### hasProto

源码如下：

```js
// can we use __proto__?
export const hasProto = '__proto__' in {}
```

* 描述：`hasProto` 用来检查当前环境是否可以使用对象的 `__proto__` 属性。我们知道，一个对象的 `__proto__` 属性指向了它构造函数的原型，但这是一个在 `ES2015` 中才被标准化的属性，`IE11` 及更高版本才能够使用。

* 源码解析：

判断当前环境是否可以使用 `__proto__` 属性很简单，正如源码所示那样，使用 `in` 运算符从一个空的对象字面量开始沿着原型链逐级检查，看其是否存在即可。

### nativeWatch

源码如下：

```js
// Firefox has a "watch" function on Object.prototype...
export const nativeWatch = ({}).watch
```

* 描述：在 `Firefox` 中原生提供了 `Object.prototype.watch` 函数，所以当运行在 `Firefox` 中时 `nativeWatch` 为原生提供的函数，在其他浏览器中 `nativeWatch` 为 `undefined`。这个变量主要用于 `Vue` 处理 `watch` 选项时与其冲突。

### isServerRendering

源码如下：

```js
// this needs to be lazy-evaled because vue may be required before
// vue-server-renderer can set VUE_ENV
let _isServer
export const isServerRendering = () => {
  if (_isServer === undefined) {
    /* istanbul ignore if */
    if (!inBrowser && !inWeex && typeof global !== 'undefined') {
      // detect presence of vue-server-renderer and avoid
      // Webpack shimming the process
      _isServer = global['process'].env.VUE_ENV === 'server'
    } else {
      _isServer = false
    }
  }
  return _isServer
}
```

* 描述：`isServerRendering` 函数的执行结果是一个布尔值，用来判断是否是服务端渲染。

* 源码解析：

根据 `if` 语句：

```js
if (!inBrowser && !inWeex && typeof global !== 'undefined') {...}
```

可知如果不在浏览器中(`!inBrowser`)也不是weex(`!inWeex`)，同时 `global` 有定义，则可能是服务端渲染，那么继续判断：

```js
global['process'].env.VUE_ENV === 'server'
```

是否成立，其中 `global['process'.env.VUE_ENV]` 是 `vue-server-renderer` 注入的。如果成立那么说明是服务端渲染。如果上面的条件有一项不成立，那么都不认为是服务端渲染。

注意，在 `isServerRendering` 中使用全局变量 `_isServer` 保存了最终的值，如果发现 `_isServer` 有定义，那么就不会重新计算，从而提升性能。毕竟环境是不会改变的，只需要求值一次即可。

### hasSymbol

源码如下：

```js
export const hasSymbol =
  typeof Symbol !== 'undefined' && isNative(Symbol) &&
  typeof Reflect !== 'undefined' && isNative(Reflect.ownKeys)
```

* 描述：`hasSymbol` 常量是一个布尔值，用来判断当前宿主环境是否支持原生 `Symbol` 和 `Reflect.ownKeys` 的可用性。

* 源码解析：

首先判断 `Symbol` 和 `Reflect` 是否存在，并使用 `isNative` 函数保证 `Symbol` 与 `Reflect.ownKeys` 全部是原生定义。

## error.js 文件代码说明

该文件只导出一个函数：`handleError`，在看这个函数的实现之前，我们需要回顾一下 `Vue` 的文档，我们知道 `Vue` 提供了一个全局配置 `errorHandler`，用来捕获组件生命周期函数等的内部错误，使用方法如下：

```js
Vue.config.errorHandler = function (err, vm, info) {
  // ...
}
```

我们通过设置 `Vue.config.errorHandler` 为一个函数，实现对特定错误的捕获。具体使用可以查看官方文档。而接下来要讲的 `handleError` 函数就是用来实现 `Vue.config.errorHandler` 这一配置功能的，我们看看是怎么做的。

### handleError

源码如下：

```js
export function handleError (err: Error, vm: any, info: string) {
  if (vm) {
    let cur = vm
    while ((cur = cur.$parent)) {
      const hooks = cur.$options.errorCaptured
      if (hooks) {
        for (let i = 0; i < hooks.length; i++) {
          try {
            const capture = hooks[i].call(cur, err, vm, info) === false
            if (capture) return
          } catch (e) {
            globalHandleError(e, cur, 'errorCaptured hook')
          }
        }
      }
    }
  }
  globalHandleError(err, vm, info)
}
```

* 描述：用于错误处理

* 参数：
    * `{Error} err` catch 到的错误对象，我们可以看到 Vue 源码中是这样使用的：
```js
try {
    ...
} catch (e) {
    handleError(e, vm, `${hook} hook`)
}
```
    * `{any} vm` 这里应该传递 `Vue` 实例
    * `{String} info` `Vue` 特定的错误提示信息

* 源码分析

首先迎合一下使用场景，在 `Vue` 的源码中 `handleError` 函数的使用一般如下：

```js
try {
  handlers[i].call(vm)
} catch (e) {
  handleError(e, vm, `${hook} hook`)
}
```

上面是生命周期钩子回调执行时的代码，由于生命周期钩子是开发者自定义的函数，这个函数的执行是很可能存在运行时错误的，所以这里需要 `try catch` 包裹，且在发生错误的时候，在 `catch` 语句块中捕获错误，然后使用 `handleError` 进行错误处理。知道了这些，我们再看看 `handleError` 到底怎么处理的，源码上面已经贴出来了，首先是一个 `if` 判断：

```js
if (vm) {
  let cur = vm
  while ((cur = cur.$parent)) {
    if (cur.$options.errorCaptured) {
      try {
        const propagate = cur.$options.errorCaptured.call(cur, err, vm, info)
        if (!propagate) return
      } catch (e) {
        globalHandleError(e, cur, 'errorCaptured hook')
      }
    }
  }
}
```

那这段代码是干嘛的呢？我们先不管，回头来说。我们先看后面的代码，在判断语句后面直接调用了 `globalHandleError` 函数，且将三个参数透传了过去：

```js
globalHandleError(err, vm, info)
```

`globalHandleError` 函数就定义在 `handleError` 函数的下面，源码如下：

```js
function globalHandleError (err, vm, info) {
  if (config.errorHandler) {
    try {
      return config.errorHandler.call(null, err, vm, info)
    } catch (e) {
      logError(e, null, 'config.errorHandler')
    }
  }
  logError(err, vm, info)
}
```

`globalHandleError` 函数首先判断 `config.errorHandler` 是否为真，如果为真则调用 `config.errorHandler` 并将参数透传，这里的 `config.errorHandler` 就是 `Vue` 全局API提供的用于自定义错误处理的配置我们前面讲过。由于这个错误处理函数也是开发者自定义的，所以可能出现运行时错误，这个时候就需要使用 `try catch` 语句块包裹起来，当错误发生时，使用 `logError` 函数打印错误，当然啦，如果没有配置 `config.errorHandler` 也就是说 `config.errorHandler` 此时为假，那么将使用默认的错误处理函数，也就是 `logError` 进行错误处理。

所以 `globalHandleError` 是用来检测你是否自定义了 `config.errorHandler` 的，如果有则用之，如果没有就是用 `logError`。

那么 `logError` 是什么呢？这个函数定义在 `globalHandleError` 函数的下面，源码如下：

```js
function logError (err, vm, info) {
  if (process.env.NODE_ENV !== 'production') {
    warn(`Error in ${info}: "${err.toString()}"`, vm)
  }
  /* istanbul ignore else */
  if ((inBrowser || inWeex) && typeof console !== 'undefined') {
    console.error(err)
  } else {
    throw err
  }
}
```

可以看到，在非生产环境下，先使用 `warn` 函数报一个警告，然后判断是否在浏览器或者Weex环境且 `console` 是否可用，如果可用则使用 `console.error` 打印错误，没有则直接 `throw err`。

所以 `logError` 才是真正打印错误的函数，且实现也比较简单。这其实已经达到了 `handleError` 的目的了，但是大家注意我们此时忽略了一段代码，就是 `handleError` 函数开头的一段代码：

```js
if (vm) {
  let cur = vm
  while ((cur = cur.$parent)) {
    const hooks = cur.$options.errorCaptured
    if (hooks) {
      for (let i = 0; i < hooks.length; i++) {
        try {
          const capture = hooks[i].call(cur, err, vm, info) === false
          if (capture) return
        } catch (e) {
          globalHandleError(e, cur, 'errorCaptured hook')
        }
      }
    }
  }
}
```

那么这个 `if` 判断是干嘛的呢？这其实是 `Vue` 选项 `errorCaptured` 的实现。实际上我们可以这样写代码：

```js
var vm = new Vue({
  errorCaptured: function (err, vm, info) {
    console.log(err)
    console.log(vm)
    console.log(info)
  }
})
```

`errorCaptured` 选项可以用来捕获子代组件的错误，当子组件有错误被 `handleError` 函数处理时，父组件可以通过该选项捕获错误。这个选项与生命周期钩子并列。

举一个例子，如下代码：

```js
var ChildComponent = {
  template: '<div>child component</div>',
  beforeCreate: function () {
    JSON.parse("};")
  }
}

var vm = new Vue({
  components: {
    ChildComponent
  },
  errorCaptured: function (err, vm, info) {
    console.log(err)
    console.log(vm)
    console.log(info)
  }
})
```

上面的代码中，首先我们定义了一个子组件 `ChildComponent`，并且在 `ChildComponent` 的 `beforeCreate` 钩子中写了如下代码：

```js
JSON.parse("};")
```

这明显会报错嘛，然后我们在父组件中使用了 `errorCaptured` 选项，这样是可以捕获到错误的。

接下来我们就看看 `Vue` 是怎么实现的，原理就在这段代码中：

```js
if (vm) {
  let cur = vm
  while ((cur = cur.$parent)) {
    const hooks = cur.$options.errorCaptured
    if (hooks) {
      for (let i = 0; i < hooks.length; i++) {
        try {
          const capture = hooks[i].call(cur, err, vm, info) === false
          if (capture) return
        } catch (e) {
          globalHandleError(e, cur, 'errorCaptured hook')
        }
      }
    }
  }
}
```

首先看这个 `while` 循环：

```js
while ((cur = cur.$parent))
```

这是一个链表遍历嘛，逐层寻找父级组件，如果父级组件使用了 `errorCaptured` 选项，则调用之，就怎么简单。当然啦，作为生命周期钩子，`errorCaptured` 选项在内部是以一个数组的形式存在的，所以需要 `for` 循环遍历，另外钩子执行的语句是被包裹在 `try catch` 语句块中的。

这里有两点需要注意：

* 第一、既然是逐层寻找父级，那意味着，如果一个子组件报错，那么其使用了 `errorCaptured` 的所有父代组件都可以捕获得到。
* 第二、注意这句话：

```js
if (capture) return
```

其中 `capture` 是钩子调用的返回值与 `false` 做全等比较的结果，也就是说，如果 `errorCaptured` 钩子函数返回假，那么 `capture` 为真直接 `return`，程序不会走 `if` 语句块后面的 `globalHandleError`，否则除了 `errorCaptured` 被调用外，`if` 语句块后面的 `globalHandleError` 也会被调用。最重要的是：如果 `errorCaptured` 钩子函数返回假将阻止错误继续向“上级”传递。

## lang.js 文件代码说明

### isReserved

* 源码如下：

```js
/**
 * Check if a string starts with $ or _
 */
export function isReserved (str: string): boolean {
  const c = (str + '').charCodeAt(0)
  return c === 0x24 || c === 0x5F
}
```

* 描述：`isReserved` 函数用来检测一个字符串是否以 `$` 或者 `_` 开头，主要用来判断一个字段的键名是否是保留的，比如在 `Vue` 中不允许使用以 `$` 或 `_` 开头的字符串作为 `data` 数据的字段名，如：

```js
new Vue({
  data: {
    $a: 1,  // 不允许
    _b: 2   // 不允许
  }
})
```

* 源码分析：

判断一个字符串是否以 `$` 或 `_` 开头还是比较容易的，只不过 `isReserved` 函数的实现方式是通过字符串的 `charCodeAt` 方法获得该字符串第一个字符的 `unicode`，然后与 `0x24` 和 `0x5F` 作比较。其中 `$` 对应的 `unicode` 码为 `36`，对应的十六进制值为 `0x24`；`_` 对应的 `unicode` 码为 `95`，对应的十六进制值为 `0x5F`。有的同学可能会有疑问为什么不直接用字符 `$` 和 `_` 作比较，而是用这两个字符对应的 `unicode` 码作比较，其实无论哪种比较方法差别不大，看作者更倾向于哪一种。

### def

* 源码如下：

```js
/**
 * Define a property.
 */
export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}
```

* 描述：`def` 函数是对 `Object.defineProperty` 函数的简单包装，为了调用方便

* 源码分析：

`def` 函数接收四个参数，分别是 源对象，要在对象上定义的键名，对应的值，以及是否可枚举，如果不传递 `enumerable` 参数则代表定义的属性是不可枚举的。

### parsePath

* `parsePath` 函数的源码在 [初始 Watcher](/art/8vue-reactive-dep-watch.html#初识-watcher) 一节中讲解

## options.js 文件代码说明

* 该文件的讲解集中在 [Vue选项的规范化](../art/4vue-normalize.md) 以及 [Vue选项的合并](../art/5vue-merge.md) 这两个小节中。

## perf.js 文件代码说明

这个文件导出两个变量，分别是 `mark` 和 `measure`：

```js
export let mark
export let measure
```

接着是下面这段代码：

```js
if (process.env.NODE_ENV !== 'production') {
  const perf = inBrowser && window.performance
  /* istanbul ignore if */
  if (
    perf &&
    perf.mark &&
    perf.measure &&
    perf.clearMarks &&
    perf.clearMeasures
  ) {
    mark = tag => perf.mark(tag)
    measure = (name, startTag, endTag) => {
      perf.measure(name, startTag, endTag)
      perf.clearMarks(startTag)
      perf.clearMarks(endTag)
      perf.clearMeasures(name)
    }
  }
}
```

首先判断环境，如果不是生产环境，则继续，否则什么都不做。也就是说，如果是生产环境，那么这个文件导出的两个变量，都是 `undefined`。

我们看一下，如果不是生产环境，又做了些什么，首先定义一个变量 `perf`：

```js
const perf = inBrowser && window.performance
```

如果在浏览器环境，那么 `perf` 的值就是 `window.performance`，否则为 `false`，然后做了一系列判断，目的是确定 `performance` 的接口可用，如果都可用，那么将初始化 `mark` 和 `measure` 变量。

首先看 `mark`：

```js
mark = tag => perf.mark(tag)
```

实际上，`mark` 是一个函数，这个函数的作用就是使用给定的 `tag`，通过 `performance.mark()` 方法打一个标记。

`measure` 方法接收三个参数，这三个参数与 `performance.measure()` 方法所要求的参数相同，它的作用就是调用一下 `performance.measure()` 方法，然后调用三个清除标记的方法：

```js
perf.clearMarks(startTag)
perf.clearMarks(endTag)
perf.clearMeasures(name)
```

可以发现，其实 `mark` 和 `measure` 这两个函数就是对 `performance.mark()` 和 `performance.measure()` 的封装。对于 `performance.mark()` 和 `performance.measure()` 这两个方法的详情，大家可以查看 [Performance](https://developer.mozilla.org/en-US/docs/Web/API/Performance/mark)，这里我将用一个通俗的说法尽快让大家明白 `mark` 和 `measure` 的作用，首先 `mark` 可以理解为“打标记”，比如如下代码我们在 `for` 循环的前后各打一个标记：

```js
mark('for-start')
for (let i = 0; i < 100; i++) {
    console.log(i)
}
mark('for-end')
```

但是仅仅打标记是没有什么用的，这个时候就需要 `measure` 方法，它能够根据两个标记来计算这两个标记间代码的性能数据，你只需要这样即可：

```js
measure('for-measure', 'for-start', 'for-end')
```

## props.js 文件代码说明



## next-tick.js 文件代码说明