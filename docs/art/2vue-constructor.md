# Vue 构造函数

我们知道，我们在使用 `Vue` 的时候，要使用 `new` 操作符进行调用，这说明 `Vue` 应该是一个构造函数，所以我们要做的第一件事就是：把 `Vue` 构造函数搞清楚。

## Vue 构造函数的原型

在 [了解 Vue 这个项目](./1start-learn.md) 一节中，我们在最后提到这套文章将会以 `npm run dev` 为切入点：

```js
"dev": "rollup -w -c scripts/config.js --environment TARGET:web-full-dev",
```

当我们执行 `npm run dev` 时，根据 `scripts/config.js` 文件中的配置：

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

但现在有一个问题 `web/entry-runtime-with-compiler.js` 中这个 `web` 指的是哪一个目录？这其实是一个别名配置，打开 `scripts/alias.js` 文件：

```js
const path = require('path')

const resolve = p => path.resolve(__dirname, '../', p)

module.exports = {
  vue: resolve('src/platforms/web/entry-runtime-with-compiler'),
  compiler: resolve('src/compiler'),
  core: resolve('src/core'),
  shared: resolve('src/shared'),
  web: resolve('src/platforms/web'),
  weex: resolve('src/platforms/weex'),
  server: resolve('src/server'),
  entries: resolve('src/entries'),
  sfc: resolve('src/sfc')
}
```

其中有这么一句：

```js
web: resolve('src/platforms/web')
```

所以 `web` 指向的应该是 `src/platforms/web`，除了 `web` 之外，`alias.js` 文件中还配置了其他的别名，大家在找对应目录的时候，可以来这里查阅，后面就不做这种目录寻找的说明了。

接下来我们就进入正题，打开 `src/platforms/web/entry-runtime-with-compiler.js` 文件，你可以看到这样一句话：

```js
import Vue from './runtime/index'
```

这说明：这个文件并不是 `Vue` 构造函数的“出生地”，这个文件中的 `Vue` 是从 `./runtime/index` 导入进来的，于是我们就打开当前目录的 `runtime` 目录下的 `index.js` 看一下，你同样能够发现这样一句话：

```js
import Vue from 'core/index'
```

同样的道理，这说明 `runtime/index.js` 文件也不是 `Vue` 构造函数的“出生地”，你应该继续顺藤摸瓜打开 `core/index.js` 文件，在 `scripts/alias.js` 的配置中，`core` 指向的是 `src/core`，打开 `src/core/index.js` 你能看到这样一句：

```js
import Vue from './instance/index'
```

按照之前的套路，继续打开 `./instance/index.js` 文件：

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

可以看到，这个文件才是 `Vue` 构造函数真正的“出生地”，上面的代码是 `./instance/index.js` 文件中全部的代码，还是比较简短易看的，首先分别从 `./init.js`、`./state.js`、`./render.js`、`./events.js`、`./lifecycle.js` 这五个文件中导入五个方法，分别是：`initMixin`、`stateMixin`、`renderMixin`、`eventsMixin` 以及 `lifecycleMixin`，然后定义了 `Vue` 构造函数，其中使用了安全模式来提醒你要使用 `new` 操作符来调用 `Vue`，接着将 `Vue` 构造函数作为参数，分别传递给了导入进来的这五个方法，最后导出 `Vue`。

那么这五个方法又做了什么呢？先看看 `initMixin` ，打开 `./init.js` 文件，找到 `initMixin` 方法，如下：

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

在 `Vue` 的构造函数里有这么一句：`this._init(options)`，这说明，当我们执行 `new Vue()` 的时候，`this._init(options)` 将被执行。

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

我们先看最后两句，使用 `Object.defineProperty` 在 `Vue.prototype` 上定义了两个属性，就是大家熟悉的：`$data` 和 `$props`，这两个属性的定义分别写在了 `dataDef` 以及 `propsDef` 这两个对象里，我们来仔细看一下这两个对象的定义，首先是 `get` ：

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

