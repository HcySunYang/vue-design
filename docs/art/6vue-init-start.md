# Vue 的初始化之开篇

## 用于初始化的最终选项 $options

在 [以一个例子为线索](./3vue-example.md) 一节中，我们写了一个很简单的例子，这个例子如下：

```js
var vm = new Vue({
    el: '#app',
    data: {
        test: 1
    }
})
```

我们以这个例子为线索开始了对 `Vue` 代码的讲解，我们知道了在实例化 `Vue` 实例的时候，`Vue.prototype._init` 方法被第一个执行，这个方法定义在 `src/core/instance/init.js` 文件中，在分析 `_init` 方法的时候我们遇到了下面的代码：

```js
vm.$options = mergeOptions(
    resolveConstructorOptions(vm.constructor),
    options || {},
    vm
)
```

正是因为上面的代码，使得我们花了大篇章来讲解其内部实现和运作，也就是 [Vue选项的规范化](./vue-normalize.md) 和 [Vue选项的合并](./vue-normalize.md) 这两节所介绍的内容。现在我们已经知道了 `mergeOptions` 函数是如何对父子选项进行合并处理的，也知道了它的作用。

我们打开 `core/util/options.js` 文件，找到 `mergeOptions` 函数，看其最后一句代码：

```js
return options
```

这说明 `mergeOptions` 函数最终将合并处理后的选项返回，并以该返回值作为 `vm.$options` 的值。`vm.$options` 在 `Vue` 的官方文档中是可以找到的，它作为实例属性暴露给开发者，那么现在你应该知道 `vm.$options` 到底是什么了。并且看文档的时候你应该更能够理解其作用，比如官方文档是这样介绍 `$options` 实例属性的：

> 用于当前 `Vue` 实例的初始化选项。需要在选项中包含自定义属性时会有用处

并且给了一个例子，如下：

```js
new Vue({
  customOption: 'foo',
  created: function () {
    console.log(this.$options.customOption) // => 'foo'
  }
})
```

上面的例子中，在创建 `Vue` 实例的时候传递了一个自定义选项：`customOption`，在之后的代码中我们可以通过 `this.$options.customOption` 进行访问。那原理其实就是使用 `mergeOptions` 函数对自定义选项进行合并处理，由于没有指定 `customOption` 选项的合并策略，所以将会使用默认的策略函数 `defaultStrat`。最终效果就是你初始化的值是什么，得到的就是什么。

另外，`Vue` 也提供了 `Vue.config.optionMergeStrategies` 全局配置，大家也可以在官方文档中找到，我们知道这个对象其实就是选项合并中的策略对象，所以我们可以通过他指定某一个选项的合并策略，常用于指定自定义选项的合并策略，比如我们给 `customOption` 选项指定一个合并策略，只需要在 `Vue.config.optionMergeStrategies` 上添加与选项同名的策略函数即可：

```js
Vue.config.optionMergeStrategies.customOption = function (parentVal, childVal) {
    return parentVal ? (parentVal + childVal) : childVal
}
```

如上代码中，我们添加了自定义选项 `customOption` 的合并策略，其策略为：如果没有 `parentVal` 则直接返回 `childVal`，否则返回两者的和。

所以如下代码：

```js
// 创建子类
const Sub = Vue.extend({
    customOption: 1
})
// 以子类创建实例
const v = new Sub({
    customOption: 2,
    created () {
        console.log(this.$options.customOption) // 3
    }
})
```

最终，在实例的 `created` 方法中将打印数字 `3`。上面的例子很简单，没有什么实际作用，但这为我们提供了自定义选项的机会，这其实是非常有用的。

现在我们需要回到正题上了，还是拿我们的例子，如下：

```js
var vm = new Vue({
    el: '#app',
    data: {
        test: 1
    }
})
```

这个时候 `mergeOptions` 函数将会把 `Vue.options` 作为 父选项，把我们传递的实例选项作为子选项进行合并，合并的结果我们可以通过打印 `$options` 属性得知。其实我们前面已经分析过了，`el` 选项将使用默认合并策略合并，最终的值就是字符串 `'#app'`，而 `data` 选项将变成一个函数，且这个函数的执行结果就是合并后的数据，即： `{test: 1}`。

下面是 `vm.$options` 的截图：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-11-02-083231.jpg)

我们发现 `el` 确实还是原来的值，而 `data` 也确实变成了一个函数，并且这个函数就是我们之前遇到过的 `mergedInstanceDataFn`，除此之外我们还能看到其他合并后的选项，其中 `components`、`directives`、`filters` 以及 `_base` 是存在于 `Vue.options` 中的，这些是我们所知道的，至于 `render` 和 `staticRenderFns` 这两个选项是在将模板编译成渲染函数时添加上去的，我们后面会遇到。另外 `_parentElm` 和 `_refElm` 这两个选项是在为虚拟DOM创建组件实例时添加的，我们后面也会讲到，这里大家不需要关心，免得失去重点。

## 渲染函数的作用域代理

ok，现在我们已经足够了解 `vm.$options` 这个属性了，它才是用来做一系列初始化工作的最终选项，那么接下来我们就继续看 `_init` 方法中的代码，继续了解 `Vue` 的初始化工作。

`_init` 方法中，在经过 `mergeOptions` 合并处理选项之后，要执行的是下面这段代码：

```js
/* istanbul ignore else */
if (process.env.NODE_ENV !== 'production') {
    initProxy(vm)
} else {
    vm._renderProxy = vm
}
```

这段代码是一个判断分支，如果是非生产环境的话则执行 `initProxy(vm)` 函数，如果在生产环境则直接在实例上添加 `_renderProxy` 实例属性，该属性的值就是当前实例。

现在有一个问题需要大家思考一下，目前我们还没有看 `initProxy` 函数的具体内容，那么你能猜到 `initProxy` 函数的主要作用是什么吗？我可以直接告诉大家，这个函数的主要作用其实就是在实例对象 `vm` 上添加 `_renderProxy` 属性。为什么呢？因为生产环境和非生产环境下要保持功能一致。在上面的代码中生产环境下直接执行这句：

```js
vm._renderProxy = vm
```

