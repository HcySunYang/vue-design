# 渲染函数的观察者与进阶的数据响应系统

实际上在 [揭开数据响应系统的面纱](./art/7vue-reactive.md) 一节中我们仅仅学习了数据响应系统的部分内容，比如当时我们做了一个合理的假设，即：`dep.depend()` 这句代码的执行就代表观察者被收集了，而 `dep.notify()` 的执行则代表触发了响应，但是我们并没有详细讲解 `dep` 本身是什么东西，我们只是把它当做了一个收集依赖的“筐”。除此之外我们也没有讲解数据响应系统中另一个很重要的部分，即 `Watcher` ，我们知道正是由于 `Watcher` 对所观察字段的求值才触发了字段的 `get`，从而才有了收集到该观察者的机会。本节我们的目标就是深入 `Vue` 中有关于这部分的具体源码，看一看这里面的秘密。

为了更好地讲解 `Dep` 和 `Watcher`，我们需要选择一个合适的切入点，这个切入点就是 `Vue.prototype._init` 函数。为什么是 `Vue.prototype._init` 呢？因为数据响应系统本身的切入点就是 `initState` 函数，而 `initState` 函数的调用就在 `_init` 函数中。现在我们把视线重新转移到 `_init` 函数，然后 **试图从 `渲染(render)` -> `重新渲染(re-render)` 的过程探索数据响应系统更深层次的内容**。

## $mount 挂载函数

打开 `src/core/instance/init.js` 文件并找到 `Vue.prototype._init` 函数，如下代码所示：

```js {18}
Vue.prototype._init = function (options?: Object) {
  // 省略...

  // expose real self
  vm._self = vm
  initLifecycle(vm)
  initEvents(vm)
  initRender(vm)
  callHook(vm, 'beforeCreate')
  initInjections(vm) // resolve injections before data/props
  initState(vm)
  initProvide(vm) // resolve provide after data/props
  callHook(vm, 'created')

  // 省略...

  if (vm.$options.el) {
    vm.$mount(vm.$options.el)
  }
}
```

以上是简化后的代码，注意高亮的那一句：`vm.$mount(vm.$options.el)`，这句代码是 `_init` 函数的最后一句代码，在这句代码执行之前完成了所有初始化的工作，虽然我们目前对初始化工作还有很多不了解的地方，不过没关系，现在我们就假设已经完成了所有初始化的工作，然后开始我们的探索，不过在这之前我们需要先了解一下 `$mount` 函数是如何将组件挂载到给定元素的。

大家还记得 `$mount` 函数定义在哪里吗？我们在 [Vue 构造函数](./art/2vue-constructor.md) 一节中，在整理 `Vue` 构造函数的时候发现 `$mount` 的定义出现在两个地方，第一个地方是 `platforms/web/runtime/index.js` 文件，如下：

```js
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}
```

我们知道 `platforms/web/runtime/index.js` 文件是运行时版 `Vue` 的入口文件，也就是说如上代码中 `$mount` 函数的功能就是运行时版 `Vue` 的 `$mount` 函数的功能，我们看看它做了什么，`$mount` 函数接收两个参数，第一个参数 `el` 可以是一个字符串也可以是一个 `DOM` 元素，第二个参数 `hydrating` 是用于 `Virtual DOM` 的补丁算法的，这里大家不需要关心。来看 `$mount` 函数的第一句代码：

```js
el = el && inBrowser ? query(el) : undefined
```

首先检测是否传递了 `el` 选项，如果传递了 `el` 选项则会接着判断 `inBrowser` 是否为真，即当前宿主环境是否是浏览器，如果在浏览器中则将 `el` 透传给 `query` 函数并用返回值重写 `el` 变量，否则 `el` 将被重写为 `undefined`。其中 [query](../appendix/web-util.md#query) 函数来自 `src/platforms/web/util/index.js` 文件，用来根据给定的参数在 `DOM` 中查找对应的元素并返回。总之如果在浏览器环境下，那么 `el` 变量将存储着 `DOM` 元素(理想情况下)。

接着来到 `$mount` 函数的第二句代码：

```js
return mountComponent(this, el, hydrating)
```

调用了 `mountComponent` 函数完成真正的挂载工作，并返回(`return`)其运行结果，以上就是运行时版 `Vue` 的 `$mount` 函数所做的事情。

第二个定义 `$mount` 函数的地方是 `src/platforms/web/entry-runtime-with-compiler.js` 文件，我们知道这个文件是完整版 `Vue` 的入口文件，在该文件中重新定义了 `$mount` 函数，但是保留了运行时 `$mount` 的功能，并在此基础上为 `$mount` 函数添加了编译模板的能力，接下来我们详细讲解一下完整版 `$mount` 函数的实现，打开 `src/platforms/web/entry-runtime-with-compiler.js` 文件，如下：

```js {1,2,7}
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 省略...
  return mount.call(this, el, hydrating)
}
```

如上代码所示，首先使用 `mount` 常量缓存了运行时版的 `$mount` 函数，然后重新定义了 `Vue.prototype.$mount` 函数并在重新定义的 `$mount` 函数体内调用了缓存下来的运行时版的 `$mount` 函数，另外重新定义前后 `$mount` 函数所接收的参数是不变的。我们说过，之所以重写 `$mount` 函数，其目的就是为了给运行时版的 `$mount` 函数增加编译模板的能力，我们看看它是怎么做的，在 `$mount` 函数的开始是如下这段代码：

```js
el = el && query(el)

/* istanbul ignore if */
if (el === document.body || el === document.documentElement) {
  process.env.NODE_ENV !== 'production' && warn(
    `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
  )
  return this
}
```

首先如果传递了 `el` 参数，那么就使用 `query` 函数获取到指定的 `DOM` 元素并重新赋值给 `el` 变量，这个元素我们称之为挂载点。接着是一段 `if` 语句块，检测了挂载点是不是 `<body>` 元素或者 `<html>` 元素，如果是的话那么在非生产环境下会打印警告信息，警告你不要挂载到 `<body>` 元素或者 `<html>` 元素。为什么不允许这么做呢？那是因为挂载点的本意是 **组件挂载的占位**，它将会被组件自身的模板 **替换**掉，而  `<body>` 元素和 `<html>` 元素显然是不能被替换掉的。

继续看代码，如下是对 `$mount` 函数剩余代码的简化：

```js
const options = this.$options
// resolve template/el and convert to render function
if (!options.render) {
  // 省略...
}
return mount.call(this, el, hydrating)
```

可以看到，首先定义了 `options` 常量，该常量是 `$options` 的引用，然后使用一个 `if` 语句检测是否包含 `render` 选项，即是否包含渲染函数。如果渲染函数存在那么什么都不会做，直接调用运行时版 `$mount` 函数即可，我们知道运行时版 `$mount` 仅有两句代码，且真正的挂载是通过调用 `mountComponent` 函数完成的，所以可想而知 `mountComponent` 完成挂载所需的必要条件就是：**提供渲染函数给 `mountComponent`**。

那么如果 `options.render` 选项不存在呢？这个时候将会执行 `if` 语句块的代码，而 `if` 语句块的代码所做的事情只有一个：**使用 `template` 或 `el` 选项构建渲染函数**。我们看看它是如何构建的，如下是 `if` 语句块的第一段代码：

```js
let template = options.template
if (template) {
  if (typeof template === 'string') {
    if (template.charAt(0) === '#') {
      template = idToTemplate(template)
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && !template) {
        warn(
          `Template element not found or is empty: ${options.template}`,
          this
        )
      }
    }
  } else if (template.nodeType) {
    template = template.innerHTML
  } else {
    if (process.env.NODE_ENV !== 'production') {
      warn('invalid template option:' + template, this)
    }
    return this
  }
} else if (el) {
  template = getOuterHTML(el)
}
```

首先定义了 `template` 变量，它的初始值是 `options.template` 选项的值，在没有 `render` 渲染函数的情况下会优先使用 `template` 选项，并尝试将 `template` 编译成渲染函数，但开发者未必传递了 `template` 选项，这时会检测 `el` 是否存在，存在的话则使用 `el.outerHTML` 作为 `template` 的值。如上代码的 `if` 分支较多，但目标只有一个，即获取合适的内容作为模板(`template`)，下面的总结阐述了获取模板(`template`)的过程：

* 如果 `template` 选项不存在，那么使用 `el` 元素的 `outerHTML` 作为模板内容
* 如果 `template` 选项存在：
  * 且 `template` 的类型是字符串
    * 如果第一个字符是 `#`，那么会把该字符串作为 `css` 选择符去选中对应的元素，并把该元素的 `innerHTML` 作为模板
    * 如果第一个字符不是 `#`，那么什么都不做，就用 `template` 自身的字符串值作为模板
  * 且 `template` 的类型是元素节点(`template.nodeType` 存在)
    * 则使用该元素的 `innerHTML` 作为模板
  * 若 `template` 既不是字符串又不是元素节点，那么在非生产环境会提示开发者传递的 `template` 选项无效

经过以上逻辑的处理之后，理想状态下此时 `template` 变量应该是一个模板字符串，将来用于渲染函数的生成。但这个 `template` 存在为空字符串的情况，所以即便经过上述逻辑的处理，后续还需要对其进行判断。

另外在上面的代码中使用到了两个工具函数，分别是 `idToTemplate` 和 `getOuterHTML`，这两个函数都定义在当前文件。其中 `idToTemplate` 函数的源码如下：

```js
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})
```

