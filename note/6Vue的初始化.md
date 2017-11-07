## Vue 的初始化

#### 用于初始化的最终选项 $options

在 [Vue的思路之以一个例子为线索](/note/Vue的思路之以一个例子为线索) 一节中，我们写了一个很简单的例子，这个例子如下：

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

正是因为上面的代码，使得我们花了大篇章来讲解其内部实现和运作，也就是 [Vue的思路之选项的规范化](/note/Vue的思路之选项的规范化) 和 [Vue的思路之选项的合并](/note/Vue的思路之选项的合并) 这两节所介绍的内容。现在我们已经知道了 `mergeOptions` 函数是如何对父子选项进行合并处理的，也知道了它的作用。

我们打开 `core/util/options.js` 文件，找到 `mergeOptions` 函数，看其最后一句代码：

```js
return options
```

这说明 `mergeOptions` 函数最终将合并处理后的选项返回，并以该返回值作为 `vm.$options` 的值。`vm.$options` 在 `Vue` 的官方文档中是可以找到的，它作为实例属性暴露给开发者，那么现在你应该知道 `vm.$options` 到底是什么了。并且你看文档的时候你应该更能够理解其作用，比如官方文档是这样介绍 `$options` 实例属性的：

> 用于当前 Vue 实例的初始化选项。需要在选项中包含自定义属性时会有用处

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

最终，在实例的 `created` 方法中将打印为数字 `3`。上面的例子很简单，没有什么实际作用，但这为我们提供了自定义选项的机会，这其实是非常有用的。

现在我们需要回到正题上了，还是拿我们例子，如下：

```js
var vm = new Vue({
    el: '#app',
    data: {
        test: 1
    }
})
```

这个时候 `mergeOptions` 函数将会把 `Vue.options` 作为 父选项，把我们传递的实例选项作为子选项进行合并，合并的结果我们可以通过打印 `$options` 属性得知。其实我们前面已经分析过了，`el` 选项将使用默认合并策略合并，最终的值就是字符串 `'#app'`，而 `data` 选项将变成一个函数，且这个函数的执行结果就是合并后的数据，那么在这里，合并后的数据就是 `{test: 1}` 这个对象。

下面是 `vm.$options` 的截图：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-11-02-083231.jpg)

我们发现 `el` 确实还是原来的值，而 `data` 也确实变成了一个函数，并且这个函数就是我们之前遇到过的 `mergedInstanceDataFn`，除此之外我们还能看到其他合并后的选项，其中 `components`、`directives`、`filters` 以及 `_base` 我们知道是存在与 `Vue.options` 中的，至于 `render` 和 `staticRenderFns` 这两个选项是在将模板编译成渲染函数时添加上去的，我们后面会遇到。另外 `_parentElm` 和 `_refElm` 这两个选项是在为虚拟DOM创建组件实例时添加的，我们后面也会讲到，这里大家不需要关心，免得失去重点。最后还有一个 `inject` 选项，我们知道无论是 `Vue.options` 中还是实例选项中都没有 `inject`，那么这个 `inject` 是哪来的呢？大家还记不记得在 [Vue的思路之选项的规范化](/note/Vue的思路之选项的规范化) 一节中，在对 `inject` 选项进行规范化的时候，即使我们的选项没有写 `inject` 选项，其内部也会将其初始化为一个空对象，也就是在 `normalizeInject` 函数中的第二句代码：

```js
const normalized = options.inject = {}
```

#### 渲染函数的作用域代理

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

现在有一个问题需要大家思考一下，目前我们还没有看 `initProxy` 函数的具体内容，那么你能猜到 `initProxy` 函数的主要作用是什么吗？我可以直接告诉大家，这个函数的主要作用其实还是在实例对象 `vm` 上添加 `_renderProxy` 属性。为什么呢？因为生产环境和非生产环境下要保持功能一直。在上面的代码中生产环境下直接执行这句：

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

上面的代码是简化后的，可以发现在文件的开头声明了 `initProxy` 变量，但并未初始化，所以目前 `initProxy` 还是 `undefined`，随后，在文件的结尾将 `initProxy` 导出，那么 `initProxy` 到底是什么呢？实际上变量 `initProxy` 的初始化赋值是在 `if` 语句块内进行的，这个 `if` 语句块进行环境判断，如果是非生产环境的话，那么才会对 `initProxy` 变量赋值，也就是说在生产环境下我们导出的 `initProxy` 实际上就是 `undefined`。只有在非生产环境下导出的 `initProxy` 才会有值，其值就是这个函数：

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

上面的代码相信大家都能看得懂，所以就不做过多解释，接下来我们就看看它是如何做代理的，并且有什么作用。

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

可以发现，如果 `Proxy` 存在，那么将会使用 `Proxy` 对 `vm` 做一层代理，代理对象赋值给 `vm._renderProxy`，所以今后对 `vm._renderProxy` 的访问，如果有代理那么就会被拦截。代理对象配置参数是 `handlers`，可以发现 `handlers` 即可能是 `getHandler` 又可能是 `hasHandler`，至于到底使用哪个，是由判断条件决定的：