那么可想而知，在非生产环境下也应该执行这句代码，但实际上却调用了 `initProxy` 函数，所以 `initProxy` 函数的作用之一必然也是在实例对象 `vm` 上添加 `_renderProxy` 属性，那么接下来我们就看看 `initProxy` 的内容，验证一下我们的判断，打开 `core/instance/proxy.js` 文件：

```js
/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap } from '../util/index'

// 声明 initProxy 变量
let initProxy

if (process.env.NODE_ENV !== 'production') {
  // ... 其他代码
  
  // 在这里初始化 initProxy
  initProxy = function initProxy (vm) {
    if (hasProxy) {
      // determine which proxy handler to use
      const options = vm.$options
      const handlers = options.render && options.render._withStripped
        ? getHandler
        : hasHandler
      vm._renderProxy = new Proxy(vm, handlers)
    } else {
      vm._renderProxy = vm
    }
  }
}

// 导出
export { initProxy }
```

上面的代码是简化后的，可以发现在文件的开头声明了 `initProxy` 变量，但并未初始化，所以目前 `initProxy` 还是 `undefined`，随后，在文件的结尾将 `initProxy` 导出，那么 `initProxy` 到底是什么呢？实际上变量 `initProxy` 的赋值是在 `if` 语句块内进行的，这个 `if` 语句块进行环境判断，如果是非生产环境的话，那么才会对 `initProxy` 变量赋值，也就是说在生产环境下我们导出的 `initProxy` 实际上就是 `undefined`。只有在非生产环境下导出的 `initProxy` 才会有值，其值就是这个函数：

```js
initProxy = function initProxy (vm) {
    if (hasProxy) {
        // determine which proxy handler to use
        const options = vm.$options
        const handlers = options.render && options.render._withStripped
        ? getHandler
        : hasHandler
        vm._renderProxy = new Proxy(vm, handlers)
    } else {
        vm._renderProxy = vm
    }
}
```

这个函数接收一个参数，实际就是 `Vue` 实例对象，我们先从宏观角度来看一下这个函数的作用是什么，可以发现，这个函数由 `if...else` 语句块组成，但无论走 `if` 还是 `else`，其最终的效果都是在 `vm` 对象上添加了 `_renderProxy` 属性，这就验证了我们之前的猜想。如果 `hasProxy` 为真则走 `if` 分支，对于 `hasProxy` 顾名思义，这是用来判断宿主环境是否支持 `js` 原生的 `Proxy` 特性的，如果发现 `Proxy` 存在，则执行：

```js
vm._renderProxy = new Proxy(vm, handlers)
```

如果不存在，那么和生产环境一样，直接赋值就可以了：

```js
vm._renderProxy = vm
```

所以我们发现 `initProxy` 的作用实际上就是对实例对象 `vm` 的代理，通过原生的 `Proxy` 实现。

另外 `hasProxy` 变量的定义也在当前文件中，代码如下：

```js
const hasProxy =
    typeof Proxy !== 'undefined' &&
    Proxy.toString().match(/native code/)
```

上面代码的作用是判断当前宿主环境是否支持原生 `Proxy`，相信大家都能看得懂，所以就不做过多解释，接下来我们就看看它是如何做代理的，并且有什么作用。

查看 `initProxy` 函数的 `if` 语句块，内容如下：

```js
initProxy = function initProxy (vm) {
    if (hasProxy) {
        // determine which proxy handler to use
        // options 就是 vm.$options 的引用
        const options = vm.$options
        // handlers 可能是 getHandler 也可能是 hasHandler
        const handlers = options.render && options.render._withStripped
            ? getHandler
            : hasHandler
        // 代理 vm 对象
        vm._renderProxy = new Proxy(vm, handlers)
    } else {
        // ...
    }
}
```

可以发现，如果 `Proxy` 存在，那么将会使用 `Proxy` 对 `vm` 做一层代理，代理对象赋值给 `vm._renderProxy`，所以今后对 `vm._renderProxy` 的访问，如果有代理那么就会被拦截。代理对象配置参数是 `handlers`，可以发现 `handlers` 既可能是 `getHandler` 又可能是 `hasHandler`，至于到底使用哪个，是由判断条件决定的：

```js
options.render && options.render._withStripped
```

如果上面的条件为真，则使用 `getHandler`，否则使用 `hasHandler`，判断条件要求 `options.render` 和 `options.render._withStripped` 必须都为真才行，我现在明确告诉大家 `options.render._withStripped` 这个属性只在测试代码中出现过，所以一般情况下这个条件都会为假，也就是使用 `hasHandler` 作为代理配置。

`hasHandler` 常量就定义在当前文件，如下：

```js
const hasHandler = {
    has (target, key) {
        // has 常量是真实经过 in 运算符得来的结果
        const has = key in target
        // 如果 key 在 allowedGlobals 之内，或者 key 是以下划线 _ 开头的字符串，则为真
        const isAllowed = allowedGlobals(key) || (typeof key === 'string' && key.charAt(0) === '_')
        // 如果 has 和 isAllowed 都为假，使用 warnNonPresent 函数打印错误
        if (!has && !isAllowed) {
            warnNonPresent(target, key)
        }
        return has || !isAllowed
    }
}
```

这里我假设大家都对 `Proxy` 的使用已经没有任何问题了，我们知道 `has` 可以拦截以下操作：

* 属性查询: foo in proxy
* 继承属性查询: foo in Object.create(proxy)
* with 检查: with(proxy) { (foo); }
* Reflect.has()

其中关键点就在 `has` 可以拦截 `with` 语句块里对变量的访问，后面我们会讲到。

`has` 函数内出现了两个函数，分别是 `allowedGlobals` 以及 `warnNonPresent`，这两个函数也是定义在当前文件中，首先我们看一下 `allowedGlobals`：

```js
const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
    'require' // for Webpack/Browserify
)
```

可以看到 `allowedGlobals` 实际上是通过 `makeMap` 生成的函数，所以 `allowedGlobals` 函数的作用是判断给定的 `key` 是否出现在上面字符串中定义的关键字中的。这些关键字都是在 `js` 中可以全局访问的。

`warnNonPresent` 函数如下：

```js
const warnNonPresent = (target, key) => {
    warn(
        `Property or method "${key}" is not defined on the instance but ` +
        'referenced during render. Make sure that this property is reactive, ' +
        'either in the data option, or for class-based components, by ' +
        'initializing the property. ' +
        'See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
        target
    )
}
```