如上代码所示 `idToTemplate` 是通过 `cached` 函数创建的。可以在附录 [shared/util.js 文件工具方法全解](../appendix/shared-util.md#cached) 中查看关于 `cached` 函数的讲解，该函数的作用是通过缓存来避免重复求值，提升性能。但 `cached` 函数并不改变原函数的行为，很显然原函数的功能是返回指定元素的 `innerHTML` 字符串。

`getOuterHTML` 函数的源码如下：

```js
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}
```

它接收一个 `DOM` 元素作为参数，并返回该元素的 `outerHTML`。我们注意到上面的代码中首先判断了 `el.outerHTML` 是否存在，也就是说一个元素的 `outerHTML` 属性未必存在，实际上在 `IE9-11` 中 `SVG` 标签元素是没有 `innerHTML` 和 `outerHTML` 这两个属性的，解决这个问题的方案很简单，可以把 `SVG` 元素放到一个新创建的 `div` 元素中，这样新 `div` 元素的 `innerHTML` 属性的值就等价于 `SVG` 标签 `outerHTML` 的值，而这就是上面代码中 `else` 语句块所做的事情。

接下来我们继续看代码，在处理完 `template` 选项之后，代码运行到了最关键的阶段，如下：

```js {1,7,13}
if (template) {
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    mark('compile')
  }

  const { render, staticRenderFns } = compileToFunctions(template, {
    shouldDecodeNewlines,
    shouldDecodeNewlinesForHref,
    delimiters: options.delimiters,
    comments: options.comments
  }, this)
  options.render = render
  options.staticRenderFns = staticRenderFns

  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    mark('compile end')
    measure(`vue ${this._name} compile`, 'compile', 'compile end')
  }
}
```

在处理完 `options.template` 选项之后，`template` 变量中存储着最终用来生成渲染函数的字符串，但正如前面提到过的 `template` 变量可能是一个空字符串，所以在上面代码中第一句高亮的代码对 `template` 进行判断，只有在 `template` 存在的情况下才会执行 `if` 语句块内的代码，而 `if` 语句块内的代码的作用就是使用 `compileToFunctions` 函数将模板(`template`)字符串编译为渲染函数(`render`)，并将渲染函数添加到 `vm.$options` 选项中(`options` 是 `vm.$options` 的引用)。对于 `compileToFunctions` 函数我们会在讲解 `Vue` 编译器的时候详细说明，现在大家只需要知道他的作用即可，实际上在 `src/platforms/web/entry-runtime-with-compiler.js` 文件的底部我们可以看到这样一句代码：

```js
Vue.compile = compileToFunctions
```

`Vue.compile` 函数是 `Vue` 暴露给开发者的工具函数，他能够将字符串编译为渲染函数。而上面这句代码证明了 `Vue.compile` 函数就是 `compileToFunctions` 函数。

另外注意如下代码中高亮的部分：

```js {3-5,17-20}
if (template) {
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    mark('compile')
  }

  const { render, staticRenderFns } = compileToFunctions(template, {
    shouldDecodeNewlines,
    shouldDecodeNewlinesForHref,
    delimiters: options.delimiters,
    comments: options.comments
  }, this)
  options.render = render
  options.staticRenderFns = staticRenderFns

  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    mark('compile end')
    measure(`vue ${this._name} compile`, 'compile', 'compile end')
  }
}
```

这两段高亮的代码是用来统计编译器性能的，我们在 `Vue.prototype._init` 函数中已经遇到过类似的代码，详细内容可以在 [以一个例子为线索](./art/3vue-example.md) 以及 [perf.js 文件代码说明](../appendix/core-util.md#perf-js-文件代码说明) 这两个章节中查看。

最后我们来做一下总结，实际上完整版 `Vue` 的 `$mount` 函数要做的核心事情就是编译模板(`template`)字符串为渲染函数，并将渲染函数赋值给 `vm.$options.render` 选项，这个选项将会在真正挂载组件的 `mountComponent` 函数中。

## 渲染函数的观察者

无论是完整版 `Vue` 的 `$mount` 函数还是运行时版 `Vue` 的 `$mount` 函数，他们最终都将通过 `mountComponent` 函数去真正的挂载组件，接下来我们就看一看在 `mountComponent` 函数中发生了什么，打开 `src/core/instance/lifecycle.js` 文件找到 `mountComponent` 如下：

```js
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  // 省略...
}
```

`mountComponent` 函数接收三个参数，分别是组件实例 `vm`，挂载元素 `el` 以及透传过来的 `hydrating` 参数。`mountComponent` 函数的第一句代码如下：

```js
vm.$el = el
```

在组件实例对象上添加 `$el` 属性，其值为挂载元素 `el`。我们知道 `$el` 的值是组件模板根元素的引用，如下代码：

```html {1,6}
<div id="foo"></div>

<script>
const new Vue({
  el: '#foo',
  template: '<div id="bar"></div>'
})
</script>
```

上面代码中，挂载元素是一个 `id` 为 `foo` 的 `div` 元素，而组件模板是一个 `id` 为 `bar` 的 `div` 元素。那么大家思考一个问题：`vm.$el` 的值应该是哪一个 `div` 元素的引用？答案是：**`vm.$el` 是 `id` 为 `bar` 的 `div` 的引用**。这是因为 `vm.$el` 始终是组件模板的根元素。由于我们传递了 `template` 选项指定了模板，那么 `vm.$el` 自然就是 `id` 为 `bar` 的 `div` 的引用。假设我们没有传递 `template` 选项，那么根据我们前面的分析，`el` 选项指定的挂载点将被作为组件模板，这个时候 `vm.$el` 则是 `id` 为 `foo` 的 `div` 元素的引用。

再结合 `mountComponent` 函数体的这句话：`vm.$el = el`，有的同学就会有疑问了，这里明明把 `el` 挂载元素赋值给了 `vm.$el`，那么 `vm.$el` 怎么可能引用的是 `template` 选项指定的模板的根元素呢？其实这里仅仅是暂时赋值而已，这是为了给虚拟DOM的 `patch` 算法使用的，实际上 `vm.$el` 会被 `patch` 算法的返回值重写，为了证明这一点我们可以打开 `src/core/instance/lifecycle.js` 文件找到 `Vue.prototype._update` 方法，如下高亮代码所示：

```js {6,9}
Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
  // 省略...

  if (!prevVnode) {
    // initial render
    vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
  } else {
    // updates
    vm.$el = vm.__patch__(prevVnode, vnode)
  }
  
  // 省略...
}
```

正如上面高亮的两句代码所示的那样，`vm.$el` 的值将被 `vm.__patch__` 函数的返回值重写。不过现在大家或许还不清楚 `Vue.prototype._update` 的作用是什么，这块内容我们将在后面的章节详细讲解。

我们继续查看 `mountComponent` 函数的代码，接下来是一段 `if` 语句块：

```js
if (!vm.$options.render) {
  vm.$options.render = createEmptyVNode
  if (process.env.NODE_ENV !== 'production') {
    /* istanbul ignore if */
    if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
      vm.$options.el || el) {
      warn(
        'You are using the runtime-only build of Vue where the template ' +
        'compiler is not available. Either pre-compile the templates into ' +
        'render functions, or use the compiler-included build.',
        vm
      )
    } else {
      warn(
        'Failed to mount component: template or render function not defined.',
        vm
      )
    }
  }
}
```

这段 `if` 条件语句块首先检查渲染函数是否存在，即 `vm.$options.render` 是否为真，如果不为真说明渲染函数不存在，这时将会执行 `if` 语句块内的代码，在 `if` 语句块内首先将 `vm.$options.render` 的值设置为 `createEmptyVNode` 函数，也就是说此时渲染函数的作用将仅仅渲染一个空的 `vnode` 对象，然后在非生产环境下会根据相应的情况打印警告信息。

在上面这段 `if` 语句块的下面，执行了 `callHook` 函数，触发 `beforeMount` 生命周期钩子：

```js
callHook(vm, 'beforeMount')
```

在触发 `beforeMount` 生命周期钩子之后，组件将开始挂载工作，首先是如下这段代码：

```js
let updateComponent
/* istanbul ignore if */
if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
  updateComponent = () => {
    const name = vm._name
    const id = vm._uid
    const startTag = `vue-perf-start:${id}`
    const endTag = `vue-perf-end:${id}`

    mark(startTag)
    const vnode = vm._render()
    mark(endTag)
    measure(`vue ${name} render`, startTag, endTag)

    mark(startTag)
    vm._update(vnode, hydrating)
    mark(endTag)
    measure(`vue ${name} patch`, startTag, endTag)
  }
} else {
  updateComponent = () => {
    vm._update(vm._render(), hydrating)
  }
}
```

这段代码的作用只有一个，即定义并初始化 `updateComponent` 函数，这个函数将用作创建 `Watcher` 实例时传递给 `Watcher` 构造函数的第二个参数，这也将是我们第一次真正地接触 `Watcher` 构造函数，不过现在我们需要先把 `updateComponent` 函数搞清楚，在上面的代码中首先定义了 `updateComponent` 变量，虽然是一个 `if...else` 语句块，其中 `if` 语句块的条件我们已经遇到过很多次了，在满足该条件的情况下会做一些性能统计，可以看到在 `if` 语句块中分别统计了 `vm._render()` 函数以及 `vm._update()` 函数的运行性能。也就是说无论是执行 `if` 语句块还是执行 `else` 语句块，最终 `updateComponent` 函数的功能是不变的。

既然功能相同，我们就直接看 `else` 语句块的代码，因为它要简洁的多：

```js {5-7}
let updateComponent
if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
  // 省略...
} else {
  updateComponent = () => {
    vm._update(vm._render(), hydrating)
  }
}
```

可以看到 `updateComponent` 是一个函数，该函数的作用是以 `vm._render()` 函数的返回值作为第一个参数调用 `vm._update()` 函数。由于我们还没有讲解 `vm._render` 函数和 `vm._update` 函数的作用，所以为了让大家更好理解，我们可以简单地认为：

* `vm._render` 函数的作用是调用 `vm.$options.render` 函数并返回生成的虚拟节点(`vnode`)
* `vm._update` 函数的作用是把 `vm._render` 函数生成的虚拟节点渲染成真正的 `DOM`

也就是说目前我们可以简单地认为 `updateComponent` 函数的作用就是：**把渲染函数生成的虚拟DOM渲染成真正的DOM**，其实在 `vm._update` 内部是通过虚拟DOM的补丁算法(`patch`)来完成的，这些我们放到后面的具体章节去讲。

再往下，我们将遇到创建观察者(`Watcher`)实例的代码：

```js
new Watcher(vm, updateComponent, noop, {
  before () {
    if (vm._isMounted) {
      callHook(vm, 'beforeUpdate')
    }
  }
}, true /* isRenderWatcher */)
```

前面说过，这将是我们第一次真正意义上的遇到观察者构造函数 `Watcher`，我们在 [揭开数据响应系统的面纱](./7vue-reactive.md) 一章中有提到过，正是因为 `watcher` 对表达式的求值，触发了数据属性的 `get` 拦截器函数，从而收集到了依赖，当数据变化时能够触发响应。在上面的代码中 `Watcher` 观察者实例将对 `updateComponent` 函数求值，我们知道 `updateComponent` 函数的执行会间接触发渲染函数(`vm.$options.render`)的执行，而渲染函数的执行则会触发数据属性的 `get` 拦截器函数，从而将依赖(`观察者`)收集，当数据变化时将重新执行 `updateComponent` 函数，这就完成了重新渲染。同时我们把上面代码中实例化的观察者对象称为 **渲染函数的观察者**。

## 初识 Watcher

接下来我们就以渲染函数的观察者对象为例，顺着脉络了解 `Watcher` 类，`Watcher` 类定义在 `src/core/observer/watcher.js` 文件中，如下是 `Watcher` 类的全部内容：

```js
export default class Watcher {

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {

  }

  get () {
    // 省略...
  }

  addDep (dep: Dep) {
    // 省略...
  }

  cleanupDeps () {
    // 省略...
  }

  update () {
    // 省略...
  }

  run () {
    // 省略...
  }

  getAndInvoke (cb: Function) {
    // 省略...
  }

  evaluate () {
    // 省略...
  }

  depend () {
    // 省略...
  }

  teardown () {
    // 省略...
  }
}
```

通过 `Watcher` 类的 `constructor` 方法可以知道在创建 `Watcher` 实例时可以传递五个参数，分别是：组件实例对象 `vm`、要观察的表达式 `expOrFn`、当被观察的表达式的值变化时的回调函数 `cb`、一些传递给当前观察者对象的选项 `options` 以及一个布尔值 `isRenderWatcher` 用来标识该观察者实例是否是渲染函数的观察者。

如下是在 `mountComponent` 函数中创建渲染函数观察者实例的代码：

```js
new Watcher(vm, updateComponent, noop, {
  before () {
    if (vm._isMounted) {
      callHook(vm, 'beforeUpdate')
    }
  }
}, true /* isRenderWatcher */)
```

可以看到在创建渲染函数观察者实例对象时传递了全部的五个参数，第一个参数 `vm` 很显然就是当前组件实例对象；第二个参数 `updateComponent` 就是被观察的目标，它是一个函数；第三个参数 `noop` 是一个空函数；第四个参数是一个包含 `before` 函数的对象，这个对象将作为传递给该观察者的选项；第五个参数为 `true`，我们知道这个参数标识着该观察者实例对象是否是渲染函数的观察者，很显然上面的代码是在为渲染函数创建观察者对象，所以第五个参数自然为 `true`。

这里有几个问题需要注意，首先被观察的表达式是一个函数，即 `updateComponent` 函数，我们知道 `Watcher` 的原理是通过对“被观测目标”的求值，触发数据属性的 `get` 拦截器函数从而收集依赖，至于“被观测目标”到底是表达式还是函数或者是其他形式的内容都不重要，重要的是“被观测目标”能否触发数据属性的 `get` 拦截器函数，很显然函数是具备这个能力的。另外一个我们需要注意的是传递给 `Watcher` 构造函数的第三个参数 `noop` 是一个空函数，它什么事情都不会做，有的同学可能会有疑问：“不是说好了当数据变化时重新渲染吗，现在怎么什么都不做了？”，实际上数据的变化不仅仅会执行回调，还会重新对“被观察目标”求值，也就是说 `updateComponent` 也会被调用，所以不需要通过执行回调去重新渲染。说到这里大家或许又产生了一个疑问：“再次执行 `updateComponent` 函数难道不会导致再次触发数据属性的 `get` 拦截器函数导致重复收集依赖吗？”，这是个好问题，不过不用担心，因为 `Vue` 已经实现了避免收集重复依赖的处理，我们后面会讲到的。

接下来我们就从 `constructor` 函数开始，看一下创建渲染函数观察者实例对象的过程，进一步了解一个观察者，如下是 `constructor` 函数开头的一段代码：

```js
this.vm = vm
if (isRenderWatcher) {
  vm._watcher = this
}
vm._watchers.push(this)
```

首先将当前组件实例对象 `vm` 赋值给该观察者实例的 `this.vm` 属性，也就是说每一个观察者实例对象都有一个 `vm` 实例属性，该属性指明了这个观察者是属于哪一个组件的。接着使用 `if` 条件语句判断 `isRenderWatcher` 是否为真，前面说过 `isRenderWatcher` 标识着是否是渲染函数的观察者，只有在 `mountComponent` 函数中创建渲染函数观察者时这个参数为真，如果 `isRenderWatcher` 为真那么则会将当前观察者实例赋值给 `vm._watcher` 属性，也就是说组件实例的 `_watcher` 属性的值引用着该组件的渲染函数观察者。大家还记得 `_watcher` 属性是在哪里初始化的吗？是在 `initLifecycle` 函数中被初始化的，其初始值为 `null`。在 `if` 语句块的后面将当前观察者实例对象 `push` 到 `vm._watchers` 数组中，也就是说属于该组件实例的观察者都会被添加到该组件实例对象的 `vm._watchers` 数组中，包括渲染函数的观察者和非渲染函数的观察者。另外组件实例的 `vm._watchers` 属性是在 `initState` 函数中初始化的，其初始值是一个空数组。

再往下是这样一段代码：

```js
if (options) {
  this.deep = !!options.deep
  this.user = !!options.user
  this.computed = !!options.computed
  this.sync = !!options.sync
  this.before = options.before
} else {
  this.deep = this.user = this.computed = this.sync = false
}
```

这是一个 `if...else` 语句块，判断是否传递了 `options` 参数，如果没有传递则 `else` 语句块的代码将被执行，可以看到在 `else` 语句块内将当前观察者实例对象的四个属性 `this.deep`、`this.user`、`this.computed` 以及 `this.sync` 全部初始化为 `false`。如果传递了 `options` 参数，那么这四个属性的值则会使用 `options` 对象中同名属性值的真假来初始化。通过 `if` 语句块内的代码我们可以知道在创建一个观察者对象时，可以传递五个选项，分别是：

* `options.deep`，用来告诉当前观察者实例对象是否是深度观测

我们平时在使用 `Vue` 的 `watch` 选项或者 `vm.$watch` 函数去观测某个数据时，可以通过设置 `deep` 选项的值为 `true` 来深度观测该数据。

* `options.user`，用来标识当前观察者实例对象是 **开发者定义的** 还是 **内部定义的**

实际上无论是 `Vue` 的 `watch` 选项还是 `vm.$watch` 函数，他们的实现都是通过实例化 `Watcher` 类完成的，等到我们讲解 `Vue` 的 `watch` 选项和 `vm.$watch` 的具体实现时大家会看到，除了内部定义的观察者(如：渲染函数的观察者、计算属性的观察者等)之外，所有观察者都被认为是开发者定义的，这时 `options.user` 会自动被设置为 `true`。

* `options.computed`，用来标识当前观察者实例对象是否是计算属性的观察者

这里需要明确的是，计算属性的观察者并不是指一个观察某个计算属性变化的观察者，而是指 `Vue` 内部在实现计算属性这个功能时为计算属性创建的观察者。等到我们讲解计算属性的实现时再详细说明。

* `options.sync`，用来告诉观察者当数据变化时是否同步求值并执行回调

默认情况下当数据变化时不会同步求值并执行回调，而是将需要重新求值并执行回调的观察者放到一个异步队列中，当所有数据的变化结束之后统一求值并执行回调，这么做的好处有很多，我们后面会详细讲解。

* `options.before`，可以理解为 `Watcher` 实例的钩子，当数据变化之后，触发更新之前，调用在创建渲染函数的观察者实例对象时传递的 `before` 选项。

如下高亮代码：

```js {2-6}
new Watcher(vm, updateComponent, noop, {
  before () {
    if (vm._isMounted) {
      callHook(vm, 'beforeUpdate')
    }
  }
}, true /* isRenderWatcher */)
```

可以看到当数据变化之后，触发更新之前，如果 `vm._isMounted` 属性的值为真，则会调用 `beforeUpdate` 生命周期钩子。

再往下又定义了一些实例属性，如下：

```js
this.cb = cb
this.id = ++uid // uid for batching
this.active = true
this.dirty = this.computed // for computed watchers
```

如上代码所示，定义了 `this.cb` 属性，它的值为 `cb` 回调函数。定义了 `this.id` 属性，它是观察者实例对象的唯一标识。定义了 `this.active` 属性，它标识着该观察者实例对象是否是激活状态，默认值为 `true` 代表激活。定义了 `this.dirty` 属性，该属性的值与 `this.computed` 属性的值相同，也就是说只有计算属性的观察者实例对象的 `this.dirty` 属性的值才会为真，因为计算属性是惰性求值。

接着往下看代码，如下：

```js
this.deps = []
this.newDeps = []
this.depIds = new Set()
this.newDepIds = new Set()
```

这四个属性两两一组，`this.deps` 与 `this.depIds` 为一组，`this.newDeps` 与 `this.newDepIds` 为一组。那么这两组属性的作用是什么呢？其实它们就是传说中用来实现避免收集重复依赖，且移除无用依赖的功能也依赖于它们，后面我们会详细讲解，现在大家注意一下这四个属性的数据结构，其中 `this.deps` 与 `this.newDeps` 被初始化为空数组，而 `this.depIds` 与 `this.newDepIds` 被初始化为 `Set` 实例对象。

再往下是这句代码：

```js
this.expression = process.env.NODE_ENV !== 'production'
  ? expOrFn.toString()
  : ''
```

定义了 `this.expression` 属性，在非生产环境下该属性的值为表达式(`expOrFn`)的字符串表示，在生产环境下其值为空字符串。所以可想而知 `this.expression` 属性肯定是在非生产环境下使用的，后面我们遇到了再说。

再往下，来到一段 `if...else` 语句块：

```js
if (typeof expOrFn === 'function') {
  this.getter = expOrFn
} else {
  this.getter = parsePath(expOrFn)
  if (!this.getter) {
    this.getter = function () {}
    process.env.NODE_ENV !== 'production' && warn(
      `Failed watching path: "${expOrFn}" ` +
      'Watcher only accepts simple dot-delimited paths. ' +
      'For full control, use a function instead.',
      vm
    )
  }
}
```

这段代码检测了 `expOrFn` 的类型，如果 `expOrFn` 是函数，那么直接使用 `expOrFn` 作为 `this.getter` 属性的值。如果 `expOrFn` 不是函数，那么将 `expOrFn` 透传给 `parsePath` 函数，并以 `parsePath` 函数的返回值作为 `this.getter` 属性的值。那么 `parsePath` 函数做了什么呢？`parsePath` 函数定义在 `src/core/util/lang.js` 文件，源码如下：

```js
const bailRE = /[^\w.$]/
export function parsePath (path: string): any {
  if (bailRE.test(path)) {
    return
  }
  const segments = path.split('.')
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      obj = obj[segments[i]]
    }
    return obj
  }
}
```

首先我们需要知道 `parsePath` 函数接收的参数是什么，如下是平时我们使用 `$watch` 函数的例子：

```js
// 函数
const expOrFn = function () {
  return this.obj.a
}
this.$watch(expOrFn, function () { /* 回调 */ })

// 表达式
const expOrFn = 'obj.a'
this.$watch(expOrFn, function () { /* 回调 */ })
```

以上两种用法实际上是等价的，当 `expOrFn` 不是函数时，比如上例中的 `'obj.a'` 是一个字符串，这时便会将该字符串传递给 `parsePath` 函数，其实我们可以看到 `parsePath` 函数的返回值是另一个函数，那么返回的新函数的作用是什么呢？很显然其作用是触发 `'obj.a'` 的 `get` 拦截器函数，同时新函数会将 `'obj.a'` 的值返回。

接下来我们具体看一下 `parsePath` 函数的具体实现，首先来看一下在 `parsePath` 函数之前定义的 `bailRE` 正则：

```js
const bailRE = /[^\w.$]/
```

同时在 `parsePath` 函数开头有一段 `if` 语句，使用该正则来匹配传递给 `parsePath` 的参数 `path`，如果匹配则直接返回(`return`)，且返回值是 `undefined`，也就是说如果 `path` 匹配正则 `bailRE` 那么最终 `this.getter` 将不是一个函数而是 `undefined`。那么这个正则是什么含义呢？这个正则将匹配一个位置，该位置满足三个条件：

* 不是 `\w`，也就是说这个位置不能是 `字母` 或 `数字` 或 `下划线`
* 不是字符 `.`
* 不是字符 `$`

举几个例子如 `obj~a`、`obj/a`、`obj*a`、`obj+a` 等，这些字符串中的 `~`、`/`、`*` 以及 `+` 字符都能成功匹配正则 `bailRE`，这时 `parsePath` 函数将返回 `undefined`，也就是解析失败。实际上这些字符串在 `javascript` 中不是一个合法的访问对象属性的语法，按照 `bailRE` 正则只有如下这几种形式的字符串才能解析成功：`obj.a`、`this.$watch` 等，看到这里你也应该知道为什么 `bailRE` 正则中包含字符 `.` 和 `$`。

回过头来，如果参数 `path` 不满足正则 `bailRE`，那么如下高亮的代码将被执行：

```js {5-12}
export function parsePath (path: string): any {
  if (bailRE.test(path)) {
    return
  }
  const segments = path.split('.')
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      obj = obj[segments[i]]
    }
    return obj
  }
}
```

首先定义 `segments` 常量，它的值是通过字符 `.` 分割 `path` 字符串产生的数组，随后 `parsePath` 函数将返回值一个函数，该函数的作用是遍历 `segments` 数组循环访问 `path` 指定的属性值。这样就触发了数据属性的 `get` 拦截器函数。但要注意 `parsePath` 返回的新函数将作为 `this.getter` 的值，只有当 `this.getter` 被调用的时候，这个函数才会执行。

看完了 `parsePath` 函数，我们再回到如下这段代码中：

```js {5-13}
if (typeof expOrFn === 'function') {
  this.getter = expOrFn
} else {
  this.getter = parsePath(expOrFn)
  if (!this.getter) {
    this.getter = function () {}
    process.env.NODE_ENV !== 'production' && warn(
      `Failed watching path: "${expOrFn}" ` +
      'Watcher only accepts simple dot-delimited paths. ' +
      'For full control, use a function instead.',
      vm
    )
  }
}
```

现在我们明白了观察者实例对象的 `this.getter` 函数终将会是一个函数，如果不是函数，如上高亮代码所示。此时只有一种可能，那就是 `parsePath` 函数在解析表达式的时候失败了，那么这时在非生产环境会打印警告信息，告诉开发者：**`Watcher` 只接受简单的点(`.`)分隔路径，如果你要用全部的 `js` 语法特性直接观察一个函数即可**。

再往下我们来到了 `constructor` 函数的最后一段代码：

```js
if (this.computed) {
  this.value = undefined
  this.dep = new Dep()
} else {
  this.value = this.get()
}
```

通过这段代码我们可以发现，计算属性的观察者和其他观察者实例对象的处理方式是不同的，对于计算属性的观察者我们会在讲解计算属性时详细说明。除计算属性的观察者之外的所有观察者实例对象都将执行如上代码的 `else` 分支语句，即调用 `this.get()` 方法。

## 依赖收集的过程

`this.get()` 是我们遇到的第一个观察者对象的实例方法，它的作用可以用两个字描述：**求值**。求值的目的有两个，第一个是能够触发访问器属性的 `get` 拦截器函数，第二个是能够获得被观察目标的值。而且能够触发访问器属性的 `get` 拦截器函数是依赖被收集的关键，下面我们具体查看一下 `this.get()` 方法的内容：

```js
get () {
  pushTarget(this)
  let value
  const vm = this.vm
  try {
    value = this.getter.call(vm, vm)
  } catch (e) {
    if (this.user) {
      handleError(e, vm, `getter for watcher "${this.expression}"`)
    } else {
      throw e
    }
  } finally {
    // "touch" every property so they are all tracked as
    // dependencies for deep watching
    if (this.deep) {
      traverse(value)
    }
    popTarget()
    this.cleanupDeps()
  }
  return value
}
```

如上是 `this.get()` 方法的全部代码，一上来调用了 `pushTarget(this)` 函数，并将当前观察者实例对象作为参数传递，这里的 `pushTarget` 函数来自于 `src/core/observer/dep.js` 文件，如下代码所示：

```js {8}
export default class Dep {
  // 省略...
}

Dep.target = null
const targetStack = []

export function pushTarget (_target: ?Watcher) {
  if (Dep.target) targetStack.push(Dep.target)
  Dep.target = _target
}

export function popTarget () {
  Dep.target = targetStack.pop()
}
```

在 `src/core/observer/dep.js` 文件中定义了 `Dep` 类，我们在 [揭开数据响应系统的面纱](./art/7vue-reactive.md) 一章中就遇到过 `Dep` 类，当时我们说每个响应式数据的属性都通过闭包引用着一个用来收集属于自身依赖的“筐”，实际上那个“筐”就是 `Dep` 类的实例对象。更多关于 `Dep` 类的内容我们会在合适的地方讲解，现在我们的主要目的是搞清楚 `pushTarget` 函数是做什么的。在上面这段代码中我们可以看到 `Dep` 类拥有一个静态属性，即 `Dep.target` 属性，该属性的初始值为 `null`，其实 `pushTarget` 函数的作用就是用来为 `Dep.target` 属性赋值的，`pushTarget` 函数会将接收到的参数赋值给 `Dep.target` 属性，我们知道传递给 `pushTarget` 函数的参数就是调用该函数的观察者对象，所以 `Dep.target` 保存着一个观察者对象，其实这个观察者对象就是即将要收集的目标。

我们再回到 `this.get()` 方法中，如下是简化后的代码：

```js
get () {
  pushTarget(this)
  let value
  const vm = this.vm
  try {
    value = this.getter.call(vm, vm)
  } catch (e) {
    // 省略...
  } finally {
    // 省略...
  }
  return value
}
```

在调用 `pushTarget` 函数之后，定义了 `value` 变量，该变量的值为 `this.getter` 函数的返回值，我们知道观察者对象的 `this.getter` 属性是一个函数，这个函数的执行就意味着对被观察目标的求值，并将得到的值赋值给 `value` 变量，而且我们可以看到 `this.get` 方法的最后将 `value` 返回，为什么要强调这一点呢？如下代码所示：

```js {13}
constructor (
  vm: Component,
  expOrFn: string | Function,
  cb: Function,
  options?: ?Object,
  isRenderWatcher?: boolean
) {
  // 省略...
  if (this.computed) {
    this.value = undefined
    this.dep = new Dep()
  } else {
    this.value = this.get()
  }
}
```

这句高亮的代码将 `this.get()` 方法的返回值赋值给了观察者实例对象的 `this.value` 属性。也就是说 `this.value` 属性保存着被观察目标的值。

`this.get()` 方法除了对被观察目标求值之外，大家别忘了正是因为对被观察目标的求值才得以触发数据属性的 `get` 拦截器函数，还是以渲染函数的观察者为例，假设我们有如下模板：

```html
<div id="demo">
  <p>{{name}}</p>
</div>
```

这段模板被编译将生成如下渲染函数：

```js {6}
// 编译生成的渲染函数是一个匿名函数
function anonymous () {
  with (this) {
    return _c('div',
      { attrs:{ "id": "demo" } },
      [_v("\n      "+_s(name)+"\n    ")]
    )
  }
}
```

大家看不懂渲染函数没关系，关于模板到渲染函数的编译过程我们会在编译器相关章节为大家讲解，现在大家只需要注意如上高亮的那句代码，可以发现渲染函数的执行会读取数据属性 `name` 的值，这将会触发 `name` 属性的 `get` 拦截器函数，如下代码截取自 `defineReactive` 函数：

```js {3,4}
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

这段代码我们已经很熟悉了，它是数据属性的 `get` 拦截器函数，由于渲染函数读取了 `name` 属性的值，所以 `name` 属性的 `get` 拦截器函数将被执行，大家注意如上代码中高亮的两句代码，首先判断了 `Dep.target` 是否存在，如果存在则调用 `dep.depend` 方法收集依赖。那么 `Dep.target` 是否存在呢？答案是存在，这就是为什么 `pushTarget` 函数要在调用 `this.getter` 函数之前被调用的原因。既然 `dep.depend` 方法被执行，那么我们就找到 `dep.depend` 方法，如下：

```js
depend () {
  if (Dep.target) {
    Dep.target.addDep(this)
  }
}
```

在 `dep.depend` 方法内部又判断了一次 `Dep.target` 是否有值，有的同学可能会有疑问，这不是多此一举吗？其实这么做并不多余，因为 `dep.depend` 方法除了在属性的 `get` 拦截器函数内被调用之外还在其他地方被调用了，这时候就需要对 `Dep.target` 做判断，至于在哪里调用的我们后面会讲到。另外我们发现在 `depend` 方法内部其实并没有真正的执行收集依赖的动作，而是调用了观察者实例对象的 `addDep` 方法：`Dep.target.addDep(this)`，并以当前 `Dep` 实例对象作为参数。为了搞清楚这么做的目的，我们找到观察者实例对象的 `addDep` 方法，如下：

```js
addDep (dep: Dep) {
  const id = dep.id
  if (!this.newDepIds.has(id)) {
    this.newDepIds.add(id)
    this.newDeps.push(dep)
    if (!this.depIds.has(id)) {
      dep.addSub(this)
    }
  }
}
```

可以看到 `addDep` 方法接收一个参数，这个参数是一个 `Dep` 对象，在 `addDep` 方法内部首先定义了常量 `id`，它的值是 `Dep` 实例对象的唯一 `id` 值。接着是一段 `if` 语句块，该 `if` 语句块的代码很关键，因为它的作用就是用来 **避免收集重复依赖** 的，既然是用来避免收集重复的依赖，那么就不得不用到我们前面提到过的两组属性，即 `newDepIds`、`newDeps` 以及 `depIds`、`deps`。为了让大家更好地理解，我们思考一下可不可以把 `addDep` 方法修改成如下这样：

```js
addDep (dep: Dep) {
  dep.addSub(this)
}
```

首先解释一下 `dep.addSub` 方法，它的源码如下：

```js
addSub (sub: Watcher) {
  this.subs.push(sub)
}
```

`addSub` 方法接收观察者对象作为参数，并将接收到的观察者添加到 `Dep` 实例对象的 `subs` 数组中，其实 `addSub` 方法才是真正用来收集观察者的方法，并且收集到的观察者都会被添加到 `subs` 数组中存起来。

了解了 `addSub` 方法之后，我们再回到如下这段代码：

```js
addDep (dep: Dep) {
  dep.addSub(this)
}
```

我们修改了 `addDep` 方法，直接在 `addDep` 方法内调用 `dep.addSub` 方法，并将当前观察者对象作为参数传递。这不是很好吗？难道有什么问题吗？当然有问题，假如我们有如下模板：

```html
<div id="demo">
  {{name}}{{name}}
</div>
```

这段模板的不同之处在于我们使用了两次 `name` 数据，那么相应的渲染函数也将变为如下这样：

```js {5}
function anonymous () {
  with (this) {
    return _c('div',
      { attrs:{ "id": "demo" } },
      [_v("\n      "+_s(name)+_s(name)+"\n    ")]
    )
  }
}
```

可以看到，渲染函数的执行将读取两次数据对象 `name` 属性的值，这必然会触发两次 `name` 属性的 `get` 拦截器函数，同样的道理，`dep.depend` 也将被触发两次，最后导致 `dep.addSub` 方法被执行了两次，且参数一模一样，这样就产生了同一个观察者被收集多次的问题。所以我们不能像如上那样修改 `addDep` 函数的代码，那么此时我相信大家也应该知道如下高亮代码的含义了：

```js {3-5}
addDep (dep: Dep) {
  const id = dep.id
  if (!this.newDepIds.has(id)) {
    this.newDepIds.add(id)
    this.newDeps.push(dep)
    if (!this.depIds.has(id)) {
      dep.addSub(this)
    }
  }
}
```

在 `addDep` 内部并不是直接调用 `dep.addSub` 收集观察者，而是先根据 `dep.id` 属性检测该 `Dep` 实例对象是否已经存在于 `newDepIds` 中，如果存在那么说明已经收集过依赖了，什么都不会做。如果不存在才会继续执行 `if` 语句块的代码，同时将 `dep.id` 属性和 `Dep` 实例对象本身分别添加到 `newDepIds` 和 `newDeps` 属性中，这样无论一个数据属性被读取了多少次，对于同一个观察者它只会收集一次。

不过有的同学可能注意到了，如下高亮代码所示：

```js {6}
addDep (dep: Dep) {
  const id = dep.id
  if (!this.newDepIds.has(id)) {
    this.newDepIds.add(id)
    this.newDeps.push(dep)
    if (!this.depIds.has(id)) {
      dep.addSub(this)
    }
  }
}
```

这里的判断条件 `!this.depIds.has(id)` 是什么意思呢？我们知道 `newDepIds` 属性用来避免在 **一次求值** 的过程中收集重复的依赖，其实 `depIds` 属性是用来在 **多次求值** 中避免收集重复依赖的。什么是多次求值，其实所谓多次求值是指当数据变化时重新求值的过程。大家可能会疑惑，难道重新求值的时候不能用 `newDepIds` 属性来避免收集重复的依赖吗？不能，原因在于每一次求值之后 `newDepIds` 属性都会被清空，也就是说每次重新求值的时候对于观察者实例对象来讲 `newDepIds` 属性始终是全新的。虽然每次求值之后会清空 `newDepIds` 属性的值，但在清空之前会把 `newDepIds` 属性的值以及 `newDeps` 属性的值赋值给 `depIds` 属性和 `deps` 属性，这样重新求值的时候 `depIds` 属性和 `deps` 属性将会保存着上一次求值中 `newDepIds` 属性以及 `newDeps` 属性的值。为了证明这一点，我们来看一下观察者对象的求值方法，即 `get()` 方法：

```js {12}
get () {
  pushTarget(this)
  let value
  const vm = this.vm
  try {
    value = this.getter.call(vm, vm)
  } catch (e) {
    // 省略...
  } finally {
    // 省略...
    popTarget()
    this.cleanupDeps()
  }
  return value
}
```

可以看到在 `finally` 语句块内调用了观察者对象的 `cleanupDeps` 方法，这个方法的作用正如我们前面所说的那样，每次求值完毕后都会使用 `depIds` 属性和 `deps` 属性保存 `newDepIds` 属性和 `newDeps` 属性的值，然后再清空 `newDepIds` 属性和 `newDeps` 属性的值，如下是 `cleanupDeps` 方法的源码：

```js {9-16}
cleanupDeps () {
  let i = this.deps.length
  while (i--) {
    const dep = this.deps[i]
    if (!this.newDepIds.has(dep.id)) {
      dep.removeSub(this)
    }
  }
  let tmp = this.depIds
  this.depIds = this.newDepIds
  this.newDepIds = tmp
  this.newDepIds.clear()
  tmp = this.deps
  this.deps = this.newDeps
  this.newDeps = tmp
  this.newDeps.length = 0
}
```

在 `cleanupDeps` 方法内部，首先是一个 `while` 循环，我们暂且不关心这个循环的作用，我们看循环下面的代码，即高亮的部分，这段代码是典型的引用类型变量交换值的过程，最终的结果就是 `newDepIds` 属性和 `newDeps` 属性被清空，并且在被清空之前把值分别赋给了 `depIds` 属性和 `deps` 属性，这两个属性将会用在下一次求值时避免依赖的重复收集。

现在我们可以做几点总结：

* 1、`newDepIds` 属性用来在一次求值中避免收集重复的观察者
* 2、每次求值并收集观察者完成之后会清空 `newDepIds` 和 `newDeps` 这两个属性的值，并且在被清空之前把值分别赋给了 `depIds` 属性和 `deps` 属性
* 3、`depIds` 属性用来避免重复求值时收集重复的观察者

通过以上三点内容我们可以总结出一个结论，即 `newDepIds` 和 `newDeps` 这两个属性的值所存储的总是当次求值所收集到的 `Dep` 实例对象，而 `depIds` 和 `deps` 这两个属性的值所存储的总是上一次求值过程中所收集到的 `Dep` 实例对象。

除了以上三点之外，其实 `deps` 属性还能够用来移除废弃的观察者，`cleanupDeps` 方法中开头的那段 `while` 循环就是用来实现这个功能的，如下代码所示：

```js
cleanupDeps () {
  let i = this.deps.length
  while (i--) {
    const dep = this.deps[i]
    if (!this.newDepIds.has(dep.id)) {
      dep.removeSub(this)
    }
  }
  // 省略...
}
```

这段 `while` 循环就是对 `deps` 数组进行遍历，也就是对上一次求值所收集到的 `Dep` 对象进行遍历，然后在循环内部检查上一次求值所收集到的 `Dep` 实例对象是否存在于当前这次求值所收集到的 `Dep` 实例对象中，如果不存在则说明该 `Dep` 实例对象已经和该观察者不存在依赖关系了，这时就会调用 `dep.removeSub(this)` 方法并以该观察者实例对象作为参数传递，从而将该观察者对象从 `Dep` 实例对象中移除。

我们可以找到 `Dep` 类的 `removeSub` 实例方法，如下：

```js
removeSub (sub: Watcher) {
  remove(this.subs, sub)
}
```

它的内容很简单，接收一个要被移除的观察者作为参数，然后使用 `remove` 工具函数，将该观察者从 `this.subs` 数组中移除。其中 `remove` 工具函数来自 `src/shared/util.js` 文件，可以在 [shared/util.js 文件工具方法全解](../appendix/shared-util.md#remove) 中查看。

## 触发依赖的过程

在上一小节中我们提到了，每次求值并收集完观察者之后，会将当次求值所收集到的观察者保存到另外一组属性中，即 `depIds` 和 `deps`，并将存有当次求值所收集到的观察者的属性清空，即清空 `newDepIds` 和 `newDeps`。我们当时也说过了，这么做的目的是为了对比当次求值与上一次求值所收集到的观察者的变化情况，并做出合理的矫正工作，比如移除那些已经没有关联关系的观察者等。本节我们将以数据属性的变化为切入点，讲解重新求值的过程。

假设我们有如下模板：

```html
<div id="demo">
  {{name}}
</div>
```

我们知道这段模板将会被编译成渲染函数，接着创建一个渲染函数的观察者，从而对渲染函数求值，在求值的过程中会触发数据对象 `name` 属性的 `get` 拦截器函数，进而将该观察者收集到 `name` 属性通过闭包引用的“筐”中，即收集到 `Dep` 实例对象中。这个 `Dep` 实例对象是属于 `name` 属性自身所拥有的，这样当我们尝试修改数据对象 `name` 属性的值时就会触发 `name` 属性的 `set` 拦截器函数，这样就有机会调用 `Dep` 实例对象的 `notify` 方法，从而触发了响应，如下代码截取自 `defineReactive` 函数中的 `set` 拦截器函数：

```js {3}
set: function reactiveSetter (newVal) {
  // 省略...
  dep.notify()
}
```

如上高亮代码所示，可以看到当属性值变化时确实通过 `set` 拦截器函数调用了 `Dep` 实例对象的 `notify` 方法，这个方法就是用来通知变化的，我们找到 `Dep` 类的 `notify` 方法，如下：

```js {6,21}
export default class Dep {
  // 省略...

  constructor () {
    this.id = uid++
    this.subs = []
  }

  // 省略...

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}
```

大家观察 `notify` 函数可以发现其中包含如下这段 `if` 条件语句块：

```js
if (process.env.NODE_ENV !== 'production' && !config.async) {
  // subs aren't sorted in scheduler if not running async
  // we need to sort them now to make sure they fire in correct
  // order
  subs.sort((a, b) => a.id - b.id)
}
```

对于这段代码的作用，我们会在本章的 [同步执行观察者](#同步执行观察者) 一节中对其详细讲解，现在大家可以完全忽略，这并不影响我们对代码的理解。如果我们去掉如上这段代码，那么 `notify` 函数将变为：

```js
notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
```

`notify` 方法只做了一件事，就是遍历当前 `Dep` 实例对象的 `subs` 属性中所保存的所有观察者对象，并逐个调用观察者对象的 `update` 方法，这就是触发响应的实现机制，那么大家应该也猜到了，重新求值的操作应该是在 `update` 方法中进行的，那我们就找到观察者对象的 `update` 方法，看看它做了什么事情，如下：

```js
update () {
  /* istanbul ignore else */
  if (this.computed) {
    // 省略...
  } else if (this.sync) {
    this.run()
  } else {
    queueWatcher(this)
  }
```

在 `update` 方法中代码被拆分成了三部分，即 `if...else if...else` 语句块。首先 `if` 语句块的代码会在判断条件 `this.computed` 为真的情况下执行，我们说过 `this.computed` 属性是用来判断该观察者是不是计算属性的观察者，这部分代码我们将会在计算属性部分详细讲解。也就是说渲染函数的观察者肯定是不会执行 `if` 语句块中的代码的，此时会继续判断 `else...if` 语句的条件 `this.sync` 是否为真，我们知道 `this.sync` 属性的值就是创建观察者实例对象时传递的第三个选项参数中的 `sync` 属性的值，这个值的真假代表了当变化发生时是否同步更新变化。对于渲染函数的观察者来讲，它并不是同步更新变化的，而是将变化放到一个异步更新队列中，也就是 `else` 语句块中代码所做的事情，即 `queueWatcher` 会将当前观察者对象放到一个异步更新队列，这个队列会在调用栈被清空之后按照一定的顺序执行。关于更多异步更新队列的内容我们会在后面单独讲解，这里大家只需要知道一件事情，那就是无论是同步更新变化还是将更新变化的操作放到异步更新队列，真正的更新变化操作都是通过调用观察者实例对象的 `run` 方法完成的。所以此时我们应该把目光转向 `run` 方法，如下：

```js
run () {
  if (this.active) {
    this.getAndInvoke(this.cb)
  }
}
```

`run` 方法的代码很简短，它判断了当前观察者实例的 `this.active` 属性是否为真，其中 `this.active` 属性用来标识一个观察者是否处于激活状态，或者可用状态。如果观察者处于激活状态那么 `this.active` 的值为真，此时会调用观察者实例对象的 `getAndInvoke` 方法，并以 `this.cb` 作为参数，我们知道 `this.cb` 属性是一个函数，我们称之为回调函数，当变化发生时会触发，但是对于渲染函数的观察者来讲，`this.cb` 属性的值为 `noop`，即什么都不做。

现在我们终于找到了更新变化的根源，那就是 `getAndInvoke` 方法，如下：

```js {2}
getAndInvoke (cb: Function) {
  const value = this.get()
  if (
    value !== this.value ||
    // Deep watchers and watchers on Object/Arrays should fire even
    // when the value is the same, because the value may
    // have mutated.
    isObject(value) ||
    this.deep
  ) {
    // set new value
    const oldValue = this.value
    this.value = value
    this.dirty = false
    if (this.user) {
      try {
        cb.call(this.vm, value, oldValue)
      } catch (e) {
        handleError(e, this.vm, `callback for watcher "${this.expression}"`)
      }
    } else {
      cb.call(this.vm, value, oldValue)
    }
  }
}
```

在 `getAndInvoke` 方法中，第一句代码就调用了 `this.get` 方法，这意味着重新求值，这也证明了我们在上一小节中的假设。对于渲染函数的观察者来讲，重新求值其实等价于重新执行渲染函数，最终结果就是重新生成了虚拟DOM并更新真实DOM，这样就完成了重新渲染的过程。在重新调用 `this.get` 方法之后是一个 `if` 语句块，实际上对于渲染函数的观察者来讲并不会执行这个 `if` 语句块，因为 `this.get` 方法的返回值其实就等价于 `updateComponent` 函数的返回值，这个值将永远都是 `undefined`。实际上 `if` 语句块内的代码是为非渲染函数类型的观察者准备的，它用来对比新旧两次求值的结果，当值不相等的时候会调用通过参数传递进来的回调。我们先看一下判断条件，如下：

```js {3，7-8}
const value = this.get()
if (
  value !== this.value ||
  // Deep watchers and watchers on Object/Arrays should fire even
  // when the value is the same, because the value may
  // have mutated.
  isObject(value) ||
  this.deep
) {
  // 省略...
}
```

首先对比新值 `value` 和旧值 `this.value` 是否相等，只有在不相等的情况下才需要执行回调，但是两个值相等就一定不执行回调吗？未必，这个时候就需要检测第二个条件是否成立，即 `isObject(value)`，判断新值的类型是否是对象，如果是对象的话即使值不变也需要执行回调，注意这里的“不变”指的是引用不变，如下代码所示：

```js
const data = {
  obj: {
    a: 1
  }
}
const obj1 = data.obj
data.obj.a = 2
const obj2 = data.obj

console.log(obj1 === obj2) // true
```

上面的代码中由于 `obj1` 与 `obj2` 具有相同的引用，所以他们总是相等的，但其实数据已经变化了，这就是判断 `isObject(value)` 为真则执行回调的原因。

接下来我们就看一下 `if` 语句块内的代码：

```js
const oldValue = this.value
this.value = value
this.dirty = false
if (this.user) {
  try {
    cb.call(this.vm, value, oldValue)
  } catch (e) {
    handleError(e, this.vm, `callback for watcher "${this.expression}"`)
  }
} else {
  cb.call(this.vm, value, oldValue)
}
```

代码如果执行到了 `if` 语句块内，则说明应该执行观察者的回调函数了。首先定义了 `oldValue` 常量，它的值是旧值，紧接着使用新值更新了 `this.value` 的值。我们可以看到如上代码中是如何执行回调的：

```js
cb.call(this.vm, value, oldValue)
```

将回调函数的作用域修改为当前 `Vue` 组件对象，然后传递了两个参数，分别是新值和旧值。

另外大家可能注意到了这句代码：`this.dirty = false`，将观察者实例对象的 `this.dirty` 属性设置为 `false`，实际上 `this.dirty` 属性也是为计算属性准备的，由于计算属性是惰性求值，所以在实例化计算属性的时候 `this.dirty` 的值会被设置为 `true`，代表着还没有求值，后面当真正对计算属性求值时，也就是执行如上代码时才会将 `this.dirty` 设置为 `false`，代表着已经求过值了。

除此之外，我们注意如下代码：

```js
if (this.user) {
  try {
    cb.call(this.vm, value, oldValue)
  } catch (e) {
    handleError(e, this.vm, `callback for watcher "${this.expression}"`)
  }
} else {
  cb.call(this.vm, value, oldValue)
}
```

在调用回调函数的时候，如果观察者对象的 `this.user` 为真意味着这个观察者是开发者定义的，所谓开发者定义的是指那些通过 `watch` 选项或 `$watch` 函数定义的观察者，这些观察者的特点是回调函数是由开发者编写的，所以这些回调函数在执行的过程中其行为是不可预知的，很可能出现错误，这时候将其放到一个 `try...catch` 语句块中，这样当错误发生时我们就能够给开发者一个友好的提示。并且我们注意到在提示信息中包含了 `this.expression` 属性，我们前面说过该属性是被观察目标(`expOrFn`)的字符串表示，这样开发者就能清楚的知道是哪里发生了错误。

## 异步更新队列

### 异步更新的意义

接下来我们就聊一聊 `Vue` 中的异步更新队列。在上一节中我们讲解了触发依赖的过程，举个例子如下：

```html {2,12}
<div id="app">
  <p>{{name}}</p>
</div>

<script>
  new Vue({
    el: '#app',
    data: {
      name: ''
    },
    mounted () {
      this.name = 'hcy'
    }
  })
</script>
```

如上代码所示，我们在模板中使用了数据对象的 `name` 属性，这意味着 `name` 属性将会收集渲染函数的观察者作为依赖，接着我们在 `mounted` 钩子中修改了 `name` 属性的值，这样就会触发响应：**渲染函数的观察者会重新求值，完成重渲染**，这个过程可以用一张图来描述，如下图所示：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-05-25-082631.jpg)

上图描述了一个同步的视图更新过程，从属性值的变化到完成重新渲染，这是一个同步更新的过程，大家思考一下“同步更新”会导致什么问题？很显然这会导致每次属性值的变化都会引发一次重新渲染，假设我们要修改两个属性的值，那么同步更新将导致两次的重渲染，如下图所示：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-05-23-131015.jpg)

有时候这是致命的缺陷，想象一下复杂业务场景，你可能会同时修改很多属性的值，如果每次属性值的变化都要重新渲染，就会导致严重的性能问题，而异步更新队列就是用来解决这个问题的，为了让大家更好地理解，我们同样用一张图来描述异步更新的过程，如下：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-05-25-103029.jpg)

上图描述了异步更新的过程，与同步更新的不同之处在于，每次修改属性的值之后并没有立即重新求值，而是将需要执行更新操作的观察者放入一个队列中。当我们修改 `name` 属性值时，由于 `name` 属性收集了渲染函数的观察者(后面我们称其为 `renderWatcher`)作为依赖，所以此时 `renderWatcher` 会被添加到队列中，接着我们修改了 `age` 属性的值，由于 `age` 属性也收集了 `renderWatcher` 作为依赖，所以此时也会尝试将 `renderWatcher` 添加到队列中，但是由于 `renderWatcher` 已经存在于队列中了，所以并不会重复添加，这样队列中将只会存在一个 `renderWatcher`。当所有的突变完成之后，再一次性的执行队列中所有观察者的更新方法，同时清空队列，这样就达到了优化的目的。

接下来我们就从具体代码入手，看一看其具体实现，我们知道当修改一个属性的值时，会通过执行该属性所收集的所有观察者对象的 `update` 方法进行更新，那么我们就找到观察者对象的 `update` 方法，如下：

```js {8}
update () {
  /* istanbul ignore else */
  if (this.computed) {
    // 省略...
  } else if (this.sync) {
    this.run()
  } else {
    queueWatcher(this)
  }
}
```

如上高亮代码所示，如果没有指定这个观察者是同步更新(`this.sync` 为真)，那么这个观察者的更新机制就是异步的，这时当调用观察者对象的 `update` 方法时，在 `update` 方法内部会调用 `queueWatcher` 函数，并将当前观察者对象作为参数传递，`queueWatcher` 函数的作用就是我们前面讲到过的，它将观察者放到一个队列中等待所有突变完成之后统一执行更新。

`queueWatcher` 函数来自 `src/core/observer/scheduler.js` 文件，如下是 `queueWatcher` 函数的全部代码：

```js
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true
    if (!flushing) {
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      nextTick(flushSchedulerQueue)
    }
  }
}
```

`queueWatcher` 函数接收观察者对象作为参数，首先定义了 `id` 常量，它的值是观察者对象的唯一 `id`，然后执行 `if` 判断语句，如下是简化的代码：

```js {3-4}
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true
    // 省略...
  }
}
```

其中变量 `has` 定义在 `scheduler.js` 文件头部，它是一个空对象：

```js
let has: { [key: number]: ?true } = {}
```

当 `queueWatcher` 函数被调用之后，会尝试将该观察者放入队列中，并将该观察者的 `id` 值登记到 `has` 对象上作为 `has` 对象的属性同时将该属性值设置为 `true`。该 `if` 语句以及变量 `has` 的作用就是用来避免将相同的观察者重复入队的。在该 `if` 语句块内执行了真正的入队操作，如下代码高亮的部分所示：

```js {6}
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true
    if (!flushing) {
      queue.push(watcher)
    } else {
      // 省略...
    }
    // 省略...
  }
}
```

其中 `queue` 常量也定义在 `scheduler.js` 文件的头部：

```js
const queue: Array<Watcher> = []
```

`queue` 常量是一个数组，入队就是调用该数组的 `push` 方法将观察者添加到数组的尾部。在入队之前有一个对变量 `flushing` 的判断，`flushing` 变量也定义在 `scheduler.js` 文件的头部，它的初始值是 `false`：

```js
let flushing = false
```

`flushing` 变量是一个标志，我们知道放入队列 `queue` 中的所有观察者将会在突变完成之后统一执行更新，当更新开始时会将 `flushing` 变量的值设置为 `true`，代表着此时正在执行更新，所以根据判断条件 `if (!flushing)` 可知只有当队列没有执行更新时才会简单地将观察者追加到队列的尾部，有的同学可能会问：“难道在队列执行更新的过程中还会有观察者入队的操作吗？”，实际上是会的，典型的例子就是计算属性，比如队列执行更新时经常会执行渲染函数观察者的更新，渲染函数中很可能有计算属性的存在，由于计算属性在实现方式上与普通响应式属性有所不同，所以当触发计算属性的 `get` 拦截器函数时会有观察者入队的行为，这个时候我们需要特殊处理，也就是 `else` 分支的代码，如下：

```js {10-14}
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true
    if (!flushing) {
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // 省略...
  }
}
```

如上高亮的代码所示，当变量 `flushing` 为真时，说明队列正在执行更新，这时如果有观察者入队则会执行 `else` 分支中的代码，这段代码的作用是为了保证观察者的执行顺序，现在大家只需要知道观察者会被放入 `queue` 队列中即可，我们后面会详细讨论。

接着我们再来看如下代码：

```js {7-15}
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true
    // 省略...
    // queue the flush
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      nextTick(flushSchedulerQueue)
    }
  }
}
```

大家观察如上代码中有这样一段 `if` 条件语句：

```js
if (process.env.NODE_ENV !== 'production' && !config.async) {
  flushSchedulerQueue()
  return
}
```

在接下来的讲解中我们将会忽略这段代码，并在 [同步执行观察者](#同步执行观察者) 一节中补充讲解，

我们回到那段高亮的代码，这段代码是一个 `if` 语句块，其中变量 `waiting` 同样是一个标志，它也定义在 `scheduler.js` 文件头部，初始值为 `false`：

```js
let waiting = false
```

为什么需要这个标志呢？我们看 `if` 语句块内的代码就知道了，在 `if` 语句块内先将 `waiting` 的值设置为 `true`，这意味着无论调用多少次 `queueWatcher` 函数，该 `if` 语句块的代码只会执行一次。接着调用 `nextTick` 并以 `flushSchedulerQueue` 函数作为参数，其中 `flushSchedulerQueue` 函数的作用之一就是用来将队列中的观察者统一执行更新的。对于 `nextTick` 相信大家已经很熟悉了，其实最好理解的方式就是把 `nextTick` 看做 `setTimeout(fn, 0)`，如下：

```js {9}
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true
    // 省略...
    // queue the flush
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      setTimeout(flushSchedulerQueue, 0)
    }
  }
}
```

我们完全可以使用 `setTimeout` 替换 `nextTick`，我们只需要执行一次 `setTimeout` 语句即可，`waiting` 变量就保证了 `setTimeout` 语句只会执行一次，这样 `flushSchedulerQueue` 函数将会在下一次事件循环开始时立即调用，但是既然可以使用 `setTimeout` 替换 `nextTick` 那么为什么不用 `setTimeout` 呢？原因就在于 `setTimeout` 并不是最优的选择，`nextTick` 的意义就是它会选择一条最优的解决方案，接下来我们就讨论一下 `nextTick` 是如何实现的。

### nextTick 的实现

`nextTick` 函数来自于 `src/core/util/next-tick.js` 文件，对于 `nextTick` 函数相信大家都不陌生，我们常用的 `$nextTick` 方法实际上就是对 `nextTick` 函数的封装，如下：

```js
export function renderMixin (Vue: Class<Component>) {
  // 省略...
  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }
  // 省略...
}
```

`$nextTick` 方法是在 `renderMixin` 函数中挂载到 `Vue` 原型上的，可以看到 `$nextTick` 函数体只有一句话即调用 `nextTick` 函数，这说明 `$nextTick` 确实是对 `nextTick` 函数的简单包装。

前面说过 `nextTick` 函数的作用相当于 `setTimeout(fn, 0)`，这里有几个概念需要大家去了解一下，即调用栈、任务队列、事件循环，`javascript` 是一种单线程的语言，它的一切都是建立在以这三个概念为基础之上的。详细内容在这里就不讨论了，读者自行补充，后面的讲解将假设大家对这些概念已经非常清楚了。

我们知道任务队列并非只有一个队列，在 `node` 中更为复杂，但总的来说我们可以将其分为 `microtask` 和 `(macro)task`，并且这两个队列的行为还要依据不同浏览器的具体实现去讨论，这里我们只讨论被广泛认同和接受的队列执行行为。当调用栈空闲后每次事件循环只会从 `(macro)task` 中读取一个任务并执行，而在同一次事件循环内会将 `microtask` 队列中所有的任务全部执行完毕，且要先于 `(macro)task`。另外 `(macro)task` 中两个不同的任务之间可能穿插着UI的重渲染，那么我们只需要在 `microtask` 中把所有在UI重渲染之前需要更新的数据全部更新，这样只需要一次重渲染就能得到最新的DOM了。恰好 `Vue` 是一个数据驱动的框架，如果能在UI重渲染之前更新所有数据状态，这对性能的提升是一个很大的帮助，所有要优先选用 `microtask` 去更新数据状态而不是 `(macro)task`，这就是为什么不使用 `setTimeout` 的原因，因为 `setTimeout` 会将回调放到 `(macro)task` 队列中而不是 `microtask` 队列，所以理论上最优的选择是使用 `Promise`，当浏览器不支持 `Promise` 时再降级为 `setTimeout`。如下是 `next-tick.js` 文件中的一段代码：

```js
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  microTimerFunc = () => {
    p.then(flushCallbacks)
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
} else {
  // fallback to macro
  microTimerFunc = macroTimerFunc
}
```

其中变量 `microTimerFunc` 定义在文件头部，它的初始值是 `undefined`，上面的代码中首先检测当前宿主环境是否支持原生的 `Promise`，如果支持则优先使用 `Promise` 注册 `microtask`，做法很简单，首先定义常量 `p` 它的值是一个立即 `resolve` 的 `Promise` 实例对象，接着将变量 `microTimerFunc` 定义为一个函数，这个函数的执行将会把 `flushCallbacks` 函数注册为 `microtask`。另外大家注意这句代码：

```js
if (isIOS) setTimeout(noop)
```

注释已经写得很清楚了，这是一个解决怪异问题的变通方法，在一些 `UIWebViews` 中存在很奇怪的问题，即 `microtask` 没有被刷新，对于这个问题的解决方案就是让浏览做一些其他的事情比如注册一个 `(macro)task` 即使这个 `(macro)task` 什么都不做，这样就能够间接触发 `microtask` 的刷新。

使用 `Promise` 是最理想的方案，但是如果宿主环境不支持 `Promise`，我们就需要降级处理，即注册 `(macro)task`，这就是 `else` 语句块内代码所做的事情：

```js {5}
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  // 省略...
} else {
  // fallback to macro
  microTimerFunc = macroTimerFunc
}
```

将 `macroTimerFunc` 的值赋值给 `microTimerFunc`。我们知道 `microTimerFunc` 用来将 `flushCallbacks` 函数注册为 `microtask`，而 `macroTimerFunc` 则是用来将 `flushCallbacks` 函数注册为 `(macro)task` 的，来看下面这段代码：

```js
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  macroTimerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else if (typeof MessageChannel !== 'undefined' && (
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === '[object MessageChannelConstructor]'
)) {
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = flushCallbacks
  macroTimerFunc = () => {
    port.postMessage(1)
  }
} else {
  /* istanbul ignore next */
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}
```

将一个回调函数注册为 `(macro)task` 的方式有很多，如 `setTimeout`、`setInterval` 以及 `setImmediate` 等等，但不同的方案之间是有区别的，通过上面的代码我们可以看到 `setTimeout` 被作为最后的备选方案：

```js {11-13}
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 省略...
} else if (typeof MessageChannel !== 'undefined' && (
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === '[object MessageChannelConstructor]'
)) {
  // 省略...
} else {
  /* istanbul ignore next */
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}
```

而首选方案是 `setImmediate`：

```js {2-4}
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  macroTimerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else if (typeof MessageChannel !== 'undefined' && (
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === '[object MessageChannelConstructor]'
)) {
  // 省略...
} else {
  // 省略...
}
```

如果宿主环境支持原生 `setImmediate` 函数，则使用 `setImmediate` 注册 `(macro)task`，为什么首选 `setImmediate` 呢？这是有原因的，因为 `setImmediate` 拥有比 `setTimeout` 更好的性能，这个问题很好理解，`setTimeout` 在将回调注册为 `(macro)task` 之前要不停的做超时检测，而 `setImmediate` 则不需要，这就是优先选用 `setImmediate` 的原因。但是 `setImmediate` 的缺陷也很明显，就是它的兼容性问题，到目前为止只有IE浏览器实现了它，所以为了兼容非IE浏览器我们还需要做兼容处理，只不过此时还轮不到 `setTimeout` 上场，而是使用 `MessageChannel`：

```js {8-13}
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 省略...
} else if (typeof MessageChannel !== 'undefined' && (
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === '[object MessageChannelConstructor]'
)) {
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = flushCallbacks
  macroTimerFunc = () => {
    port.postMessage(1)
  }
} else {
  // 省略...
}
```

相信大家应该了解过 `Web Workers`，实际上 `Web Workers` 的内部实现就是用到了 `MessageChannel`，一个 `MessageChannel` 实例对象拥有两个属性 `port1` 和 `port2`，我们只需要让其中一个 `port` 监听 `onmessage` 事件，然后使用另外一个 `port` 的 `postMessage` 向前一个 `port` 发送消息即可，这样前一个 `port` 的 `onmessage` 回调就会被注册为 `(macro)task`，由于它也不需要做任何检测工作，所以性能也要优于 `setTimeout`。总之 `macroTimerFunc` 函数的作用就是将 `flushCallbacks` 注册为 `(macro)task`。

现在是时候仔细看一下 `nextTick` 函数都做了什么事情了，不过为了更融入理解 `nextTick` 函数的代码，我们需要从 `$nextTick` 方法入手，如下：

```js {3-5}
export function renderMixin (Vue: Class<Component>) {
  // 省略...
  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }
  // 省略...
}
```

`$nextTick` 方法只接收一个回调函数作为参数，但在内部调用 `nextTick` 函数时，除了把回调函数 `fn` 透传之外，第二个参数是硬编码为当前组件实例对象 `this`。我们知道在使用 `$nextTick` 方法时是可以省略回调函数这个参数的，这时 `$nextTick` 方法会返回一个 `promise` 实例对象。这些功能实际上都是由 `nextTick` 函数提供的，如下是 `nextTick` 函数的签名：

```js
export function nextTick (cb?: Function, ctx?: Object) {
  // 省略...
}
```

`nextTick` 函数接收两个参数，第一个参数是一个回调函数，第二个参数指定一个作用域。下面我们逐个分析传递回调函数与不传递回调函数这两种使用场景功能的实现，首先我们来看传递回调函数的情况，那么此时参数 `cb` 就是回调函数，来看如下代码：

```js
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  // 省略
}
```

`nextTick` 函数会在 `callbacks` 数组中添加一个新的函数，`callbacks` 数组定义在文件头部：`const callbacks = []`。注意并不是将 `cb` 回调函数直接添加到 `callbacks` 数组中，但这个被添加到 `callbacks` 数组中的函数的执行会间接调用 `cb` 回调函数，并且可以看到在调用 `cb` 函数时使用 `.call` 方法将函数 `cb` 的作用域设置为 `ctx`，也就是 `nextTick` 函数的第二个参数。所以对于 `$nextTick` 方法来讲，传递给 `$nextTick` 方法的回调函数的作用域就是当前组件实例对象，当然了前提是回调函数不能是箭头函数，其实在平时的使用中，回调函数使用箭头函数也没关系，只要你能够达到你的目的即可。另外我们再次强调一遍，此时回调函数并没有被执行，当你调用 `$nextTick` 方法并传递回调函数时，会使用一个新的函数包裹回调函数并将新函数添加到 `callbacks` 数组中。

我们继续看 `nextTick` 函数的代码，如下：

```js
export function nextTick (cb?: Function, ctx?: Object) {
  // 省略...
  if (!pending) {
    pending = true
    if (useMacroTask) {
      macroTimerFunc()
    } else {
      microTimerFunc()
    }
  }
  // 省略...
}
```

在将回调函数添加到 `callbacks` 数组之后，会进行一个 `if` 条件判断，判断变量 `pending` 的真假，`pending` 变量也定义在文件头部：`let pending = false`，它是一个标识，它的真假代表回调队列是否处于等待刷新的状态，初始值是 `false` 代表回调队列为空不需要等待刷新。假如此时在某个地方调用了 `$nextTick` 方法，那么 `if` 语句块内的代码将会被执行，在 `if` 语句块内优先将变量 `pending` 的值设置为 `true`，代表着此时回调队列不为空，正在等待刷新。既然等待刷新，那么当然要刷新回调队列啊，怎么刷新呢？这时就用到了我们前面讲过的 `microTimerFunc` 或者 `macroTimerFunc` 函数，我们知道这两个函数的作用是将 `flushCallbacks` 函数分别注册为 `microtask` 和 `(macro)task`。但是无论哪种任务类型，它们都将会等待调用栈清空之后才执行。如下：

```js
created () {
  this.$nextTick(() => { console.log(1) })
  this.$nextTick(() => { console.log(2) })
  this.$nextTick(() => { console.log(3) })
}
```

上面的代码中我们在 `created` 钩子中连续调用三次 `$nextTick` 方法，但只有第一次调用 `$nextTick` 方法时才会执行 `microTimerFunc` 函数将 `flushCallbacks` 注册为 `microtask`，但此时 `flushCallbacks` 函数并不会执行，因为它要等待接下来的两次 `$nextTick` 方法的调用语句执行完后才会执行，或者准确的说等待调用栈被清空之后才会执行。也就是说当 `flushCallbacks` 函数执行的时候，`callbacks` 回调队列中将包含本次事件循环所收集的所有通过 `$nextTick` 方法注册的回调，而接下来的任务就是在 `flushCallbacks` 函数内将这些回调全部执行并清空。如下是 `flushCallbacks` 函数的源码：

```js
function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}
```

很好理解，首先将变量 `pending` 重置为 `false`，接着开始执行回调，但需要注意的是在执行 `callbacks` 队列中的回调函数时并没有直接遍历 `callbacks` 数组，而是使用 `copies` 常量保存一份 `callbacks` 的复制，然后遍历 `copies` 数组，并且在遍历 `copies` 数组之前将 `callbacks` 数组清空：`callbacks.length = 0`。为什么要这么做呢？这么做肯定是有原因的，我们模拟一下整个异步更新的流程就明白了，如下代码：

```js {3，5}
created () {
  this.name = 'HcySunYang'
  this.$nextTick(() => {
    this.name = 'hcy'
    this.$nextTick(() => { console.log('第二个 $nextTick') })
  })
}
```

上面代码中我们在外层 `$nextTick` 方法的回调函数中再次调用了 `$nextTick` 方法，理论上外层 `$nextTick` 方法的回调函数不应该与内层 `$nextTick` 方法的回调函数在同一个 `microtask` 任务中被执行，而是两个不同的 `microtask` 任务，虽然在结果上看或许没什么差别，但从设计角度就应该这么做。

我们注意上面代码中我们修改了两次 `name` 属性的值(假设它是响应式数据)，首先我们将 `name` 属性的值修改为字符串 `HcySunYang`，我们前面讲过这会导致依赖于 `name` 属性的渲染函数观察者被添加到 `queue` 队列中，这个过程是通过调用 `src/core/observer/scheduler.js` 文件中的 `queueWatcher` 函数完成的。同时在 `queueWatcher` 函数内会使用 `nextTick` 将 `flushSchedulerQueue` 添加到 `callbacks` 数组中，所以此时 `callbacks` 数组如下：

```js
callbacks = [
  flushSchedulerQueue // queue = [renderWatcher]
]
```

同时会将 `flushCallbacks` 函数注册为 `microtask`，所以此时 `microtask` 队列如下：

```js
// microtask 队列
[
  flushCallbacks
]
```

接着调用了第一个 `$nextTick` 方法，`$nextTick` 方法会将其回调函数添加到 `callbacks` 数组中，那么此时的 `callbacks` 数组如下：

```js
callbacks = [
  flushSchedulerQueue, // queue = [renderWatcher]
  () => {
    this.name = 'hcy'
    this.$nextTick(() => { console.log('第二个 $nextTick') })
  }
]
```

接下来主线程处于空闲状态(调用栈清空)，开始执行 `microtask` 队列中的任务，即执行 `flushCallbacks` 函数，`flushCallbacks` 函数会按照顺序执行 `callbacks` 数组中的函数，首先会执行 `flushSchedulerQueue` 函数，这个函数会遍历 `queue` 中的所有观察者并重新求值，完成重新渲染(`re-render`)，在完成渲染之后，本次更新队列已经清空，`queue` 会被重置为空数组，一切状态还原。接着会执行如下函数：

```js
() => {
  this.name = 'hcy'
  this.$nextTick(() => { console.log('第二个 $nextTick') })
}
```

这个函数是第一个 `$nextTick` 方法的回调函数，由于在执行该回调函数之前已经完成了重新渲染，所以该回调函数内的代码是能够访问更新后的DOM的，到目前为止一切都很正常，我们继续往下看，在该回调函数内再次修改了 `name` 属性的值为字符串 `hcy`，这会再次触发响应，同样的会调用 `nextTick` 函数将 `flushSchedulerQueue` 添加到 `callbacks` 数组中，但是由于在执行 `flushCallbacks` 函数时优先将 `pending` 的重置为 `false`，所以 `nextTick` 函数会将 `flushCallbacks` 函数注册为一个新的 `microtask`，此时 `microtask` 队列将包含两个 `flushCallbacks` 函数：

```js
// microtask 队列
[
  flushCallbacks, // 第一个 flushCallbacks
  flushCallbacks  // 第二个 flushCallbacks
]
```

怎么样？我们的目的达到了，现在有两个 `microtask` 任务。

而另外除了将变量 `pending` 的值重置为 `false` 之外，我们要知道第一个 `flushCallbacks` 函数遍历的并不是 `callbacks` 本身，而是它的复制品 `copies` 数组，并且在第一个 `flushCallbacks` 函数的一开头就清空了 `callbacks` 数组本身。所以第二个 `flushCallbacks` 函数的一切流程与第一个 `flushCallbacks` 是完全相同。

最后我们再来讲一下，当调用 `$nextTick` 方法时不传递回调函数时，是如何实现返回 `Promise` 实例对象的，实现很简单我们来看一下 `nextTick` 函数的代码，如下：

```js {5-9}
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 省略...
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
```

如上高亮代码所示，当 `nextTick` 函数没有接收到 `cb` 参数时，会检测当前宿主环境是否支持 `Promise`，如果支持则直接返回一个 `Promise` 实例对象，并且将 `resolve` 函数赋值给 `_resolve` 变量，`_resolve` 变量声明在 `nextTick` 函数的顶部。同时再来看如下代码：

```js {10-12}
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  // 省略...
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
```

当 `flushCallbacks` 函数开始执行 `callbacks` 数组中的函数时，如果没有传递 `cb` 参数，则直接调用 `_resolve` 函数，我们知道这个函数就是返回的 `Promise` 实例对象的 `resolve` 函数。这样就实现了 `Promise` 方式的 `$nextTick` 方法。

## $watch和watch选项的实现

前面我们已经讲了足够多关于 `Watcher` 类的内容，接下来是时候看一下 `$watch` 方法以及 `watch` 选项的实现了。实际上无论是 `$watch` 方法还是 `watch` 选项，他们的实现都是基于 `Watcher` 的封装。首先我们来看一下 `$watch` 方法，它定义在 `src/core/instance/state.js` 文件的 `stateMixin` 函数中，如下：

```js
Vue.prototype.$watch = function (
  expOrFn: string | Function,
  cb: any,
  options?: Object
): Function {
  const vm: Component = this
  if (isPlainObject(cb)) {
    return createWatcher(vm, expOrFn, cb, options)
  }
  options = options || {}
  options.user = true
  const watcher = new Watcher(vm, expOrFn, cb, options)
  if (options.immediate) {
    cb.call(vm, watcher.value)
  }
  return function unwatchFn () {
    watcher.teardown()
  }
}
```

`$watch` 方法允许我们观察数据对象的某个属性，当属性变化时执行回调。所以 `$watch` 方法至少接收两个参数，一个要观察的属性，以及一个回调函数。通过上面的代码我们发现，`$watch` 方法接收三个参数，除了前面介绍的两个参数之后还接收第三个参数，它是一个选项参数，比如是否立即执行回调或者是否深度观测等。我们可以发现这三个参数与 `Watcher` 类的构造函数中的三个参数相匹配，如下：

```js {4-6}
export default class Watcher {
  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    // 省略...
  }
}
```

其实这很好理解，因为 `$watch` 方法的实现本质就是创建了一个 `Watcher` 实例对象。另外通过官方文档的介绍可知 `$watch` 方法的第二个参数既可以是一个回调函数，也可以是一个纯对象，这个对象中可以包含 `handler` 属性，该属性的值将作为回调函数，同时该对象还可以包含其他属性作为选项参数，如 `immediate` 或 `deep`。

现在我们假设传递给 `$watch` 方法的第二个参数是一个函数，看看它是怎么实现的，在 `$watch` 方法内部首先执行的是如下代码：

```js
const vm: Component = this
if (isPlainObject(cb)) {
  return createWatcher(vm, expOrFn, cb, options)
}
```

定义了 `vm` 常量，它是当前组件实例对象，接着检测传递给 `$watch` 的第二个参数是否是纯对象，由于我们现在假设参数 `cb` 是一个函数，所以这段 `if` 语句块内的代码不会执行。再往下是这段代码：

```js
options = options || {}
options.user = true
const watcher = new Watcher(vm, expOrFn, cb, options)
```

首先如果没有传递 `options` 选项参数，那么会给其一个默认的空对象，接着将 `options.user` 的值设置为 `true`，我们前面讲到过这代表该观察者实例是用户创建的，然后就到了关键的一步，即创建 `Watcher` 实例对象，多么简单的实现。

再往下是一段 `if` 语句块：

```js
if (options.immediate) {
  cb.call(vm, watcher.value)
}
```

我们知道 `immediate` 选项用来在属性或函数被侦听后立即执行回调，如上代码就是其实现原理，如果发现 `options.immediate` 选项为真，那么会执行回调函数，不过此时回调函数的参数只有新值没有旧值。同时取值的方式是通过前面创建的观察者实例对象的 `watcher.value` 属性。我们知道观察者实例对象的 `value` 属性，保存着被观察属性的值。

最后 `$watch` 方法还有一个返回值，如下：

```js
return function unwatchFn () {
  watcher.teardown()
}
```

`$watch` 函数返回一个函数，这个函数的执行会解除当前观察者对属性的观察。它的原理是通过调用观察者实例对象的 `watcher.teardown` 函数实现的。我们可以看一下 `watcher.teardown` 函数是如何解除观察者与属性之间的关系的，如下是 `teardown` 函数的代码：

```js
export default class Watcher {
  // 省略...
  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
```

首先检查 `this.active` 属性是否为真，如果为假则说明该观察者已经不处于激活状态，什么都不需要做，如果为真则会执行 `if` 语句块内的代码，在 `if` 语句块内首先执行的这段代码：

```js
if (!this.vm._isBeingDestroyed) {
  remove(this.vm._watchers, this)
}
```

首先说明一点，每个组件实例都有一个 `vm._isBeingDestroyed` 属性，它是一个标识，为真说明该组件实例已经被销毁了，为假说明该组件还没有被销毁，所以以上代码的意思是如果组件没有被销毁，那么将当前观察者实例从组件实例对象的 `vm._watchers` 数组中移除，我们知道 `vm._watchers` 数组中包含了该组件所有的观察者实例对象，所以将当前观察者实例对象从 `vm._watchers` 数组中移除是解除属性与观察者实例对象之间关系的第一步。由于这个操作的性能开销比较大，所以仅在组件没有被销毁的情况下才会执行此操作。

将观察者实例对象从 `vm._watchers` 数组中移除之后，会执行如下这段代码：

```js
let i = this.deps.length
while (i--) {
  this.deps[i].removeSub(this)
}
```

我们知道当一个属性与一个观察者建立联系之后，属性的 `Dep` 实例对象会收集到该观察者对象，同时观察者对象也会将该 `Dep` 实例对象收集，这是一个双向的过程，并且一个观察者可以同时观察多个属性，这些属性的 `Dep` 实例对象都会被收集到该观察者实例对象的 `this.deps` 数组中，所以解除属性与观察者之间关系的第二步就是将当前观察者实例对象从所有的 `Dep` 实例对象中移除，实现方法就如上代码所示。

最后会将当前观察者实例对象的 `active` 属性设置为 `false`，代表该观察者对象已经处于非激活状态了：

```js
this.active = false
```

以上就是 `$watch` 方法的实现，以及如何解除观察的实现。不过不要忘了我们前面所讲的这些内容是假设传递给 `$watch` 方法的第二个参数是一个函数，如果不是函数呢？比如是一个纯对象，这时如下高亮的代码就会被执行：

```js {7-9}
Vue.prototype.$watch = function (
  expOrFn: string | Function,
  cb: any,
  options?: Object
): Function {
  const vm: Component = this
  if (isPlainObject(cb)) {
    return createWatcher(vm, expOrFn, cb, options)
  }
  // 省略...
}
```

当参数 `cb` 不是函数，而是一个纯对象，则会调用 `createWatcher` 函数，并将参数透传，注意还多传递给 `createWatcher` 函数一个参数，即组件实例对象 `vm`，那么 `createWatcher` 函数做了什么呢？`createWatcher` 函数也定义在 `src/core/instance/state.js` 文件中，如下是 `createWatcher` 函数的代码：

```js
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}
```

其实 `createWatcher` 函数的作用就是将纯对象形式的参数规范化一下，然后再通过 `$watch` 方法创建观察者。可以看到 `createWatcher` 函数的最后一句代码就是通过调用 `$watch` 函数并将其返回。来看 `createWatcher` 函数的第一段代码：

```js
if (isPlainObject(handler)) {
  options = handler
  handler = handler.handler
}
```

检测参数 `handler` 是否是纯对象，有的同学可能会问：“在 `$watch` 方法中已经检测过参数 `cb` 是否是纯对象了，这里又检测了一次是否多此一举？”，其实这么做并不是多余的，因为 `createWatcher` 函数除了在 `$watch` 方法中使用之外，还会用于 `watch` 选项，而这时就需要对 `handler` 进行检测。总之如果 `handler` 是一个纯对象，那么就将变量 `handler` 的值赋给 `options` 变量，然后用 `handler.handler` 的值重写 `handler` 变量的值。举个例子，如下代码所示：

```js
vm.$watch('name', {
  handler () {
    console.log('change')
  },
  immediate: true
})
```

如果你像如上代码那样使用 `$watch` 方法，那么对于 `createWatcher` 函数来讲，其 `handler` 参数为：

```js
handler = {
  handler () {
    console.log('change')
  },
  immediate: true
}
```

所以如下这段代码：

```js
if (isPlainObject(handler)) {
  options = handler
  handler = handler.handler
}
```

等价于：

```js
if (isPlainObject(handler)) {
  options = {
    handler () {
      console.log('change')
    },
    immediate: true
  }
  handler = handler () {
    console.log('change')
  }
}
```

这样就可正常通过 `$watch` 方法创建观察者了。另外我们注意 `createWatcher` 函数中如下这段高亮代码：

```js {11-13}
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}
```

这段代码说明 `handler` 除了可以是一个纯对象还可以是一个字符串，当 `handler` 是一个字符串时，会读取组件实例对象的 `handler` 属性的值并用该值重写 `handler` 的值。然后再通过调用 `$watch` 方法创建观察者，这段代码实现的目的是什么呢？看如下例子就明白了：

```js
watch: {
  name: 'handleNameChange'
},
methods: {
  handleNameChange () {
    console.log('name change')
  }
}
```

上面的代码中我们在 `watch` 选项中观察了 `name` 属性，但是我们没有指定回调函数，而是指定了一个字符串 `handleNameChange`，这等价于指定了 `methods` 选项中同名函数作为回调函数。这就是如上 `createWatcher` 函数中那段高亮代码的目的。

上例中我们使用了 `watch` 选项，接下来我们就顺便来看一下 `watch` 选项是如何初始化的，找到 `initState` 函数，如下：

```js {12-14}
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