```js
options.render && options.render._withStripped
```

如果上面的条件为真，则使用 `getHandler`，否则使用 `hasHandler`，判断条件要求 `options.render` 和 `options.render._withStripped` 必须都为真才行，我现在明确告诉大家 `options.render._withStripped` 这个属性只在测试代码中出现过，所以一般情况下这个条件都会为假，也就是使用 `hasHandler` 作为代理配置。

`hasHandler` 这个变量就定义在当前文件，如下：

```js
const hasHandler = {
    has (target, key) {
        // has 变量是真实经过 in 运算符得来的结果
        const has = key in target
        // 如果 key 在 allowedGlobals 之内，或者 key 以下划线 _ 开头，则为真
        const isAllowed = allowedGlobals(key) || key.charAt(0) === '_'
        // 如果 has 和 isAllowed 都为假，使用 warnNonPresent 函数打印错误
        if (!has && !isAllowed) {
            warnNonPresent(target, key)
        }
        return has || !isAllowed
    }
}
```

这里我假设大家都对 `Proxy` 的使用已经没有任何问题了，我们知道 `has` 可以拦截一下操作：

> * 属性查询: foo in proxy
* 继承属性查询: foo in Object.create(proxy)
* with 检查: with(proxy) { (foo); }
* Reflect.has()

其中关键在就在可以拦截 `with` 语句块里对变量的访问，后面我们会讲到。`has` 函数内出现了两个函数，分别是 `allowedGlobals` 以及 `warnNonPresent`，这两个函数也是定义在当前文件中，首先我们看一下 `allowedGlobals`：

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

这个函数就是通过 `warn` 打印一段警告信息，警告信息提示你“在渲染的时候引用了 `key`，但是在实例上并没有定义 `key` 这个属性或方法”。其实我们很容易就可以看到这个信息，比如下面的代码：

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

可以发现，调用 `render` 函数的时候，使用 `call` 方法指定了函数的执行环境为 `vm._renderProxy`，渲染函数长成什么样呢？还是以上面的例子为例，我们可以通过打印 `vm.$options.render` 查看，所以它张成这样：

```js
vm.$options.render = function () {
    // render 函数的 this 指向实例的 _renderProxy
    with(this){
        return _c('div', [_v(_s(a))])   // 在这里访问 a，相当于访问 vm._renderProxy.a
    }
}
```

从上面的代码可以发现，显然函数使用 `with` 语句块指定了内部代码的执行环境为 `this`，由于 `render` 函数调用的时候使用 `call` 指定了其 `this` 指向为 `vm._renderProxy`，所以 `with` 语句块内代码的执行环境就是 `vm._renderProxy`，所以在 `with` 语句块内访问 `a` 就相当于访问 `vm._renderProxy` 的 `a` 属性，前面我们提到过 `with` 语句块内访问变量将会被 `Proxy` 的 `has` 代理所拦截，所以自然就执行了 `has` 函数内的代码。最终通过 `warnNonPresent` 打印警告信息给我们，所以这个代理的作用就是为了给在开发阶段给我们一个友好而准确的提示。

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

上面的代码由于 `render` 函数时我们手动书写的，所以 `render` 函数并不会被包裹在 `with` 语句块内，当然也就触发不了 `has` 拦截，但是由于 `render._withStripped` 也未定义，所以也不会被 `get` 拦截，那这个时候我们虽然访问了不存在的 `this.a`，但是却得不到警告，想要得到警告我们需要手动设置 `render._withStripped` 为 `true`：

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

为什么会这么设计呢？这也许是 `Vue` 留的一个后门吧。

现在，我们基本知道了 `initProxy` 的目的，就是设置渲染函数的作用域代理，其目的是为我们提供更好的提示信息。不过对于 `proxy.js` 文件内的代码，还有一段使我们没有讲过的，就是下面这段：

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

上面的代码首先检测宿主环境是否支持 `Proxy`，如果支持的话才会执行里面的代码，内部的代码首先使用 `makeMap` 函数生成一个 `isBuiltInModifier` 函数，该函数用来检测给定的值是否是内置的事件修饰符，我们知道在 `Vue` 中我们可以使用事件修饰符很方便的做一些工作，比如阻止默认事件等。

然后为 `config.keyCodes` 设置了 `set` 代理，其目的是防止开发者在自定义键位别名的时候，覆盖了内置的修饰符，比如：

```js
Vue.config.keyCodes.shift = 16
```

由于 `shift` 是内置的修饰符，所以上面这句代码将会得到警告。

#### 初始化之 initLifecycle

`_init` 函数在执行完 `initProxy` 之后，执行的就是 `initLifecycle` 函数：

```js
vm._self = vm
initLifecycle(vm)
```

