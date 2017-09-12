## core/util 目录下的工具方法全解

#### debug.js 文件代码说明

该文件主要导出三个函数，如下：

```js
export let warn = noop
export let tip = noop
export let formatComponentName: Function = (null: any) // work around flow check
```