如上高亮代码所示，在这个 `if` 条件语句块中，调用 `initWatch` 函数，这个函数用来初始化 `watch` 选项，至于判断条件我们就不多讲了，前面的讲解中我们已经讲解过类似的判断条件。至于 `initWatch` 函数，它就定义在 `createWatcher` 函数的上方，如下是其全部代码：

```js
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}
```

可以看到 `initWatch` 函数就是通过对 `watch` 选项遍历，然后通过 `createWatcher` 函数创建观察者对象的，需要注意的是上面代码中有一个判断条件，如下高亮代码所示：

```js {4}
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}
```

通过这个条件我们可以发现 `handler` 常量可以是一个数组，`handler` 常量是什么呢？它的值是 `watch[key]`，也就是说我们在使用 `watch` 选项时可以通过传递数组来实现创建多个观察者，如下：

```js
watch: {
  name: [
    function () {
      console.log('name 改变了1')
    },
    function () {
      console.log('name 改变了2')
    }
  ]
}
```

总的来说，在 `Watcher` 类的基础上，无论是实现 `$watch` 方法还是实现 `watch` 选项，都变得非常容易，这得益于一个良好的设计。

## 深度观测的实现

接下来我们将会讨论深度观测的实现，在这之前我们需要回顾一下数据响应的原理，我们知道响应式数据的关键在于数据的属性是访问器属性，这使得我们能够拦截对该属性的读写操作，从而有机会收集依赖并触发响应。思考如下代码：