这三个方法分别是：`$set`、`$delete` 以及 `$watch`，实际上这些东西你都见过，在这里：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-09-04-093014.jpg)

然后是 `eventsMixin` 方法，这个方法在 `./events.js` 文件中，打开这个文件找到 `eventsMixin` 方法，这个方法在 `Vue.prototype` 上添加了四个方法，分别是：

```js
Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {}
Vue.prototype.$once = function (event: string, fn: Function): Component {}
Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {}
Vue.prototype.$emit = function (event: string): Component {}
```

下一个是 `lifecycleMixin`，打开 `./lifecycle.js` 文件找到相应方法，这个方法在 `Vue.prototype` 上添加了三个方法：

```js
Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {}
Vue.prototype.$forceUpdate = function () {}
Vue.prototype.$destroy = function () {}
```

最后一个就是 `renderMixin` 方法了，它在 `render.js` 文件中，这个方法的一开始以 `Vue.prototype` 为参数调用了 `installRenderHelpers` 函数，这个函数来自于与 `render.js` 文件相同目录下的 `render-helpers/index.js` 文件，打开这个文件找到 `installRenderHelpers` 函数：

```js
export function installRenderHelpers (target: any) {
  target._o = markOnce
  target._n = toNumber
  target._s = toString
  target._l = renderList
  target._t = renderSlot
  target._q = looseEqual
  target._i = looseIndexOf
  target._m = renderStatic
  target._f = resolveFilter
  target._k = checkKeyCodes
  target._b = bindObjectProps
  target._v = createTextVNode
  target._e = createEmptyVNode
  target._u = resolveScopedSlots
  target._g = bindObjectListeners
}
```

以上代码就是 `installRenderHelpers` 函数的源码，可以发现，这个函数的作用就是在 `Vue.prototype` 上添加一系列方法，这些方法的作用大家暂时还不需要关心，后面都会讲解到。

`renderMixin` 方法在执行完 `installRenderHelpers` 函数之后，又在 `Vue.prototype` 上添加了两个方法，分别是：`$nextTick` 和 `_render`，最终经过 `renderMixin` 之后，`Vue.prototype` 又被添加了如下方法：

```js
// installRenderHelpers 函数中
Vue.prototype._o = markOnce
Vue.prototype._n = toNumber
Vue.prototype._s = toString
Vue.prototype._l = renderList
Vue.prototype._t = renderSlot
Vue.prototype._q = looseEqual
Vue.prototype._i = looseIndexOf
Vue.prototype._m = renderStatic
Vue.prototype._f = resolveFilter
Vue.prototype._k = checkKeyCodes
Vue.prototype._b = bindObjectProps
Vue.prototype._v = createTextVNode
Vue.prototype._e = createEmptyVNode
Vue.prototype._u = resolveScopedSlots
Vue.prototype._g = bindObjectListeners

Vue.prototype.$nextTick = function (fn: Function) {}
Vue.prototype._render = function (): VNode {}
```
至此，`instance/index.js` 文件中的代码就运行完毕了（注意：所谓的运行，是指执行 `npm run dev` 命令时构建的运行）。我们大概了解了每个 `*Mixin` 方法的作用其实就是包装 `Vue.prototype`，在其上挂载一些属性和方法，下面我们要做一件很重要的事情，就是将上面的内容集中合并起来，放到一个单独的地方，便于以后查看，我将它们整理到了这里：[附录/Vue 构造函数整理-原型](../appendix/vue-prototype.md)，这样当我们在后面详细讲解的时候，提到某个方法你就可以迅速定位它的位置，以便于保持我们思路的清晰。

## Vue 构造函数的静态属性和方法（全局API）

