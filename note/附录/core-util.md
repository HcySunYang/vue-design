## core/util 目录下的工具方法全解

#### debug.js 文件代码说明

该文件主要导出三个函数，如下：

```js
export let warn = noop
export let tip = noop
export let formatComponentName: Function = (null: any) // work around flow check
```

其中 `warn` 和 `tip` 都被初始化为 `noop` 即空函数，而 `formatComponentName` 被初始化为 `null` 但它将来会是一个函数类型(`Function`)。

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

  // 其他代码...
}
```

上面的代码是简化过的，可以发现，在非生产环境下分别对 `warn`、`tip` 以及 `formatComponentName` 进行了赋值，且值都为函数，接下来我们分别看一下这三个函数的作用。

##### warn

##### tip

##### formatComponentName


#### env.js 文件代码说明

#### error.js 文件代码说明

该文件导出一个函数：`handleError`

##### handleError

源码如下：

```js
export function handleError (err: Error, vm: any, info: string) {
  if (config.errorHandler) {
    config.errorHandler.call(null, err, vm, info)
  } else {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Error in ${info}: "${err.toString()}"`, vm)
    }
    /* istanbul ignore else */
    if (inBrowser && typeof console !== 'undefined') {
      console.error(err)
    } else {
      throw err
    }
  }
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
    * `{String} info` Vue 特定的错误提示信息

* 源码分析

首先检测是否定义 `config.errorHandler`，其中 `config` 为全局配置，来自于 `core/config.js`。如果发现 `config.errorHandler` 为真，就会执行这句：

```js
config.errorHandler.call(null, err, vm, info)
```

所以你尽管通过 `Vue.config` 修改 `errorHandler` 的定义即可自定义错误处理错误的方式：

```js
Vue.config.errorHandler = (err, vm, info) => {

}
```

如果 `config.errorHandler` 为假，那么程序将走 `else` 分支，可以理解为默认的错误处理方式，如果不是生产环境，首先提示一段文字信息：

```js
if (process.env.NODE_ENV !== 'production') {
    warn(`Error in ${info}: "${err.toString()}"`, vm)
}
```

然后判断是否是浏览器环境，是的话使用 `console.error` 打印错误信息，否则直接 `throw err`：

```js
if (inBrowser && typeof console !== 'undefined') {
    console.error(err)
} else {
    throw err
}
```

#### lang.js 文件代码说明

##### emptyObject

* 源码如下：

```js
export const emptyObject = Object.freeze({})
```

#### options.js 文件代码说明

#### perf.js 文件代码说明

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

如果在浏览器环境，那么 `perf` 的值就是 `window.performance`，否则为 `false`，然后做了一些列判断，目的是确定 `performance` 的接口可用，如果都可用，那么将初始化 `mark` 和 `measure` 变量。

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

#### props.js 文件代码说明