```js
watch: {
  a () {
    console.log('a 改变了')
  }
}
```

这段代码使用 `watch` 选项观测了数据对象的 `a` 属性，我们知道 `watch` 方法内部是通过创建 `Watcher` 实例对象来实现观测的，在创建 `Watcher` 实例对象时会读取 `a` 的值从而触发属性 `a` 的 `get` 拦截器函数，最终将依赖收集。但问题是如果属性 `a` 的值是一个对象，如下：

```js {3-5}
data () {
  return {
    a: {
      b: 1
    }
  }
},
watch: {
  a () {
    console.log('a 改变了')
  }
}
```

如上高亮代码所示，数据对象 `data` 的属性 `a` 是一个对象，当实例化 `Watcher` 对象并观察属性 `a` 时，会读取属性 `a` 的值，这样的确能够触发属性 `a` 的 `get` 拦截器函数，但由于没有读取 `a.b` 属性的值，所以对于 `b` 来讲是没有收集到任何观察者的。这就是我们常说的浅观察，直接修改属性 `a` 的值能够触发响应，而修改 `a.b` 的值是触发不了响应的。

深度观测就是用来解决这个问题的，深度观测的原理很简单，既然属性 `a.b` 中没有收集到观察者，那么我们就主动读取一下 `a.b` 的值，这样不就能够触发属性 `a.b` 的 `get` 拦截器函数从而收集到观察者了吗，其实 `Vue` 就是这么做的，只不过你需要将 `deep` 选项参数设置为 `true`，主动告诉 `Watcher` 实例对象你现在需要的是深度观测。我们找到 `Watcher` 类的 `get` 方法，如下：

