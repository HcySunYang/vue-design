## Vue 构造函数

在 [了解 Vue 这个项目](./了解Vue这个项目.md) 一节中，我们在最后提到这套文章将会以 `npm run dev` 为切入点：

```js
"dev": "rollup -w -c build/config.js --environment TARGET:web-full-dev",
```

当我们执行 `npm run dev` 时，根据 `build/config.js` 文件中的配置：

```js
// Runtime+compiler development build (Browser)
  'web-full-dev': {
    entry: resolve('web/entry-runtime-with-compiler.js'),
    dest: resolve('dist/vue.js'),
    format: 'umd',
    env: 'development',
    alias: { he: './entity-decoder' },
    banner
  }
```

可知，入口文件为 `web/entry-runtime-with-compiler.js`，最终输出 `dist/vue.js`，它是一个 `umd` 模块，接下来我们就以入口文件为起点，找到 `Vue` 构造函数并将 `Vue` 构造函数的真面目扒的一清二楚。

但现在有一个问题 `web/entry-runtime-with-compiler.js` 中这个 `web` 指的是哪一个目录？这其实是一个别名配置，打开 `build/alias.js` 文件：

```js
const path = require('path')

module.exports = {
  vue: path.resolve(__dirname, '../src/platforms/web/entry-runtime-with-compiler'),
  compiler: path.resolve(__dirname, '../src/compiler'),
  core: path.resolve(__dirname, '../src/core'),
  shared: path.resolve(__dirname, '../src/shared'),
  web: path.resolve(__dirname, '../src/platforms/web'),
  weex: path.resolve(__dirname, '../src/platforms/weex'),
  server: path.resolve(__dirname, '../src/server'),
  entries: path.resolve(__dirname, '../src/entries'),
  sfc: path.resolve(__dirname, '../src/sfc')
}

```

其中有这么一句：

```js
web: path.resolve(__dirname, '../src/platforms/web')
```

所以 `web` 指向的应该是 `src/platforms/web`，除了 `web` 之外，`alias.js` 文件中还配置了其他的别名，大家在找对应目录的时候，可以来这里查阅，后面就不做这种目录寻找的说明了。

接下来我们就进入正题，打开 `src/platforms/web/entry-runtime-with-compiler.js` 文件，你可以看到这样一句话：

```js
import Vue from './runtime/index'
```

这说明：这个文件并不是 Vue 构造函数的“出生地”，这个文件中的 `Vue` 是从 `./runtime/index` 导入进来的，于是我们就打开当前目录的 `runtime` 目录下的 `index.js` 看一下，你同样能够发现这样一句话：

```js
import Vue from 'core/index'
```

同样的道理，这说明 `runtime/index.js` 文件也不是 `Vue` 的“出生地”，你应该继续顺藤摸瓜打开 `core/index.js` 文件，在 `build/alias.js` 的配置中，`core` 指向的是 `src/core`，打开 `src/core/index.js` 你能看到这样一句：

```js
import Vue from './instance/index'
```

按照之前的逻辑，继续打开 `./instance/index.js` 文件：

```js
// 从五个文件导入五个方法（不包括 warn）
import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// 定义 Vue 构造函数
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}

// 将 Vue 作为参数传递给导入的五个方法
initMixin(Vue)
stateMixin(Vue)
eventsMixin(Vue)
lifecycleMixin(Vue)
renderMixin(Vue)

// 导出 Vue
export default Vue
```

可以看到，这个文件才是 `Vue` 构造函数真正的“出生地”，上面的代码是 `./instance/index.js` 文件中全部的代码，还是比较简短易看的，首先分别从 `./init.js`、`./state.js`、`./render.js`、`./events.js`、`./lifecycle.js` 这五个文件中导出五个方法，分别是：`initMixin`、`stateMixin`、`renderMixin`、`eventsMixin` 以及 `lifecycleMixin`，然后定义了 `Vue` 构造函数，其中使用了安全模式来提醒你要使用 `new` 操作符来调用 `Vue`，接着将 `Vue` 构造函数作为参数，分别传递给了导入进来的这五个方法，最后导出 `Vue`。

那么这五个方法又做了什么呢？以 `initMixin` 为例，打开 `./init.js` 文件，找到 `initMixin` 方法，如下：

```js
export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    // ... _init 方法的函数体，此处省略
  }
}
```

这个方法的作用就是在 `Vue` 的原型上添加了 `_init` 方法，这个 `_init` 方法看上去应该是内部初始化的一个方法，其实在 `instance/index.js` 文件中我们是见过这个方法的，如下：

```js
// 定义 Vue 构造函数
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 在这里
  this._init(options)
}
```

这 `Vue` 的构造函数里有这么一句：`this._init(options)`，这说明，当我们执行 `new Vue()` 的时候，`this._init(options)` 将被执行。

再打开 `./state.js` 文件，找到 `stateMixin` 方法，这个方法的一开始，是这样一段代码：

```js
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function (newData: Object) {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)
```

我们先看最后两句，使用 `Object.defineProperty` 在 `Vue.prototype` 上定义了两个属性，就是大家熟悉的：`$data` 和 `$props`，这两个属性的定义分别写在了 `dataDef` 以及 `propsDef` 这两个对象里，也就是这两句代码上面的代码，首先是 `get` ：

```js
const dataDef = {}
dataDef.get = function () { return this._data }
const propsDef = {}
propsDef.get = function () { return this._props }
```

可以看到，`$data` 属性实际上代理的是 `_data` 这个实例属性，而 `$props` 代理的是 `_props` 这个实例属性。然后有一个是否为生产环境的判断，如果不是生产环境的话，就为 `$data` 和 `$props` 这两个属性设置一下 `set`，实际上就是提示你一下：别他娘的想修改我，老子无敌。

也就是说，`$data` 和 `$props` 是两个只读的属性，所以，现在让你使用 `js` 实现一个只读的属性，你应该知道要怎么做了。

接下来 `stateMixin` 又在 `Vue.prototype` 上定义了三个方法：

```js
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
  	// ...
  }
```

这三个方法分别是：`$set`、`$delete` 以及 `$watch`，实际上这些东西你都见过的，在这里：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-09-04-093014.jpg)