到目前为止，`core/instance/index.js` 文件，也就是 `Vue` 的出生文件的代码我们就看完了，按照之前我们寻找 `Vue` 构造函数时的文件路径回溯，下一个我们要看的文件应该就是 `core/index.js` 文件，这个文件将 `Vue` 从 `core/instance/index.js` 文件中导入了进来，我们打开 `core/index.js` 文件，下面是其全部的代码，同样很简短易看：

```js
// 从 Vue 的出生文件导入 Vue
import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

// 将 Vue 构造函数作为参数，传递给 initGlobalAPI 方法，该方法来自 ./global-api/index.js 文件
initGlobalAPI(Vue)

// 在 Vue.prototype 上添加 $isServer 属性，该属性代理了来自 core/util/env.js 文件的 isServerRendering 方法
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

// 在 Vue.prototype 上添加 $ssrContext 属性
Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

// Vue.version 存储了当前 Vue 的版本号
Vue.version = '__VERSION__'

// 导出 Vue
export default Vue
```

上面的代码中，首先从 `Vue` 的出生文件，也就是 `instance/index.js` 文件导入 `Vue`，然后分别从三个文件导入了三个变量，如下：

```js
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'
```

其中 `initGlobalAPI` 是一个函数，并且以 `Vue` 构造函数作为参数进行调用：

```js
initGlobalAPI(Vue)
```

然后在 `Vue.prototype` 上分别添加了两个只读的属性，分别是：`$isServer` 和 `$ssrContext`。接着又在 `Vue` 构造函数上定义了 `FunctionalRenderContext` 静态属性，并且 `FunctionalRenderContext` 属性的值为来自 `core/vdom/create-functional-component.js` 文件的 `FunctionalRenderContext`，之所以在 `Vue` 构造函数上暴露该属性，是为了在 `ssr` 中使用它。

最后，在 `Vue` 构造函数上添加了一个静态属性 `version`，存储了当前 `Vue` 的版本值，但是这里的 `'__VERSION__'` 是什么鬼？打开 `scripts/config.js` 文件，找到 `genConfig` 方法，其中有这么一句话：`__VERSION__: version`。这句话被写在了 `rollup` 的 `replace` 插件中，也就是说，`__VERSION__` 最终将被 `version` 的值替换，而 `version` 的值就是 `Vue` 的版本号。

我们再回过头来看看这句代码：

```js
initGlobalAPI(Vue)
```

大家应该可以猜个大概，这看上去像是在 `Vue` 上添加一些全局的API，实际上就是这样的，这些全局API以静态属性和方法的形式被添加到 `Vue` 构造函数上，打开 `src/core/global-api/index.js` 文件找到 `initGlobalAPI` 方法，我们来看看 `initGlobalAPI` 方法都做了什么。

首先是这样一段代码：

```js
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)
```

这段代码的作用是在 `Vue` 构造函数上添加 `config` 属性，这个属性的添加方式类似我们前面看过的 `$data` 以及 `$props`，也是一个只读的属性，并且当你试图设置其值时，在非生产环境下会给你一个友好的提示。

那 `Vue.config` 的值是什么呢？在 `src/core/global-api/index.js` 文件的开头有这样一句：

```js
import config from '../config'
```

所以 `Vue.config` 代理的是从 `core/config.js` 文件导出的对象。

接着是这样一段代码：

```js
// exposed util methods.
// NOTE: these are not considered part of the public API - avoid relying on
// them unless you are aware of the risk.
Vue.util = {
	warn,
	extend,
	mergeOptions,
	defineReactive
}
```

在 `Vue` 上添加了 `util` 属性，这是一个对象，这个对象拥有四个属性分别是：`warn`、`extend`、`mergeOptions` 以及 `defineReactive`。这四个属性来自于 `core/util/index.js` 文件。

这里有一段注释，大概意思是 `Vue.util` 以及 `util` 下的四个方法都不被认为是公共API的一部分，要避免依赖他们，但是你依然可以使用，只不过风险你要自己控制。并且，在官方文档上也并没有介绍这个全局API，所以能不用尽量不要用。

然后是这样一段代码：