```js {6, 16-18}
get () {
  pushTarget(this)
  let value
  const vm = this.vm
  try {
    value = this.getter.call(vm, vm)
  } catch (e) {
    if (this.user) {
      handleError(e, vm, `getter for watcher "${this.expression}"`)
    } else {
      throw e
    }
  } finally {
    // "touch" every property so they are all tracked as
    // dependencies for deep watching
    if (this.deep) {
      traverse(value)
    }
    popTarget()
    this.cleanupDeps()
  }
  return value
}
```

如上高亮代码所示，我们知道 `Watcher` 类的 `get` 方法用来求值，在 `get` 方法内部通过调用 `this.getter` 函数对被观察的属性求值，并将求得的值赋值给变量 `value`，同时我们可以看到在 `finally` 语句块内，如果 `this.deep` 属性的值为真说明是深度观测，此时会将被观测属性的值 `value` 作为参数传递给 `traverse` 函数，其中 `traverse` 函数的作用就是递归地读取被观察属性的所有子属性的值，这样被观察属性的所有子属性都将会收集到观察者，从而达到深度观测的目的。

`traverse` 函数来自 `src/core/observer/traverse.js` 文件，如下：

```js
const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}
```

上面的代码中定义了 `traverse` 函数，这个函数将接收被观察属性的值作为参数，拿到这个参数后在 `traverse` 函数内部会调用 `_traverse` 函数完成递归遍历。其中 `_traverse` 函数就定义在 `traverse` 函数的下方，如下是 `_traverse` 函数的签名：