在 `initLifecycle` 函数执行之前，执行了 `vm._self = vm` 语句，这句话在 `Vue` 实例对象 `vm` 上添加了 `_self` 属性，指向真实的实例本身。注意 `vm._self` 和 `vm._renderProxy` 不同，首先在用途上来说寓意是不同的，另外 `vm._renderProxy` 有可能是一个代理对象，即 `Proxy` 实例。

接下来执行的才是 `initLifecycle` 函数，同事将当前 `Vue` 实例 `vm` 作为参数传递。打开 `core/instance/lifecycle.js` 文件找到 `initLifecycle` 函数，如下：

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

上面代码是 `initLifecycle` 函数的全部内容，首先定义 `options` 常量，它是 `vm.$options` 的引用，然后将执行下面这段代码：

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
  // 经过上线的 while 循环后，parent 应该是一个非抽象的组件，将它作为当前实例的父级，所以将当前实例 vm 添加到父级的 $children 属性里
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

通过读取 `options.parent` 获取父实例，但是问题来了，我们知道 `options` 是 `vm.$options` 的引用，所以这里的 `options.parent` 相当于 `vm.$options.parent`，这里的 `parent` 从哪里来？比如下面的例子：

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

我们知道 `Vue` 给我们提供了 `parent` 选项，使得我们手动指定一个组件的父实例，但在上面的例子中，我们并没有手动指定 `parent` 选项，但是子组件依然能够正确的找到它的父实例，这说明 `Vue` 在寻找父实例的时候是自动检测的。那它是怎么做的呢？目前不准备给大家介绍，因为时机还不够成熟，现在讲大家很容易懵，不过可以给大家看一段代码，打开 `core/vdom/create-component.js` 文件，里面有一个函数叫做 `createComponentInstanceForVnode`，如下：

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

上面的代码中，我们的子组件 `ChildComponent` 说白了就是一个 `json` 对象，或者叫做组件选项对象，在父组件的 `components` 选项中把这个子组件选项对象注册了进去，实际上在 `Vue` 内部，会首先以子组件选项对象作为参数通过 `Vue.extend` 函数创建一个子类出来，然后在通过实例化子类来创建子组件，而 `createComponentInstanceForVnode` 函数的作用，在这里大家就可以简单理解为实例化子组件，只不过这个过程是在虚拟DOM中进行的，我们后边会详细去讲。所以我们看 `createComponentInstanceForVnode` 函数内部有这样一段代码：

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
  // 经过上线的 while 循环后，parent 应该是一个非抽象的组件，将它作为当前实例的父级，所以将当前实例 vm 添加到父级的 $children 属性里
  parent.$children.push(vm)
}
```

拿到父实例 `parent` 之后，进入一个判断分支，条件是：`parent && !options.abstract`，即*父实例存在，且当前实例不是抽象的*，这里大家可能会有疑问：*什么是抽象的实例*？实际上 `Vue` 内部有一些选项是没有暴露给我们的，就比如这里的 `abstract`，通过设置这个选项为 `true`，可以指定该组件式抽象的，那么通过该组件创建的实例也都是抽象的，比如：

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

可以发现，它使用 `abstract` 选项来声明这是一个抽象组件。除了不渲染真实DOM，抽象组件还有一个特点，就是它们不会父子关系的路径上。这么设计也是合理的，这是由它们的性质所决定的。

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
  // 经过上线的 while 循环后，parent 应该是一个非抽象的组件，将它作为当前实例的父级，所以将当前实例 vm 添加到父级的 $children 属性里
  parent.$children.push(vm)
}

// 设置当前实例的 $parent 属性，指向父级
vm.$parent = parent
// 设置 $root 属性，有父级就是用父级的 $root，否则 $root 指向自身
vm.$root = parent ? parent.$root : vm
```

如果 `options.abstract` 为真，那说明当前实例是抽象的，所以并不会走 `if` 分支的代码，所以会跳过 `if` 语句块直接设置 `vm.$parent` 和 `vm.$root` 的值。如果 `options.abstract` 为假，那说明当前实例不是抽象的，是一个普通的组件实例，这个时候就会走 `while` 循环，那么这个 `while` 循环是干嘛的呢？我们前面说过，抽象的组件是不能够也不应该作为父级的，所以 `while` 循环的目的就是沿着父实例链逐层向上寻找到第一个不抽象的实例作为 `parent`，也就是父级。并且在找到父级之后将当前实例添加到父实例的 `$children` 属性中，这样最终的目的就达成了。

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

其中 `$children` 和 `$refs` 都是我们属性的实例属性，他们都在 `initLifecycle` 函数中被初始化，除此之外，还定义了一些内部使用的属性，大家先混个脸熟，在后面的分析中自然会知道他们的用途，但是不要忘了，既然这些属性是在 `initLifecycle` 函数中定义的，那么自然会与声明周期有关。这样 `initLifecycle` 函数我们就分析完毕了，我们回到 `_init` 函数，看看接下来要做的初始化工作是什么。