```js
Vue.set = set
Vue.delete = del
Vue.nextTick = nextTick

Vue.options = Object.create(null)
```

这段代码比较简单，在 `Vue` 上添加了四个属性分别是 `set`、`delete`、`nextTick` 以及 `options`，这里要注意的是 `Vue.options`，现在它还只是一个空的对象，通过 `Object.create(null)` 创建。

不过接下来，`Vue.options` 就不是一个空的对象了，因为下面这段代码：

```js
ASSET_TYPES.forEach(type => {
	Vue.options[type + 's'] = Object.create(null)
})

// this is used to identify the "base" constructor to extend all plain-object
// components with in Weex's multi-instance scenarios.
Vue.options._base = Vue

extend(Vue.options.components, builtInComponents)
```

上面的代码中，`ASSET_TYPES` 来自于 `shared/constants.js` 文件，打开这个文件，发现 `ASSET_TYPES` 是一个数组：

```js
export const ASSET_TYPES = [
  'component',
  'directive',
  'filter'
]
```

所以当下面这段代码执行完后：

```js
ASSET_TYPES.forEach(type => {
	Vue.options[type + 's'] = Object.create(null)
})

// this is used to identify the "base" constructor to extend all plain-object
// components with in Weex's multi-instance scenarios.
Vue.options._base = Vue
```

`Vue.options` 将变成这样：

```js
Vue.options = {
	components: Object.create(null),
	directives: Object.create(null),
	filters: Object.create(null),
	_base: Vue
}
```

紧接着，是这句代码：

```js
extend(Vue.options.components, builtInComponents)
```

`extend` 来自于 `shared/util.js` 文件，可以在 [附录/shared/util.js 文件工具方法全解](../appendix/shared-util.md) 中查看其作用，总之这句代码的意思就是将 `builtInComponents` 的属性混合到 `Vue.options.components` 中，其中 `builtInComponents` 来自于 `core/components/index.js` 文件，该文件如下：

```js
import KeepAlive from './keep-alive'

export default {
  KeepAlive
}
```

所以最终 `Vue.options.components` 的值如下：

```js
Vue.options.components = {
	KeepAlive
}
```

那么到现在为止，`Vue.options` 已经变成了这样：

```js
Vue.options = {
	components: {
		KeepAlive
	},
	directives: Object.create(null),
	filters: Object.create(null),
	_base: Vue
}
```

我们继续看代码，在 `initGlobalAPI` 方法的最后部分，以 `Vue` 为参数调用了四个 `init*` 方法：

```js
initUse(Vue)
initMixin(Vue)
initExtend(Vue)
initAssetRegisters(Vue)
```

这四个方法从上至下分别来自于 `global-api/use.js`、`global-api/mixin.js`、`global-api/extend.js` 以及 `global-api/assets.js` 这四个文件，我们不着急，一个一个慢慢地看，先打开 `global-api/use.js` 文件，我们发现这个文件只有一个 `initUse` 方法，如下：

```js
/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    // ...
  }
}
```

该方法的作用是在 `Vue` 构造函数上添加 `use` 方法，也就是传说中的 `Vue.use` 这个全局API，这个方法大家应该不会陌生，用来安装 `Vue` 插件。

再打开 `global-api/mixin.js` 文件，这个文件更简单，全部代码如下：

```js
/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
```

其中，`initMixin` 方法的作用是，在 `Vue` 上添加 `mixin` 这个全局API。

再打开 `global-api/extend.js` 文件，找到 `initExtend` 方法，如下：

```js
export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   */
  Vue.extend = function (extendOptions: Object): Function {
    // ...
  }
}
```

`initExtend` 方法在 `Vue` 上添加了 `Vue.cid` 静态属性，和 `Vue.extend` 静态方法。

最后一个是 `initAssetRegisters`，我们打开 `global-api/assets.js` 文件，找到 `initAssetRegisters` 方法如下：

```js
export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      // ......
    }
  })
}
```