```js
function _traverse (val: any, seen: SimpleSet) {
  // 省略...
}
```

`_traverse` 函数接收两个参数，第一个参数是被观察属性的值，第二个参数是一个 `Set` 数据结构的实例，可以看到在 `traverse` 函数中调用 `_traverse` 函数时传递的第二个参数 `seenObjects` 就是一个 `Set` 数据结构的实例，它定义在文件头部：`const seenObjects = new Set()`。

接下来我们看一下 `_traverse` 函数是如何遍历访问数据对象的，如下是 `_traverse` 函数的全部代码：

```js {7-13}
function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
```

注意上面代码中高亮的部分，现在我们把高亮的代码删除，那么 `_traverse` 函数将变成如下这个样子：

```js
function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
```

之所以要删除这段代码是为了降低复杂度，现在我们就当做删除的那段代码不存在，来看一下 `_traverse` 函数的实现，在 `_traverse` 函数的开头声明了两个变量，分别是 `i` 和 `keys`，这两个变量在后面会使用到，接着检查参数 `val` 是不是数组，并将检查结果存储在常量 `isA` 中。再往下是一段 `if` 语句块：

```js
if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
  return
}
```

这段代码是对参数 `val` 的检查，后面我们统一称 `val` 为 **被观察属性的值**，我们知道既然是深度观测，所以被观察属性的值要么是一个对象要么是一个数组，并且该值不能是冻结的，同时也不应该是 `VNode` 实例(这是Vue单独做的限制)。只有当被观察属性的值满足这些条件时，才会对其进行深度观测，只要有一项不满足 `_traverse` 就会 `return` 结束执行。所以上面这段 `if` 语句可以理解为是在检测被观察属性的值能否进行深度观测，一旦能够深度观测将会继续执行之后的代码，如下：

