## core/util 目录下的工具方法全解

#### debug.js 文件代码说明

该文件主要导出三个函数，如下：

```js
export let warn = noop
export let tip = noop
export let formatComponentName: Function = (null: any) // work around flow check
```

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