其中，`ASSET_TYPES` 我们已经见过了，它在 `shared/constants.js` 文件中，长成这样：

```js
export const ASSET_TYPES = [
  'component',
  'directive',
  'filter'
]
```

所以，最终经过 `initAssetRegisters` 方法，`Vue` 又多了三个静态方法：

```js
Vue.component
Vue.directive
Vue.filter
```

这三个静态方法大家都不陌生，分别用来全局注册组件，指令和过滤器。

这样，`initGlobalAPI` 方法的全部功能我们就介绍完毕了，它的作用就像它的名字一样，是在 `Vue` 构造函数上添加全局的API，类似整理 `Vue.prototype` 上的属性和方法一样，我们同样对 `Vue` 静态属性和方法做一个整理，将它放到 [附录/Vue 构造函数整理-全局API](../appendix/vue-global-api.md) 中，便于以后查阅。

至此，对于 `core/index.js` 文件的作用我们也大概清楚了，在这个文件里，它首先将核心的 `Vue`，也就是在 `core/instance/index.js` 文件中的 `Vue`，也可以说是原型被包装(添加属性和方法)后的 `Vue` 导入，然后使用 `initGlobalAPI` 方法给 `Vue` 添加静态方法和属性，除此之外，在这个文件里，也对原型进行了修改，为其添加了两个属性：`$isServer` 和 `$ssrContext`，最后添加了 `Vue.version` 属性并导出了 `Vue`。

## Vue 平台化的包装

现在，在我们弄清 `Vue` 构造函数的过程中已经看了两个主要的文件，分别是：`core/instance/index.js` 文件以及 `core/index.js` 文件，前者是 `Vue` 构造函数的定义文件，我们一直都叫其 `Vue` 的出生文件，主要作用是定义 `Vue` 构造函数，并对其原型添加属性和方法，即实例属性和实例方法。后者的主要作用是，为 `Vue` 添加全局的API，也就是静态的方法和属性。这两个文件有个共同点，就是它们都在 `core` 目录下，我们在介绍 `Vue` 项目目录结构的时候说过：`core` 目录存放的是与平台无关的代码，所以无论是 `core/instance/index.js` 文件还是 `core/index.js` 文件，它们都在包装核心的 `Vue`，且这些包装是与平台无关的。但是，`Vue` 是一个 `Multi-platform` 的项目（web和weex），不同平台可能会内置不同的组件、指令，或者一些平台特有的功能等等，那么这就需要对 `Vue` 根据不同的平台进行平台化地包装，这就是接下来我们要看的文件，这个文件也出现在我们寻找 `Vue` 构造函数的路线上，它就是：`platforms/web/runtime/index.js` 文件。

在看这个文件之前，大家可以先打开 `platforms` 目录，可以发现有两个子目录 `web` 和 `weex`。这两个子目录的作用就是分别为相应的平台对核心的 `Vue` 进行包装的。而我们所要研究的 `web` 平台，就在 `web` 这个目录里。

接下来，我们就打开 `platforms/web/runtime/index.js` 文件，看一看里面的代码，这个文件的一开始，是一大堆 `import` 语句，其中就包括从 `core/index.js` 文件导入 `Vue` 的那句。

在 `import` 语句下面是这样一段代码：

```js
// install platform specific utils
Vue.config.mustUseProp = mustUseProp
Vue.config.isReservedTag = isReservedTag
Vue.config.isReservedAttr = isReservedAttr
Vue.config.getTagNamespace = getTagNamespace
Vue.config.isUnknownElement = isUnknownElement
```

大家还记得 `Vue.config` 吗？其代理的值是从 `core/config.js` 文件导出的对象，这个对象最开始长成这样：