```js
if (isA) {
  i = val.length
  while (i--) _traverse(val[i], seen)
} else {
  keys = Object.keys(val)
  i = keys.length
  while (i--) _traverse(val[keys[i]], seen)
}
```

这段代码将检测被观察属性的值是数组还是对象，无论是数组还是对象都会通过 `while` 循环对其进行遍历，并递归调用 `_traverse` 函数，这段代码的关键在于递归调用 `_traverse` 函数时所传递的第一个参数：`val[i]` 和 `val[keys[i]]`。这两个参数实际上是在读取子属性的值，这将触发子属性的 `get` 拦截器函数，保证子属性能够收集到观察者，仅此而已。

现在 `_traverse` 函数的代码我们就解析完了，但大家有没有想过目前 `_traverse` 函数存在什么问题？别忘了前面我们删除了一段代码，如下：

```js
if (val.__ob__) {
  const depId = val.__ob__.dep.id
  if (seen.has(depId)) {
    return
  }
  seen.add(depId)
}
```

这段代码的作用不容忽视，它解决了循环引用导致死循环的问题，为了更好地说明问题我们举个例子，如下：

```js
const obj1 = {}
const obj2 = {}

obj1.data = obj2
obj2.data = obj1
```

上面代码中我们定义了两个对象，分别是 `obj1` 和 `obj2`，并且 `obj1.data` 属性引用了 `obj2`，而 `obj2.data` 属性引用了 `obj1`，这是一个典型的循环引用，假如我们使用 `obj1` 或 `obj2` 这两个对象中的任意一个对象出现在 `Vue` 的响应式数据中，如果不做防循环引用的处理，将会导致死循环，如下代码：

```js
function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
```

如果被观察属性的值 `val` 是一个循环引用的对象，那么上面的代码将导致死循环，为了避免这种情况的发生，我们可以使用一个变量来存储那些已经被遍历过的对象，当再次遍历该对象时程序会发现该对象已经被遍历过了，这时会跳过遍历，从而避免死循环，如下代码所示：

```js {7-13}
function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
```

如上高亮的代码所示，这是一个 `if` 语句块，用来判断 `val.__ob__` 是否有值，我们知道如果一个响应式数据是对象或数组，那么它会包含一个叫做 `__ob__` 的属性，这时我们读取 `val.__ob__.dep.id` 作为一个唯一的ID值，并将它放到 `seenObjects` 中：`seen.add(depId)`，这样即使 `val` 是一个拥有循环引用的对象，当下一次遇到该对象时，我们能够发现该对象已经遍历过了：`seen.has(depId)`，这样函数直接 `return` 即可。

以上就是深度观测的实现以及避免循环引用造成的死循环的解决方案。

## 计算属性的实现

### 计算属性的初始化

到目前为止，我们对响应系统的了解已经足够多了，是时候研究一下计算属性的实现了，实际上很多看上去神奇的东西在良好设计的系统中实现起来并没有想象的那么复杂，计算属性就是典型的案例，它本质上就是一个惰性求值的观察者。我们回到 `src/core/instance/state.js` 文件中的 `initState` 函数，因为计算属性是在这里被初始化的，如下高亮代码所示：

```js {11}
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

这句代码首先检查开发者是否传递了 `computed` 选项，只有传递了该选项的情况下才会调用 `initComputed` 函数进行初始化，找到 `initComputed` 函数，如下：

```js
function initComputed (vm: Component, computed: Object) {
  // 省略...
}
```

与其它初始化响应数据相关的函数一样，都接收两个参数，第一个参数是组件对象实例，第二个参数是对应的选项。在 `initComputed` 函数的开头定义了两个常量：

```js
// $flow-disable-line
const watchers = vm._computedWatchers = Object.create(null)
// computed properties are just getters during SSR
const isSSR = isServerRendering()
```

其中 `watchers` 常量与组件实例的 `vm._computedWatchers` 属性拥有相同的引用，且初始值都是通过 `Object.create(null)` 创建的空对象，`isSSR` 常量是用来判断是否是服务端渲染的布尔值。接着开启一个 `for...in` 循环，后续的所有代码都写在了这个 `for...in` 循环中：

```js
for (const key in computed) {
  // 省略...
}
```

这个 `for...in` 循环用来遍历 `computed` 选项对象，在循环的内部首先是这样一段代码：

```js
const userDef = computed[key]
const getter = typeof userDef === 'function' ? userDef : userDef.get
if (process.env.NODE_ENV !== 'production' && getter == null) {
  warn(
    `Getter is missing for computed property "${key}".`,
    vm
  )
}
```

定义了 `userDef` 常量，它的值是计算属性对象中相应的属性值，我们知道计算属性有两种写法，计算属性可以是一个函数，如下：

```js
computed: {
  someComputedProp () {
    return this.a + this.b
  }
}
```

如果你使用上面的写法，那么 `userDef` 的值就是一个函数：

```js
userDef = someComputedProp () {
  return this.a + this.b
}
```

另外计算属性也可以写成对象，如下：

```js
computed: {
  someComputedProp: {
    get: function () {
      return this.a + 1
    },
    set: function (v) {
      this.a = v - 1
    }
  }
}
```

如果你使用如上这种写法，那么 `userDef` 常量的值就是一个对象：

```js
userDef = {
  get: function () {
    return this.a + 1
  },
  set: function (v) {
    this.a = v - 1
  }
}
```

在 `userDef` 常量的下面定义了 `getter` 常量，它的值是根据 `userDef` 常量的值决定的：

```js
const getter = typeof userDef === 'function' ? userDef : userDef.get
```

如果计算属性使用函数的写法，那么 `getter` 常量的值就是 `userDef` 本身，即函数。如果计算属性使用的是对象写法，那么 `getter` 的值将会是 `userDef.get` 函数。总之 `getter` 常量总会是一个函数。

在 `getter` 常量的下面做了一个检测：

```js
if (process.env.NODE_ENV !== 'production' && getter == null) {
  warn(
    `Getter is missing for computed property "${key}".`,
    vm
  )
}
```

在非生产环境下如果发现 `getter` 不存在，则直接打印警告信息，提示你计算属性没有对应的 `getter`。也就是说计算属性的函数写法实际上是对象写法的简化，如下这两种写法是等价的：

```js
computed: {
  someComputedProp () {
    return this.a + this.b
  }
}

// 等价于