这个函数就是通过 `warn` 打印一段警告信息，警告信息提示你“在渲染的时候引用了 `key`，但是在实例对象上并没有定义 `key` 这个属性或方法”。其实我们很容易就可以看到这个信息，比如下面的代码：

```js
const vm = new Vue({
    el: '#app',
    template: '<div>{{a}}</div>',
    data: {
        test: 1
    }
})
```

大家注意，在模板中我们使用 `a`，但是在 `data` 属性中并没有定义这个属性，这个时候我们就能够得到以上报错信息：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-11-03-073757.jpg)

大家可能比较疑惑的是为什么会这样，其实我们后面讲到渲染函数的时候你自然就知道了，不过现在大家可以先看一下，打开 `core/instance/render.js` 文件，找到 `Vue.prototype._render` 方法，里面有这样的代码：

```js
vnode = render.call(vm._renderProxy, vm.$createElement)
```

可以发现，调用 `render` 函数的时候，使用 `call` 方法指定了函数的执行环境为 `vm._renderProxy`，渲染函数长成什么样呢？还是以上面的例子为例，我们可以通过打印 `vm.$options.render` 查看，所以它长成这样：

```js
vm.$options.render = function () {
    // render 函数的 this 指向实例的 _renderProxy
    with(this){
        return _c('div', [_v(_s(a))])   // 在这里访问 a，相当于访问 vm._renderProxy.a
    }
}
```

从上面的代码可以发现，显然函数使用 `with` 语句块指定了内部代码的执行环境为 `this`，由于 `render` 函数调用的时候使用 `call` 指定了其 `this` 指向为 `vm._renderProxy`，所以 `with` 语句块内代码的执行环境就是 `vm._renderProxy`，所以在 `with` 语句块内访问 `a` 就相当于访问 `vm._renderProxy` 的 `a` 属性，前面我们提到过 `with` 语句块内访问变量将会被 `Proxy` 的 `has` 代理所拦截，所以自然就执行了 `has` 函数内的代码。最终通过 `warnNonPresent` 打印警告信息给我们，所以这个代理的作用就是为了在开发阶段给我们一个友好而准确的提示。

我们理解了 `hasHandler`，但是还有一个 `getHandler`，这个代理将会在判断条件：

```js
options.render && options.render._withStripped
```

为真的情况下被使用，那这个条件什么时候成立呢？其实 `_withStripped` 只在 `test/unit/features/instance/render-proxy.spec.js` 文件中出现过，该文件有这样一段代码：

```js
it('should warn missing property in render fns without `with`', () => {
    const render = function (h) {
        // 这里访问了 a
        return h('div', [this.a])
    }
    // 在这里将 render._withStripped 设置为 true
    render._withStripped = true
    new Vue({
        render
    }).$mount()
    // 应该得到警告
    expect(`Property or method "a" is not defined`).toHaveBeenWarned()
})
```

这个时候就会触发 `getHandler` 设置的 `get` 拦截，`getHandler` 代码如下：

```js
const getHandler = {
    get (target, key) {
        if (typeof key === 'string' && !(key in target)) {
            warnNonPresent(target, key)
        }
        return target[key]
    }
}
```
 
其最终实现的效果无非就是检测到访问的属性不存在就给你一个警告。但我们也提到了，只有当 `render` 函数的 `_withStripped` 为真的时候，才会给出警告，但是 `render._withStripped` 又只有写测试的时候出现过，也就是说需要我们手动设置其为 `true` 才会得到提示，否则是得不到的，比如：

```js
const render = function (h) {
    return h('div', [this.a])
}

var vm = new Vue({
    el: '#app',
    render,
    data: {
        test: 1
    }
})
```

上面的代码由于 `render` 函数是我们手动书写的，所以 `render` 函数并不会被包裹在 `with` 语句块内，当然也就触发不了 `has` 拦截，但是由于 `render._withStripped` 也未定义，所以也不会被 `get` 拦截，那这个时候我们虽然访问了不存在的 `this.a`，但是却得不到警告，想要得到警告我们需要手动设置 `render._withStripped` 为 `true`：

```js
const render = function (h) {
    return h('div', [this.a])
}
render._withStripped = true

var vm = new Vue({
    el: '#app',
    render,
    data: {
        test: 1
    }
})
```