```js
Vue.config = {
  optionMergeStrategies: Object.create(null),
  silent: false,
  productionTip: process.env.NODE_ENV !== 'production',
  devtools: process.env.NODE_ENV !== 'production',
  performance: false,
  errorHandler: null,
  warnHandler: null,
  ignoredElements: [],
  keyCodes: Object.create(null),
  isReservedTag: no,
  isReservedAttr: no,
  isUnknownElement: no,
  getTagNamespace: noop,
  parsePlatformTagName: identity,
  mustUseProp: no,
  _lifecycleHooks: LIFECYCLE_HOOKS
}
```

我们可以看到，从 `core/config.js` 文件导出的 `config` 对象，大部分属性都是初始化了一个初始值，并且我们在 `core/config.js` 文件中能看到很多这样的注释，如下图：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-09-06-090635.jpg)

`This is platform-dependent and may be overwritten.`，这句话的意思是，这个配置是与平台有关的，很可能会被覆盖掉。这个时候我们再回来看这段代码：

```js
// install platform specific utils
Vue.config.mustUseProp = mustUseProp
Vue.config.isReservedTag = isReservedTag
Vue.config.isReservedAttr = isReservedAttr
Vue.config.getTagNamespace = getTagNamespace
Vue.config.isUnknownElement = isUnknownElement
```

其实这就是在覆盖默认导出的 `config` 对象的属性，注释已经写得很清楚了，安装平台特定的工具方法，至于这些东西的作用这里我们暂且不说，你只要知道它在干嘛即可。

接着是这两句代码：

```js
// install platform runtime directives & components
extend(Vue.options.directives, platformDirectives)
extend(Vue.options.components, platformComponents)
```

安装特定平台运行时的指令和组件，大家还记得 `Vue.options` 长什么样吗？在执行这两句代码之前，它长成这样：

```js
Vue.options = {
	components: {
		KeepAlive
	},
	directives: Object.create(null),
	filters: Object.create(null),
	_base: Vue
}
```

`extend` 方法我们见过，这里就不说明其作用了，可以查看 [附录/shared/util.js 文件工具方法全解](../appendix/shared-util.md)，那么经过这两句代码之后的 `Vue.options` 长什么样呢？要想知道这个问题，我们就要知道 `platformDirectives` 和 `platformComponents` 长什么样。

根据文件开头的 `import` 语句：

```js
import platformDirectives from './directives/index'
import platformComponents from './components/index'
```

我们知道，这两个变量来自于 `runtime/directives/index.js` 文件和 `runtime/components/index.js` 文件，我们先打开 `runtime/directives/index.js` 文件，下面是其全部代码：

```js
import model from './model'
import show from './show'

export default {
  model,
  show
}
```

也就是说，`platformDirectives` 是：

```js
platformDirectives = {
  model,
  show
}
```

所以，经过：

```js
extend(Vue.options.directives, platformDirectives)
```

这句代码之后，`Vue.options` 将变为：

```js
Vue.options = {
	components: {
		KeepAlive
	},
	directives: {
		model,
		show
	},
	filters: Object.create(null),
	_base: Vue
}
```

同样的道理，下面是 `runtime/components/index.js` 文件全部的代码：

```js
import Transition from './transition'
import TransitionGroup from './transition-group'

export default {
  Transition,
  TransitionGroup
}
```

所以 `platformComponents` 的值为：

```js
platformComponents = {
  Transition,
  TransitionGroup
}
```

那么经过：

```js
extend(Vue.options.components, platformComponents)
```

之后，`Vue.options` 将变为：

```js
Vue.options = {
	components: {
		KeepAlive,
		Transition,
		TransitionGroup
	},
	directives: {
		model,
		show
	},
	filters: Object.create(null),
	_base: Vue
}
```

这样，这两句代码的目的我们就搞清楚了，其作用是在 `Vue.options` 上添加 `web` 平台运行时的特定组件和指令。

我们继续往下看代码，接下来是这段：

```js
// install platform patch function
Vue.prototype.__patch__ = inBrowser ? patch : noop

// public mount method
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}
```