computed: {
  someComputedProp: {
    get () {
      return this.a + this.b
    }
  }
}
```

再往下，是一段 `if` 条件语句块，如下：

```js
if (!isSSR) {
  // create internal watcher for the computed property.
  watchers[key] = new Watcher(
    vm,
    getter || noop,
    noop,
    computedWatcherOptions
  )
}
```

只有在非服务端渲染时才会执行 `if` 语句块内的代码，因为服务端渲染中计算属性的实现本质上和使用 `methods` 选项差不多。这里我们着重讲解非服务端渲染的实现，这时 `if` 语句块内的代码会被执行，可以看到在 `if` 语句块内创建了一个观察者实例对象，我们称之为 **计算属性的观察者**，同时会把计算属性的观察者添加到 `watchers` 常量对象中，键值是对应计算属性的名字，注意由于 `watchers` 常量与 `vm._computedWatchers` 属性具有相同的引用，所以对 `watchers` 常量的修改相当于对 `vm._computedWatchers` 属性的修改，现在你应该知道了，`vm._computedWatchers` 对象是用来存储计算属性观察者的。

另外有几点需要注意，首先创建计算属性观察者时所传递的第二个参数是 `getter` 函数，也就是说计算属性观察者的求值对象是 `getter` 函数。传递的第四个参数是 `computedWatcherOptions` 常量，它是一个对象，定义在 `initComputed` 函数的上方：

```js
const computedWatcherOptions = { computed: true }
```

我们知道传递给 `Watcher` 类的第四个参数是观察者的选项参数，选项参数对象可以包含如 `deep`、`sync` 等选项，当然了其中也包括 `computed` 选项，通过如上这句代码可知在创建计算属性观察者对象时 `computed` 选项为 `true`，它的作用就是用来标识一个观察者对象是计算属性的观察者，计算属性的观察者与非计算属性的观察者的行为是不一样的。

再往下是 `for...in` 循环中的最后一段代码，如下：

```js
if (!(key in vm)) {
  defineComputed(vm, key, userDef)
} else if (process.env.NODE_ENV !== 'production') {
  if (key in vm.$data) {
    warn(`The computed property "${key}" is already defined in data.`, vm)
  } else if (vm.$options.props && key in vm.$options.props) {
    warn(`The computed property "${key}" is already defined as a prop.`, vm)
  }
}
```

这段代码首先检查计算属性的名字是否已经存在于组件实例对象中，我们知道在初始化计算属性之前已经初始化了 `props`、`methods` 和 `data` 选项，并且这些选项数据都会定义在组件实例对象上，由于计算属性也需要定义在组件实例对象上，所以需要使用计算属性的名字检查组件实例对象上是否已经有了同名的定义，如果该名字已经定义在组件实例对象上，那么有可能是 `data` 数据或 `props` 数据或 `methods` 数据之一，对于 `data` 和 `props` 来讲他们是不允许被 `computed` 选项中的同名属性覆盖的，所以在非生产环境中还要检查计算属性中是否存在与 `data` 和 `props` 选项同名的属性，如果有则会打印警告信息。如果没有则调用 `defineComputed` 定义计算属性。

`defineComputed` 函数就定义在 `initComputed` 函数的下方，如下是 `defineComputed` 函数的签名及最后一句代码：

```js {7}
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 省略...
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
```

根据 `defineComputed` 函数的最后一句代码可知，该函数的作用就是通过 `Object.defineProperty` 函数在组件实例对象上定义与计算属性同名的组件实例属性，而且是一个访问器属性，属性的配置参数是 `sharedPropertyDefinition` 对象，`defineComputed` 函数中除最后一句代码之外的所有代码都是用来完善 `sharedPropertyDefinition` 对象的。

`sharedPropertyDefinition` 对象定义在当前文件头部，如下：

```js
const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}
```

接下来我们就看一下 `defineComputed` 函数是如何完善这个对象的，在 `defineComputed` 函数开头定义了 `shouldCache` 常量，它的值与 `initComputed` 函数中定义的 `isSSR` 常量的值是取反的关系，也是一个布尔值，用来标识是否应该缓存值，也就是说只有在非服务端渲染的情况下计算属性才会缓存值。

紧接着是一段 `if...else` 语句块：

```js
if (typeof userDef === 'function') {
  sharedPropertyDefinition.get = shouldCache
    ? createComputedGetter(key)
    : userDef
  sharedPropertyDefinition.set = noop
} else {
  sharedPropertyDefinition.get = userDef.get
    ? shouldCache && userDef.cache !== false
      ? createComputedGetter(key)
      : userDef.get
    : noop
  sharedPropertyDefinition.set = userDef.set
    ? userDef.set
    : noop
}
```

这段 `if...else` 语句块的作用是为 `sharedPropertyDefinition.get` 和 `sharedPropertyDefinition.set` 赋予合适的值。首先检查 `userDef` 是否是函数，如果是函数则执行 `if` 语句块内的代码，如果不是函数则说明 `userDef` 是对象，此时会执行 `else` 分支的代码。假如 `userDef` 是函数，在 `if` 语句块内首先会使用三元运算符检查 `shouldCache` 是否为真，如果为真说明不是服务端渲染，此时会调用 `createComputedGetter` 函数并将其返回值作为 `sharedPropertyDefinition.get` 的值。如果 `shouldCache` 为假说明是服务端渲染，由于服务端渲染不需要缓存值，所以直接使用 `userDef` 函数作为 `sharedPropertyDefinition.get` 的值。另外由于 `userDef` 是函数，这说明该计算属性并没有指定 `set` 拦截器函数，所以直接将其设置为空函数 `noop`：`sharedPropertyDefinition.set = noop`。

如果代码走到了 `else` 分支，那说明 `userDef` 是一个对象，如果 `userDef.get` 存在并且是在非服务端渲染的环境下，同时没有指定选项 `userDef.cache` 为假，则此时会调用 `createComputedGetter` 函数并将其返回值作为 `sharedPropertyDefinition.get` 的值，否则 `sharedPropertyDefinition.get` 的值为 `userDef.get` 函数。同样的如果 `userDef.set` 函数存在，则使用 `userDef.set` 函数作为 `sharedPropertyDefinition.set` 的值，否则使用空函数 `noop` 作为其值。

总之，无论 `userDef` 是函数还是对象，在非服务端渲染的情况下，配置对象 `sharedPropertyDefinition` 最终将变成如下这样：

```js
sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: createComputedGetter(key),
  set: userDef.set // 或 noop
}
```

举个例子，假如我们像如下这样定义计算属性：

```js
computed: {
  someComputedProp () {
    return this.a + this.b
  }
}
```

那么定义 `someComputedProp` 访问器属性时的配置对象为：

```js
sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: createComputedGetter(key),
  set: noop // 没有指定 userDef.set 所以是空函数
}
```

对于 `createComputedGetter` 函数，它的返回值很显然的应该也是一个函数才对，`createComputedGetter` 函数定义在 `defineComputed` 函数的下方，如下：

```js
function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      watcher.depend()
      return watcher.evaluate()
    }
  }
}
```

可以看到 `createComputedGetter` 函数只是返回一个叫做 `computedGetter` 的函数，并没有做任何其他事情。也就是说计算属性真正的 `get` 拦截器函数就是 `computedGetter` 函数，如下：

```js
sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      watcher.depend()
      return watcher.evaluate()
    }
  },
  set: noop // 没有指定 userDef.set 所以是空函数
}
```

最后在 `defineComputed` 函数中还有一段代码我们没有讲到，如下：

```js
if (process.env.NODE_ENV !== 'production' &&
    sharedPropertyDefinition.set === noop) {
  sharedPropertyDefinition.set = function () {
    warn(
      `Computed property "${key}" was assigned to but it has no setter.`,
      this
    )
  }
}
```

这是一段 `if` 条件语句块，在非生产环境下如果发现 `sharedPropertyDefinition.set` 的值是一个空函数，那么说明开发者并没有为计算属性定义相应的 `set` 拦截器函数，这时会重写 `sharedPropertyDefinition.set` 函数，这样当你在代码中尝试修改一个没有指定 `set` 拦截器函数的计算属性的值时，就会得到一个警告信息。

### 计算属性的实现

以上关于计算属性相关初始化工作已经完成了，初始化计算属性的过程中主要创建了计算属性观察者以及将计算属性定义到组件实例对象上，接下来我们将通过一些例子来分析计算属性是如何实现的，假设我们有如下代码：

```js
data () {
  return {
    a: 1
  }
},
computed: {
  compA () {
    return this.a + 1
  }
}
```

如上代码中，我们定义了本地数据 `data`，它拥有一个响应式的属性 `a`，我们还定义了计算属性 `compA`，它的值将依据 `a` 的值来计算求得。另外我们假设有如下模板：

```html
<div>{{compA}}</div>
```

模板中我们使用到了计算属性，我们知道模板会被编译成渲染函数，渲染函数的执行将触发计算属性 `compA` 的 `get` 拦截器函数，那么 `compA` 的拦截器函数是什么呢？就是我们前面分析的 `sharedPropertyDefinition.get` 函数，我们知道在非服务端渲染的情况下，这个函数为：

```js
sharedPropertyDefinition.get = function computedGetter () {
  const watcher = this._computedWatchers && this._computedWatchers[key]
  if (watcher) {
    watcher.depend()
    return watcher.evaluate()
  }
}
```

也就是说当 `compA` 属性被读取时，`computedGetter` 函数将会执行，在 `computedGetter` 函数内部，首先定义了 `watcher` 常量，它的值为计算属性 `compA` 的观察者对象，紧接着如果该观察者对象存在，则会分别执行观察者对象的 `depend` 方法和 `evaluate` 方法。

我们首先找到 `Watcher` 类的 `depend` 方法，如下：

```js
depend () {
  if (this.dep && Dep.target) {
    this.dep.depend()
  }
}
```

`depend` 方法的内容很简单，检查 `this.dep` 和 `Dep.target` 是否全部有值，如果都有值的情况下便会执行 `this.dep.depend` 方法。这里我们首先要知道 `this.dep` 属性是什么，实际上计算属性的观察者与其他观察者对象不同，不同之处首先会体现在创建观察者实例对象的时候，如下是 `Watcher` 类的 `constructor` 方法中的一段代码：

```js {9-11}
constructor (
  vm: Component,
  expOrFn: string | Function,
  cb: Function,
  options?: ?Object,
  isRenderWatcher?: boolean
) {
  // 省略...
  if (this.computed) {
    this.value = undefined
    this.dep = new Dep()
  } else {
    this.value = this.get()
  }
}
```

如上高亮代码所示，当创建计算属性观察者对象时，由于第四个选项参数中 `options.computed` 为真，所以计算属性观察者对象的 `this.computed` 属性的值也会为真，所以对于计算属性的观察者来讲，在创建时会执行 `if` 条件分支内的代码，而对于其他观察者对象则会执行 `else` 分支内的代码。同时我们能够看到在 `else` 分支内直接调用 `this.get()` 方法求值，而 `if` 分支内并没有调用 `this.get()` 方法求值，而是定义了 `this.dep` 属性，它的值是一个新创建的 `Dep` 实例对象。这说明计算属性的观察者是一个惰性求值的观察者。

现在我们再回到 `Watcher` 类的 `depend` 方法中：

```js {3}
depend () {
  if (this.dep && Dep.target) {
    this.dep.depend()
  }
}
```

此时我们已经知道了 `this.dep` 属性是一个 `Dep` 实例对象，所以 `this.dep.depend()` 这句代码的作用就是用来收集依赖。那么它收集到的东西是什么呢？这就要看 `Dep.target` 属性的值是什么了，我们回想一下整个过程：首先渲染函数的执行会读取计算属性 `compA` 的值，从而触发计算属性 `compA` 的 `get` 拦截器函数，最终调用了 `this.dep.depend()` 方法收集依赖。这个过程中的关键一步就是渲染函数的执行，我们知道在渲染函数执行之前 `Dep.target` 的值必然是 **渲染函数的观察者对象**。所以计算属性观察者对象的 `this.dep` 属性中所收集的就是渲染函数的观察者对象。

记得此时计算属性观察者对象的 `this.dep` 中所收集的是渲染函数观察者对象，假设我们把渲染函数观察者对象称为 `renderWatcher`，那么：

```js
this.dep.subs = [renderWatcher]
```

这样 `computedGetter` 函数中的 `watcher.depend()` 语句我们就讲解完了，但 `computedGetter` 函数还没执行完，接下来要执行的是 `watcher.evaluate()` 语句：

```js {5}
sharedPropertyDefinition.get = function computedGetter () {
  const watcher = this._computedWatchers && this._computedWatchers[key]
  if (watcher) {
    watcher.depend()
    return watcher.evaluate()
  }
}
```

我们找到 `Watcher` 类的 `evaluate` 方法看看它做了哪些事情，如下：

```js
evaluate () {
  if (this.dirty) {
    this.value = this.get()
    this.dirty = false
  }
  return this.value
}
```

我们知道计算属性的观察者是惰性求值，所以在创建计算属性观察者时除了 `watcher.computed` 属性为 `true` 之外，`watcher.dirty` 属性的值也为 `true`，代表着当前观察者对象没有被求值，而 `evaluate` 方法的作用就是用来手动求值的。可以看到在 `evaluate` 方法内部对 `this.dirty` 属性做了真假判断，如果为真则调用观察者对象的 `this.get` 方法求值，同时将`this.dirty` 属性重置为 `false`。最后将求得的值返回：`return this.value`。

这段代码的关键在于求值的这句代码，如下高亮部分所示：

```js {3}
evaluate () {
  if (this.dirty) {
    this.value = this.get()
    this.dirty = false
  }
  return this.value
}
```

我们在计算属性的初始化一节中讲过了，在创建计算属性观察者对象时传递给 `Watcher` 类的第二个参数为 `getter` 常量，它的值就是开发者在定义计算属性时的函数(或 `userDef.get`)，如下高亮代码所示：

```js {5,12}
function initComputed (vm: Component, computed: Object) {
  // 省略...
  for (const key in computed) {
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    // 省略...

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // 省略...
  }
}
```

所以在 `evaluate` 方法中求值的那句代码最终所执行的求值函数就是用户定义的计算属性的 `get` 函数。举个例子，假设我们这样定义计算属性：

```js
computed: {
  compA () {
    return this.a +1
  }
}
```

那么对于计算属性 `compA` 来讲，执行其计算属性观察者对象的 `wather.evaluate` 方法求值时，本质上就是执行如下函数进行求值：

```js
compA () {
  return this.a +1
}
```

大家想一想这个函数的执行会发生什么事情？我们知道数据对象的 `a` 属性是响应式的，所以如上函数的执行将会触发属性 `a` 的 `get` 拦截器函数。所以这会导致属性 `a` 将会收集到一个依赖，这个依赖实际上就是计算属性的观察者对象。

现在思路大概明朗了，如果计算属性 `compA` 依赖了数据对象的 `a` 属性，那么属性 `a` 将收集计算属性 `compA` 的 **计算属性观察者对象**，而 **计算属性观察者对象** 将收集 **渲染函数观察者对象**，整个路线是这样的：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-06-10-074626.png)

假如此时我们修改响应式属性 `a` 的值，那么将触发属性 `a` 所收集的所有依赖，这其中包括计算属性的观察者。我们知道触发某个响应式属性的依赖实际上就是执行该属性所收集到的所有观察者的 `update` 方法，现在我们就找到 `Watcher` 类的 `update` 方法，如下：

```js {3,18}
update () {
  /* istanbul ignore else */
  if (this.computed) {
    // A computed property watcher has two modes: lazy and activated.
    // It initializes as lazy by default, and only becomes activated when
    // it is depended on by at least one subscriber, which is typically
    // another computed property or a component's render function.
    if (this.dep.subs.length === 0) {
      // In lazy mode, we don't want to perform computations until necessary,
      // so we simply mark the watcher as dirty. The actual computation is
      // performed just-in-time in this.evaluate() when the computed property
      // is accessed.
      this.dirty = true
    } else {
      // In activated mode, we want to proactively perform the computation
      // but only notify our subscribers when the value has indeed changed.
      this.getAndInvoke(() => {
        this.dep.notify()
      })
    }
  } else if (this.sync) {
    this.run()
  } else {
    queueWatcher(this)
  }
}
```

如上高亮代码所示，由于响应式数据收集到了计算属性观察者对象，所以当计算属性观察者对象的 `update` 方法被执行时，如上 `if` 语句块的代码将被执行，因为 `this.computed` 属性为真。接着检查了 `this.dep.subs.length === 0` 的真假，我们知道既然是计算属性的观察者，那么 `this.dep` 中将收集渲染函数作为依赖(或其他观察该计算属性变化的观察者对象作为依赖)，所以当依赖的数量不为 `0` 时，在 `else` 语句块内会调用 `this.dep.notify()` 方法继续触发响应，这会导致 `this.dep.subs` 属性中收集到的所有观察者对象的更新，如果此时 `this.dep.subs` 中包含渲染函数的观察者，那么这就会导致重新渲染，最终完成视图的更新。

以上就是计算属性的实现思路，本质上计算属性观察者对象就是一个桥梁，它搭建在响应式数据与渲染函数观察者中间，另外大家注意上面的代码中并非直接调用 `this.dep.notify()` 方法触发响应，而是将这个方法作为 `this.getAndInvoke` 方法的回调去执行的，为什么这么做呢？那是因为 `this.getAndInvoke` 方法会重新求值并对比新旧值是否相同，如果满足相同条件则不会触发响应，只有当值确实变化时才会触发响应，这就是文档中的描述，现在你明白了吧：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-06-10-080745.png)

## 同步执行观察者

通常情况下当数据状态发生改变时，所有 `Watcher` 都为异步执行，这么做的目的是出于对性能的考虑。但在某些场景下我们仍需要同步执行的观察者，我们可以使用 `sync` 选项定义同步执行的观察者，如下：

```js
new Vue({
  watch: {
    someWatch: {
      handler () {/* ... */},
      sync: true
    }
  }
})
```

如上代码所示，我们在定义一个观察者时使用 `sync` 选项，并将其设置为 `true`，此时当数据状态发生变化时该观察者将以同步的方式执行。这么做当然没有问题，因为我们仅仅定义了一个观察者而已。

`Vue` 官方推出了 [vue-test-utils](https://github.com/vuejs/vue-test-utils) 测试工具库，这个库的一个特点是，当你使用它去辅助测试 `Vue` 单文件组件时，数据变更将会以同步的方式触发组件变更，这对于测试而言会提供很大帮助。大家思考一下 [vue-test-utils](https://github.com/vuejs/vue-test-utils) 库是如何实现这个功能的？我们知道开发者在开发组件的时候基本不太可能手动地指定一个观察者为同步的，所以 [vue-test-utils](https://github.com/vuejs/vue-test-utils) 库需要有能力拿到组件的定义并人为地把组件中定义的所有观察者都转换为同步的，这是一个繁琐并容易引起 `bug` 的工作，为了解决这个问题，`Vue` 提供了 `Vue.config.async` 全局配置，它的默认值为 `true`，我们可以在 `src/core/config.js` 文件中看到这样一句代码，如下：

```js {8}
export default ({
  // 省略...

  /**
   * Perform updates asynchronously. Intended to be used by Vue Test Utils
   * This will significantly reduce performance if set to false.
   */
  async: true,

  // 省略...
}: Config)
```

这个全局配置将决定 `Vue` 中的观察者以何种方式执行，默认是异步执行的，当我们将其修改为 `Vue.config.async = false` 时，所有观察者都将会同步执行。其实现方式很简单，我们打开 `src/core/observer/scheduler.js` 文件，找到 `queueWatcher` 函数：

```js {9-12}
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    // 省略...
    // queue the flush
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      nextTick(flushSchedulerQueue)
    }
  }
}
```

如上高亮代码所示，在非生产环境下如果 `!config.async` 为真，则说明开发者配置了 `Vue.config.async = false`，这意味着所有观察者需要同步执行，所以只需要把原本通过 `nextTick` 包装的 `flushSchedulerQueue` 函数单独拿出来执行即可。另外通过如上高亮的代码我们也能够明白一件事儿，那就是 `Vue.config.async` 这个配置项只会在非生产环境生效。

为了实现同步执行的观察者，除了把 `flushSchedulerQueue` 函数从 `nextTick` 中提取出来之外，还需要做一件事儿，我们打开 `src/core/observer/dep.js` 文件，找到 `notify` 方法，如下：

```js {4-9}
notify () {
  // stabilize the subscriber list first
  const subs = this.subs.slice()
  if (process.env.NODE_ENV !== 'production' && !config.async) {
    // subs aren't sorted in scheduler if not running async
    // we need to sort them now to make sure they fire in correct
    // order
    subs.sort((a, b) => a.id - b.id)
  }
  for (let i = 0, l = subs.length; i < l; i++) {
    subs[i].update()
  }
}
```

在异步执行观察者的时候，当数据状态方式改变时，会通过如上 `notify` 函数通知变化，从而执行所有观察者的 `update` 方法，在 `update` 方法内会将所有即将被执行的观察者都添加到观察者队列中，并在 `flushSchedulerQueue` 函数内对观察者回调的执行顺序进行排序。但是当同步执行的观察者时，由于 `flushSchedulerQueue` 函数是立即执行的，它不会等待所有观察者入队之后再去执行，这就没有办法保证观察者回调的正确更新顺序，这时就需要如上高亮的代码，其实现方式是在执行观察者对象的 `update` 更新方法之前就对观察者进行排序，从而保证正确的更新顺序。