为什么会这么设计呢？因为在使用 `webpack` 配合 `vue-loader` 的环境中， `vue-loader` 会借助 [`vuejs@component-compiler-utils`](https://github.com/vuejs/component-compiler-utils) 将 `template` 编译为不使用 `with` 语句包裹的遵循严格模式的 JavaScript，并为编译后的 `render` 方法设置 `render._withStripped = true`。在不使用 `with` 语句的 `render` 方法中，模板内的变量都是通过属性访问操作 `vm['a']` 或 `vm.a` 的形式访问的，从前文中我们了解到 `Proxy` 的 `has` 无法拦截属性访问操作，所以这里需要使用 `Proxy` 中可以拦截到属性访问的 `get`，同时也省去了 `has` 中的全局变量检查(全局变量的访问不会被 `get` 拦截)。

现在，我们基本知道了 `initProxy` 的目的，就是设置渲染函数的作用域代理，其目的是为我们提供更好的提示信息。但是我们忽略了一些细节没有讲清楚，回到下面这段代码：

```js
// has 变量是真实经过 in 运算符得来的结果
const has = key in target
// 如果 key 在 allowedGlobals 之内，或者 key 是以下划线 _ 开头的字符串，则为真
const isAllowed = allowedGlobals(key) || (typeof key === 'string' && key.charAt(0) === '_')
// 如果 has 和 isAllowed 都为假，使用 warnNonPresent 函数打印错误
if (!has && !isAllowed) {
    warnNonPresent(target, key)
}
```

上面这段代码中的 `if` 语句的判断条件是 `(!has && !isAllowed)`，其中 `!has` 我们可以理解为**你访问了一个没有定义在实例对象上(或原型链上)的属性**，所以这个时候提示错误信息是合理，但是即便 `!has` 成立也不一定要提示错误信息，因为必须要满足 `!isAllowed`，也就是说当你访问了一个**虽然不在实例对象上(或原型链上)的属性，但如果你访问的是全局对象**那么也是被允许的。这样我们就可以在模板中使用全局对象了，如：

```html
<template>
  {{Number(b) + 2}}
</template>
```

其中 `Number` 为全局对象，如果去掉 `!isAllowed` 这个判断条件，那么上面模板的写法将会得到警告信息。除了允许使用全局对象之外，还允许以 `_` 开头的属性，这么做是由于渲染函数中会包含很多以 `_` 开头的内部方法，如之前我们查看渲染函数时遇到的 `_c`、`_v` 等等。

最后对于 `proxy.js` 文件内的代码，还有一段是我们没有讲过的，就是下面这段：

```js
if (hasProxy) {
    // isBuiltInModifier 函数用来检测是否是内置的修饰符
    const isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact')
    // 为 config.keyCodes 设置 set 代理，防止内置修饰符被覆盖
    config.keyCodes = new Proxy(config.keyCodes, {
        set (target, key, value) {
            if (isBuiltInModifier(key)) {
                warn(`Avoid overwriting built-in modifier in config.keyCodes: .${key}`)
                return false
            } else {
                target[key] = value
                return true
            }
        }
    })
}
```

上面的代码首先检测宿主环境是否支持 `Proxy`，如果支持的话才会执行里面的代码，内部的代码首先使用 `makeMap` 函数生成一个 `isBuiltInModifier` 函数，该函数用来检测给定的值是否是内置的事件修饰符，我们知道在 `Vue` 中我们可以使用事件修饰符很方便地做一些工作，比如阻止默认事件等。

然后为 `config.keyCodes` 设置了 `set` 代理，其目的是防止开发者在自定义键位别名的时候，覆盖了内置的修饰符，比如：

```js
Vue.config.keyCodes.shift = 16
```

由于 `shift` 是内置的修饰符，所以上面这句代码将会得到警告。

## 初始化之 initLifecycle

`_init` 函数在执行完 `initProxy` 之后，执行的就是 `initLifecycle` 函数：

```js
vm._self = vm
initLifecycle(vm)
```

在 `initLifecycle` 函数执行之前，执行了 `vm._self = vm` 语句，这句话在 `Vue` 实例对象 `vm` 上添加了 `_self` 属性，指向真实的实例本身。注意 `vm._self` 和 `vm._renderProxy` 不同，首先在用途上来说寓意是不同的，另外 `vm._renderProxy` 有可能是一个代理对象，即 `Proxy` 实例。

接下来执行的才是 `initLifecycle` 函数，同时将当前 `Vue` 实例 `vm` 作为参数传递。打开 `core/instance/lifecycle.js` 文件找到 `initLifecycle` 函数，如下：

```js
export function initLifecycle (vm: Component) {
  // 定义 options，它是 vm.$options 的引用，后面的代码使用的都是 options 常量
  const options = vm.$options

  // locate first non-abstract parent
  let parent = options.parent
  if (parent && !options.abstract) {
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    parent.$children.push(vm)
  }

  vm.$parent = parent
  vm.$root = parent ? parent.$root : vm

  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}
```

上面代码是 `initLifecycle` 函数的全部内容，首先定义 `options` 常量，它是 `vm.$options` 的引用。接着将执行下面这段代码：

```js
// locate first non-abstract parent (查找第一个非抽象的父组件)
// 定义 parent，它引用当前实例的父实例
let parent = options.parent
// 如果当前实例有父组件，且当前实例不是抽象的
if (parent && !options.abstract) {
  // 使用 while 循环查找第一个非抽象的父组件
  while (parent.$options.abstract && parent.$parent) {
    parent = parent.$parent
  }
  // 经过上面的 while 循环后，parent 应该是一个非抽象的组件，将它作为当前实例的父级，所以将当前实例 vm 添加到父级的 $children 属性里
  parent.$children.push(vm)
}

// 设置当前实例的 $parent 属性，指向父级
vm.$parent = parent
// 设置 $root 属性，有父级就是用父级的 $root，否则 $root 指向自身
vm.$root = parent ? parent.$root : vm
```

上面代码的作用可以用一句话总结：*“将当前实例添加到父实例的 `$children` 属性里，并设置当前实例的 `$parent` 指向父实例”*。那么要实现这个目标首先要寻找到父级才行，那么父级的来源是哪里呢？就是这句话：

```js
// 定义 parent，它引用当前实例的父组件
let parent = options.parent
```

通过读取 `options.parent` 获取父实例，但是问题来了，我们知道 `options` 是 `vm.$options` 的引用，所以这里的 `options.parent` 相当于 `vm.$options.parent`，那么 `vm.$options.parent` 从哪里来？比如下面的例子：

```js
// 子组件本身并没有指定 parent 选项
var ChildComponent = {
  created () {
    // 但是在子组件中访问父实例，能够找到正确的父实例引用
    console.log(this.$options.parent)
  }
}

var vm = new Vue({
    el: '#app',
    components: {
      // 注册组件
      ChildComponent
    },
    data: {
        test: 1
    }
})
```

我们知道 `Vue` 给我们提供了 `parent` 选项，使得我们可以手动指定一个组件的父实例，但在上面的例子中，我们并没有手动指定 `parent` 选项，但是子组件依然能够正确地找到它的父实例，这说明 `Vue` 在寻找父实例的时候是自动检测的。那它是怎么做的呢？目前不准备给大家介绍，因为时机还不够成熟，现在讲大家很容易懵，不过可以给大家看一段代码，打开 `core/vdom/create-component.js` 文件，里面有一个函数叫做 `createComponentInstanceForVnode`，如下：

```js
export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
  parentElm?: ?Node,
  refElm?: ?Node
): Component {
  const vnodeComponentOptions = vnode.componentOptions
  const options: InternalComponentOptions = {
    _isComponent: true,
    parent,
    propsData: vnodeComponentOptions.propsData,
    _componentTag: vnodeComponentOptions.tag,
    _parentVnode: vnode,
    _parentListeners: vnodeComponentOptions.listeners,
    _renderChildren: vnodeComponentOptions.children,
    _parentElm: parentElm || null,
    _refElm: refElm || null
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  return new vnodeComponentOptions.Ctor(options)
}
```

这个函数是干什么的呢？我们知道当我们注册一个组件的时候，还是拿上面的例子，如下：

```js
// 子组件
var ChildComponent = {
  created () {
    console.log(this.$options.parent)
  }
}

var vm = new Vue({
    el: '#app',
    components: {
      // 注册组件
      ChildComponent
    },
    data: {
        test: 1
    }
})
```

上面的代码中，我们的子组件 `ChildComponent` 说白了就是一个 `json` 对象，或者叫做组件选项对象，在父组件的 `components` 选项中把这个子组件选项对象注册了进去，实际上在 `Vue` 内部，会首先以子组件选项对象作为参数通过 `Vue.extend` 函数创建一个子类出来，然后再通过实例化子类来创建子组件，而 `createComponentInstanceForVnode` 函数的作用，在这里大家就可以简单理解为实例化子组件，只不过这个过程是在虚拟DOM的 `patch` 算法中进行的，我们后边会详细去讲。我们看 `createComponentInstanceForVnode` 函数内部有这样一段代码：

```js
const options: InternalComponentOptions = {
  _isComponent: true,
  parent,
  propsData: vnodeComponentOptions.propsData,
  _componentTag: vnodeComponentOptions.tag,
  _parentVnode: vnode,
  _parentListeners: vnodeComponentOptions.listeners,
  _renderChildren: vnodeComponentOptions.children,
  _parentElm: parentElm || null,
  _refElm: refElm || null
}
```

这是实例化子组件时的组件选项，我们发现，第二个值就是 `parent`，那么这个 `parent` 是谁呢？它是 `createComponentInstanceForVnode` 函数的形参，所以我们需要找到 `createComponentInstanceForVnode` 函数是在哪里调用的，它的调用位置就在 `core/vdom/create-component.js` 文件内的 `componentVNodeHooks` 钩子对象的 `init` 钩子函数内，如下：

```js
// hooks to be invoked on component VNodes during patch
const componentVNodeHooks = {
  init (
    vnode: VNodeWithData,
    hydrating: boolean,
    parentElm: ?Node,
    refElm: ?Node
  ): ?boolean {
    if (!vnode.componentInstance || vnode.componentInstance._isDestroyed) {
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance,
        parentElm,
        refElm
      )
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    } else if (vnode.data.keepAlive) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    ...
  },

  insert (vnode: MountedComponentVNode) {
    ...
  },

  destroy (vnode: MountedComponentVNode) {
    ...
  }
}
```

在 `init` 函数内有这样一段代码：

```js
const child = vnode.componentInstance = createComponentInstanceForVnode(
  vnode,
  activeInstance,
  parentElm,
  refElm
)
```

第二个参数 `activeInstance` 就是我们要找的 `parent`，那么 `activeInstance` 是什么呢？根据文件顶部的 `import` 语句可知，`activeInstance` 来自于 `core/instance/lifecycle.js` 文件，也就是我们正在看的 `initLifecycle` 函数的上面，如下：

```js
export let activeInstance: any = null
```

这个变量将总是保存着当前正在渲染的实例的引用，所以它就是当前实例 `components` 下注册的子组件的父实例，所以 `Vue` 实际上就是这样做到自动侦测父级的。

这里大家尽量去理解一下，不过如果还是有点懵也没关系，随着我们对 `Vue` 的深入，慢慢的都会很好消化。上面我们解释了这么多，其实就是想说明白一件事，即 `initLifecycle` 函数内的代码中的 `options.parent` 的来历，它有值的原因。

所以现在我们初步知道了 `options.parent` 值的来历，且知道了它的值指向父实例，那么接下来我们继续看代码，还是这段代码：

```js
// 定义 parent，它引用当前实例的父组件
let parent = options.parent
// 如果当前实例有父组件，且当前实例不是抽象的
if (parent && !options.abstract) {
  // 使用 while 循环查找第一个非抽象的父组件
  while (parent.$options.abstract && parent.$parent) {
    parent = parent.$parent
  }
  // 经过上面的 while 循环后，parent 应该是一个非抽象的组件，将它作为当前实例的父级，所以将当前实例 vm 添加到父级的 $children 属性里
  parent.$children.push(vm)
}
```

拿到父实例 `parent` 之后，进入一个判断分支，条件是：`parent && !options.abstract`，即*父实例存在，且当前实例不是抽象的*，这里大家可能会有疑问：*什么是抽象的实例*？实际上 `Vue` 内部有一些选项是没有暴露给我们的，就比如这里的 `abstract`，通过设置这个选项为 `true`，可以指定该组件是抽象的，那么通过该组件创建的实例也都是抽象的，比如：

```js
AbsComponents = {
  abstract: true,
  created () {
    console.log('我是一个抽象的组件')
  }
}
```

抽象的组件有什么特点呢？一个最显著的特点就是它们一般不渲染真实DOM，这么说大家可能不理解，我举个例子大家就明白了，我们知道 `Vue` 内置了一些全局组件比如 `keep-alive` 或者 `transition`，我们知道这两个组件它是不会渲染DOM至页面的，但他们依然给我提供了很有用的功能。所以他们就是抽象的组件，我们可以查看一下它的源码，打开 `core/components/keep-alive.js` 文件，你能看到这样的代码：

```js
export default {
  name: 'keep-alive',
  abstract: true,
  ...
}
```

可以发现，它使用 `abstract` 选项来声明这是一个抽象组件。除了不渲染真实DOM，抽象组件还有一个特点，就是它们不会出现在父子关系的路径上。这么设计也是合理的，这是由它们的性质所决定的。

所以现在大家再回看这段代码：

```js
// locate first non-abstract parent (查找第一个非抽象的父组件)
// 定义 parent，它引用当前实例的父组件
let parent = options.parent
// 如果当前实例有父组件，且当前实例不是抽象的
if (parent && !options.abstract) {
  // 使用 while 循环查找第一个非抽象的父组件
  while (parent.$options.abstract && parent.$parent) {
    parent = parent.$parent
  }
  // 经过上面的 while 循环后，parent 应该是一个非抽象的组件，将它作为当前实例的父级，所以将当前实例 vm 添加到父级的 $children 属性里
  parent.$children.push(vm)
}

// 设置当前实例的 $parent 属性，指向父级
vm.$parent = parent
// 设置 $root 属性，有父级就是用父级的 $root，否则 $root 指向自身
vm.$root = parent ? parent.$root : vm
```

如果 `options.abstract` 为真，那说明当前实例是抽象的，所以并不会走 `if` 分支的代码，所以会跳过 `if` 语句块直接设置 `vm.$parent` 和 `vm.$root` 的值。跳过 `if` 语句块的结果将导致该抽象实例不会被添加到父实例的 `$children` 中。如果 `options.abstract` 为假，那说明当前实例不是抽象的，是一个普通的组件实例，这个时候就会走 `while` 循环，那么这个 `while` 循环是干嘛的呢？我们前面说过，抽象的组件是不能够也不应该作为父级的，所以 `while` 循环的目的就是沿着父实例链逐层向上寻找到第一个不抽象的实例作为 `parent`（父级）。并且在找到父级之后将当前实例添加到父实例的 `$children` 属性中，这样最终的目的就达成了。

在上面这段代码执行完毕之后，`initLifecycle` 函数还负责在当前实例上添加一些属性，即后面要执行的代码：

```js
vm.$children = []
vm.$refs = {}

vm._watcher = null
vm._inactive = null
vm._directInactive = false
vm._isMounted = false
vm._isDestroyed = false
vm._isBeingDestroyed = false
```

其中 `$children` 和 `$refs` 都是我们熟悉的实例属性，他们都在 `initLifecycle` 函数中被初始化，其中 `$children` 被初始化为一个数组，`$refs` 被初始化为一个空 `json` 对象，除此之外，还定义了一些内部使用的属性，大家先混个脸熟，在后面的分析中自然会知道他们的用途，但是不要忘了，既然这些属性是在 `initLifecycle` 函数中定义的，那么自然会与生命周期有关。这样 `initLifecycle` 函数我们就分析完毕了，我们回到 `_init` 函数，看看接下来要做的初始化工作是什么。


## 初始化之 initEvents

在 `initLifecycle` 函数之后，执行的就是 `initEvents`，它来自于 `core/instance/events.js` 文件，打开该文件找到 `initEvents` 方法，其内容很简短，如下：

```js
export function initEvents (vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}
```

首先在 `vm` 实例对象上添加两个实例属性 `_events` 和 `_hasHookEvent`，其中 `_events` 被初始化为一个空对象，`_hasHookEvent` 的初始值为 `false`。之后将执行这段代码：

```js
// init parent attached events
const listeners = vm.$options._parentListeners
if (listeners) {
  updateComponentListeners(vm, listeners)
}
```

大家肯定还是有这个疑问：`vm.$options._parentListeners` 这个 `_parentListeners` 是哪里来的？细心的同学可能已经注意到了，我们之前看过一个函数叫做 `createComponentInstanceForVnode`，他在 `core/vdom/create-component.js` 文件中，如下：

```js
export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
  parentElm?: ?Node,
  refElm?: ?Node
): Component {
  const vnodeComponentOptions = vnode.componentOptions
  const options: InternalComponentOptions = {
    _isComponent: true,
    parent,
    propsData: vnodeComponentOptions.propsData,
    _componentTag: vnodeComponentOptions.tag,
    _parentVnode: vnode,
    _parentListeners: vnodeComponentOptions.listeners,
    _renderChildren: vnodeComponentOptions.children,
    _parentElm: parentElm || null,
    _refElm: refElm || null
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  return new vnodeComponentOptions.Ctor(options)
}
```

我们发现 `_parentListeners` 也出现这里，也就是说在创建子组件实例的时候才会有这个参数选项，所以现在我们不做深入讨论，后面自然有机会。

## 初始化之 initRender

在 `initEvents` 的下面，执行的是 `initRender` 函数，该函数来自于 `core/instance/render.js` 文件，我们打开这个文件找到 `initRender` 函数，如下：

```js
export function initRender (vm: Component) {
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree
  const renderContext = parentVnode && parentVnode.context
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = emptyObject
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}
```

上面是 `initRender` 函数的全部代码，我们慢慢来看，首先在 `Vue` 实例对象上添加两个实例属性，即 `_vnode` 和 `_staticTrees`：

```js
vm._vnode = null // the root of the child tree
vm._staticTrees = null // v-once cached trees
```

并且这两个属性都被初始化为 `null`，它们会在合适的地方被赋值并使用，到时候我们再讲其作用，现在我们暂且不介绍这两个属性的作用，你只要知道这两句话仅仅是在当前实例对象上添加了两个属性就行了。

接着是这样一段代码：

```js
const options = vm.$options
const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree
const renderContext = parentVnode && parentVnode.context
vm.$slots = resolveSlots(options._renderChildren, renderContext)
vm.$scopedSlots = emptyObject
```

上面这段代码从表面上看很复杂，可以明确地告诉大家，如果你看懂了上面这段代码就意味着你已经知道了 `Vue` 是如何解析并处理 `slot` 的了。由于上面这段代码涉及内部选项比较多如：`options._parentVnode`、`options._renderChildren` 甚至 `parentVnode.context`，这些内容牵扯的东西比较多，现在大家对 `Vue` 的储备还不够，所以我们会在本节的最后阶段补讲，那个时候相信大家理解起来要容易多了。

不讲归不讲，但是有一些事儿还是要讲清楚的，比如上面这段代码无论它处理的是什么内容，其结果都是在 `Vue` 当前实例对象上添加了三个实例属性：

```js
vm.$vnode
vm.$slots
vm.$scopedSlots
```

我们把这些属性都整理到 [Vue实例的设计](../appendix/vue-ins.md) 中。

再往下是这段代码：

```js
// bind the createElement fn to this instance
// so that we get proper render context inside it.
// args order: tag, data, children, normalizationType, alwaysNormalize
// internal version is used by render functions compiled from templates
vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
// normalization is always applied for the public version, used in
// user-written render functions.
vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)
```

这段代码在 `Vue` 实例对象上添加了两个方法：`vm._c` 和 `vm.$createElement`，这两个方法实际上是对内部函数 `createElement` 的包装。其中 `vm.$createElement` 相信手写过渲染函数的同学都比较熟悉，如下代码：

```js
render: function (createElement) {
  return createElement('h2', 'Title')
}
```

我们知道，渲染函数的第一个参数是 `createElement` 函数，该函数用来创建虚拟节点，实际上你也完全可以这么做：

```js
render: function () {
  return this.$createElement('h2', 'Title')
}
```

上面两段代码是完全等价的。而对于 `vm._c` 方法，则用于编译器根据模板字符串生成的渲染函数的。`vm._c` 和 `vm.$createElement` 的不同之处就在于调用 `createElement` 函数时传递的第六个参数不同，至于这么做的原因，我们放到后面讲解。有一点需要注意，即 `$createElement` 看上去像对外暴露的接口，但其实文档上并没有体现。

再往下，就是 `initRender` 函数的最后一段代码了：

```js
// $attrs & $listeners are exposed for easier HOC creation.
// they need to be reactive so that HOCs using them are always updated
const parentData = parentVnode && parentVnode.data

/* istanbul ignore else */
if (process.env.NODE_ENV !== 'production') {
  defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
    !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
  }, true)
  defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
    !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
  }, true)
} else {
  defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
  defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
}
```

上面的代码主要作用就是在 `Vue` 实例对象上定义两个属性：`vm.$attrs` 以及 `vm.$listeners`。这两个属性在 `Vue` 的文档中是有说明的，由于这两个属性的存在使得在 `Vue` 中创建高阶组件变得更容易，感兴趣的同学可以阅读 [探索Vue高阶组件](../more/vue-hoc.md)。

我们注意到，在为实例对象定义 `$attrs` 属性和 `$listeners` 属性时，使用了 `defineReactive` 函数，该函数的作用就是为一个对象定义响应式的属性，所以 `$attrs` 和 `$listeners` 这两个属性是响应式的，至于 `defineReactive` 函数的讲解，我们会放到 `Vue` 的响应系统中讲解。

另外，上面的代码中有一个对环境的判断，在非生产环境中调用 `defineReactive` 函数时传递的第四个参数是一个函数，实际上这个函数是一个自定义的 `setter`，这个 `setter` 会在你设置 `$attrs` 或 `$listeners` 属性时触发并执行。以 `$attrs` 属性为例，当你试图设置该属性时，会执行该函数：

```js
() => {
  !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
}
```

可以看到，当 `!isUpdatingChildComponent` 成立时，会提示你 `$attrs` 是只读属性，你不应该手动设置它的值。同样的，对于 `$listeners` 属性也做了这样的处理。

这里使用到了 `isUpdatingChildComponent` 变量，根据引用关系，该变量来自于 `lifecycle.js` 文件，打开 `lifecycle.js` 文件，可以发现有三个地方使用了这个变量：

```js
// 定义 isUpdatingChildComponent，并初始化为 false
export let isUpdatingChildComponent: boolean = false

// 省略中间代码 ...

export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // 省略中间代码 ...

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // 省略中间代码 ...

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}
```

上面代码是简化后的，可以发现 `isUpdatingChildComponent` 初始值为 `false`，只有当 `updateChildComponent` 函数开始执行的时候会被更新为 `true`，当 `updateChildComponent` 执行结束时又将 `isUpdatingChildComponent` 的值还原为 `false`，这是因为 `updateChildComponent` 函数需要更新实例对象的 `$attrs` 和 `$listeners` 属性，所以此时是不需要提示 `$attrs` 和 `$listeners` 是只读属性的。

最后，对于大家来讲，现在了解这些知识就足够了，至于 `$attrs` 和 `$listeners` 这两个属性的值到底是什么，等我们讲解虚拟DOM的时候再回来说明，这样大家更容易理解。

## 生命周期钩子的实现方式

在 `initRender` 函数执行完毕后，是这样一段代码：

```js
callHook(vm, 'beforeCreate')
initInjections(vm) // resolve injections before data/props
initState(vm)
initProvide(vm) // resolve provide after data/props
callHook(vm, 'created')
```

可以发现，`initInjections(vm)`、`initState(vm)` 以及 `initProvide(vm)` 被包裹在两个 `callHook` 函数调用的语句中。那么 `callHook` 函数的作用是什么呢？正如它的名字一样，`callHook` 函数的作用是调用生命周期钩子函数。根据引用关系可知 `callHook` 函数来自于 `lifecycle.js` 文件，打开该文件找到 `callHook` 函数如下：

```js
export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  const handlers = vm.$options[hook]
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      try {
        handlers[i].call(vm)
      } catch (e) {
        handleError(e, vm, `${hook} hook`)
      }
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
```

以上是 `callHook` 函数的全部代码，它接收两个参数：实例对象和要调用的生命周期钩子的名称。接下来我们就看看 `callHook` 是如何实现的。

大家可能注意到了 `callHook` 函数体的代码以 `pushTarget()` 开头，并以 `popTarget()` 结尾，这里我们暂且不讲这么做的目的，这其实是为了避免在某些生命周期钩子中使用 `props` 数据导致收集冗余的依赖，我们在 `Vue` 响应系统的章节会回过头来仔细给大家讲解。下面我们开始分析 `callHook` 函数的代码的中间部分，首先获取要调用的生命周期钩子：

```js
const handlers = vm.$options[hook]
```

比如 `callHook(vm, created)`，那么上面的代码就相当于：

```js
const handlers = vm.$options.created
```

在 [Vue选项的合并](./5vue-merge.md) 一节中我们讲过，对于生命周期钩子选项最终会被合并处理成一个数组，所以得到的 `handlers` 就是对应生命周期钩子的数组。接着执行的是这段代码：

```js
if (handlers) {
  for (let i = 0, j = handlers.length; i < j; i++) {
    try {
      handlers[i].call(vm)
    } catch (e) {
      handleError(e, vm, `${hook} hook`)
    }
  }
}
```

由于开发者在编写组件时未必会写生命周期钩子，所以获取到的 `handlers` 可能不存在，所以使用 `if` 语句进行判断，只有当 `handlers` 存在的时候才对 `handlers` 进行遍历，`handlers` 数组的元素就是生命周期钩子函数，所以直接执行即可：

```js
handlers[i].call(vm)
```

为了保证生命周期钩子函数内可以通过 `this` 访问实例对象，所以使用 `.call(vm)` 执行这些函数。另外由于生命周期钩子函数的函数体是开发者编写的，为了捕获可能出现的错误，使用 `try...catch` 语句块，并在 `catch` 语句块内使用 `handleError` 处理错误信息。其中 `handleError` 来自于 `core/util/error.js` 文件，大家可以在附录 [core/util 目录下的工具方法全解](../appendix/core-util.md) 中查看关于 `handleError` 的讲解。

所以我们发现，对于生命周期钩子的调用，其实就是通过 `this.$options` 访问处理过的对应的生命周期钩子函数数组，遍历并执行它们。原理还是很简单的。

我们回过头来再看一下这段代码：

```js
callHook(vm, 'beforeCreate')
initInjections(vm) // resolve injections before data/props
initState(vm)
initProvide(vm) // resolve provide after data/props
callHook(vm, 'created')
```

现在大家应该知道，`beforeCreate` 以及 `created` 这两个生命周期钩子的调用时机了。其中 `initState` 包括了：`initProps`、`initMethods`、`initData`、`initComputed` 以及 `initWatch`。所以当 `beforeCreate` 钩子被调用时，所有与 `props`、`methods`、`data`、`computed` 以及 `watch` 相关的内容都不能使用，当然了 `inject/provide` 也是不可用的。

作为对立面，`created` 生命周期钩子则恰恰是等待 `initInjections`、`initState` 以及 `initProvide` 执行完毕之后才被调用，所以在 `created` 钩子中，是完全能够使用以上提到的内容的。但由于此时还没有任何挂载的操作，所以在 `created` 中是不能访问DOM的，即不能访问 `$el`。

最后我们注意到 `callHook` 函数的最后有这样一段代码：

```js
if (vm._hasHookEvent) {
  vm.$emit('hook:' + hook)
}
```

其中 `vm._hasHookEvent` 是在 `initEvents` 函数中定义的，它的作用是判断是否存在**生命周期钩子的事件侦听器**，初始化值为 `false` 代表没有，当组件检测到存在**生命周期钩子的事件侦听器**时，会将 `vm._hasHookEvent` 设置为 `true`。那么问题来了，什么叫做**生命周期钩子的事件侦听器**呢？大家可能不知道，其实 `Vue` 是可以这么玩儿的：

```html
<child
  @hook:beforeCreate="handleChildBeforeCreate"
  @hook:created="handleChildCreated"
  @hook:mounted="handleChildMounted"
  @hook:生命周期钩子
 />
```

如上代码可以使用 `hook:` 加 `生命周期钩子名称` 的方式来监听组件相应的生命周期事件。这是 `Vue` 官方文档上没有体现的，但你确实可以这么用，不过除非你对 `Vue` 非常了解，否则不建议使用。

正是为了实现这个功能，才有了这段代码：

```js
if (vm._hasHookEvent) {
  vm.$emit('hook:' + hook)
}
```

另外大家可能会疑惑，`vm._hasHookEvent` 是在什么时候被设置为 `true` 的呢？或者换句话说，`Vue` 是如何检测是否存在生命周期事件侦听器的呢？对于这个问题等我们在讲解 `Vue` 事件系统时自然会知道。

## Vue 的初始化之 initState

实际上根据如下代码所示：

```js
callHook(vm, 'beforeCreate')
initInjections(vm) // resolve injections before data/props
initState(vm)
initProvide(vm) // resolve provide after data/props
callHook(vm, 'created')
```

可以看到在 `initState` 函数执行之前，先执行了 `initInjections` 函数，也就是说 `inject` 选项要更早被初始化，不过由于初始化 `inject` 选项的时候涉及到 `defineReactive` 函数，并且调用了 `toggleObserving` 函数操作了用于控制是否应该转换为响应式属性的状态标识 `observerState.shouldConvert`，所以我们决定先讲解 `initState`，之后再来讲解 `initInjections` 和 `initProvide`，这才是一个合理的顺序，并且从 `Vue` 的时间线上来看 `inject/provide` 选项确实是后来才添加的。

所以我们打开 `core/instance/state.js` 文件，找到 `initState` 函数，如下：

```js
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

以上是 `initState` 函数的全部代码，我们慢慢来看，首先在 `Vue` 实例对象添加一个属性 `vm._watchers = []`，其初始值是一个数组，这个数组将用来存储所有该组件实例的 `watcher` 对象。随后定义了常量 `opts`，它是 `vm.$options` 的引用。接着执行了如下两句代码：

```js
if (opts.props) initProps(vm, opts.props)
if (opts.methods) initMethods(vm, opts.methods)
```

如果 `opts.props` 存在，即选项中有 `props`，那么就调用 `initProps` 初始化 `props` 选项。同样的，如果 `opts.methods` 存在，则调用 `initMethods` 初始化 `methods` 选项。

再往下执行的是这段代码：

```js
if (opts.data) {
  initData(vm)
} else {
  observe(vm._data = {}, true /* asRootData */)
}
```

首先判断 `data` 选项是否存在，如果存在则调用 `initData` 初始化 `data` 选项，如果不存在则直接调用 `observe` 函数观测一个空对象：`{}`。

最后执行的是如下这段代码：

```js
if (opts.computed) initComputed(vm, opts.computed)
if (opts.watch && opts.watch !== nativeWatch) {
  initWatch(vm, opts.watch)
}
```

采用同样的方式初始化 `computed` 选项，但是对于 `watch` 选项仅仅判断 `opts.watch` 是否存在是不够的，还要判断 `opts.watch` 是不是原生的 `watch` 对象。前面的章节中我们提到过，这是因为在 `Firefox` 中原生提供了 `Object.prototype.watch` 函数，所以即使没有 `opts.watch` 选项，如果在火狐浏览器中依然能够通过原型链访问到原生的 `Object.prototype.watch`。但这其实不是我们想要的结果，所以这里加了一层判断避免把原生 `watch` 函数误认为是我们预期的 `opts.watch` 选项。之后才会调用 `initWatch` 函数初始化 `opts.watch` 选项。

通过阅读 `initState` 函数，我们可以发现 `initState` 其实是很多选项初始化的汇总，包括：`props`、`methods`、`data`、`computed` 和 `watch` 等。并且我们注意到 `props` 选项的初始化要早于 `data` 选项的初始化，那么这是不是可以使用 `props` 初始化 `data` 数据的原因呢？答案是：“是的”。接下来我们就深入讲解这些初始化工作都做了什么事情。下一章节我们将重点讲解 `Vue` 初始化中的关键一步：**数据响应系统**。