首先在 `Vue.prototype` 上添加 `__patch__` 方法，如果在浏览器环境运行的话，这个方法的值为 `patch` 函数，否则是一个空函数 `noop`。然后又在 `Vue.prototype` 上添加了 `$mount` 方法，我们暂且不关心 `$mount` 方法的内容和作用。

再往下的一段代码是 `vue-devtools` 的全局钩子，它被包裹在 `setTimeout` 中，最后导出了 `Vue`。

现在我们就看完了 `platforms/web/runtime/index.js` 文件，该文件的作用是对 `Vue` 进行平台化地包装：

* 设置平台化的 `Vue.config`。
* 在 `Vue.options` 上混合了两个指令(`directives`)，分别是 `model` 和 `show`。
* 在 `Vue.options` 上混合了两个组件(`components`)，分别是 `Transition` 和 `TransitionGroup`。
* 在 `Vue.prototype` 上添加了两个方法：`__patch__` 和 `$mount`。

在经过这个文件之后，`Vue.options` 以及 `Vue.config` 和 `Vue.prototype` 都有所变化，我们把这些变化更新到对应的 `附录` 文件里，都可以查看的到。

## with compiler

在看完 `runtime/index.js` 文件之后，其实 `运行时` 版本的 `Vue` 构造函数就已经“成型了”。我们可以打开 `entry-runtime.js` 这个入口文件，这个文件只有两行代码：

```js
import Vue from './runtime/index'

export default Vue
```

可以发现，`运行时` 版的入口文件，导出的 `Vue` 就到 `./runtime/index.js` 文件为止。然而我们所选择的并不仅仅是运行时版，而是完整版的 `Vue`，入口文件是 `entry-runtime-with-compiler.js`，我们知道完整版和运行时版的区别就在于 `compiler`，所以其实在我们看这个文件的代码之前也能够知道这个文件的作用：*就是在运行时版的基础上添加 `compiler`*，对没错，这个文件就是干这个的，接下来我们就看看它是怎么做的，打开 `entry-runtime-with-compiler.js` 文件：

```js
// ... 其他 import 语句

// 导入 运行时 的 Vue
import Vue from './runtime/index'

// ... 其他 import 语句

// 从 ./compiler/index.js 文件导入 compileToFunctions
import { compileToFunctions } from './compiler/index'

// 根据 id 获取元素的 innerHTML
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 使用 mount 变量缓存 Vue.prototype.$mount 方法
const mount = Vue.prototype.$mount
// 重写 Vue.prototype.$mount 方法
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // ... 函数体省略
}

/**
 * 获取元素的 outerHTML
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

// 在 Vue 上添加一个全局API `Vue.compile` 其值为上面导入进来的 compileToFunctions
Vue.compile = compileToFunctions

// 导出 Vue
export default Vue
```

上面代码是简化过的，但是保留了所有重要的部分，该文件的开始是一堆 `import` 语句，其中重要的两句 `import` 语句就是上面代码中出现的那两句，一句是导入运行时的 `Vue`，一句是从 `./compiler/index.js` 文件导入 `compileToFunctions`，并且在倒数第二句代码将其添加到 `Vue.compile` 上。

然后定义了一个函数 `idToTemplate`，这个函数的作用是：获取拥有指定 `id` 属性的元素的 `innerHTML`。

之后缓存了运行时版 `Vue` 的 `Vue.prototype.$mount` 方法，并且进行了重写。

接下来又定义了 `getOuterHTML` 函数，用来获取一个元素的 `outerHTML`。

这个文件运行下来，对 `Vue` 的影响有两个，第一个影响是它重写了 `Vue.prototype.$mount` 方法；第二个影响是添加了 `Vue.compile` 全局API，目前我们只需要获取这些信息就足够了，我们把这些影响同样更新到 `附录` 对应的文件中，也都可以查看的到。

到这里，`Vue` 神秘面具下真实的样子基本已经展现出来了。现在深呼吸，继续我们的探索吧！
