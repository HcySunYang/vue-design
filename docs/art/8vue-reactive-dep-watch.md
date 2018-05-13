# 渲染函数的观察者与进阶的数据响应系统

实际上在 [揭开数据响应系统的面纱](/art/7vue-reactive.html) 一节中我们仅仅学习了数据响应系统的部分内容，比如当时我们做了一个合理的假设，即：`dep.depend()` 这句代码的执行就代表观察者被收集了，而 `dep.notify()` 的执行则代表触发了响应，但是我们并没有详细讲解 `dep` 本身是什么东西，我们只是把它当做了一个收集依赖的“筐”。除此之外我们也没有讲解数据响应系统中另一个很重要的部分，即 `Watcher` ，我们知道正是由于 `Watcher` 对所观察字段的求值才触发了字段的 `get`，从而才有了收集到该观察者的机会。本节我们的目标就是深入 `Vue` 中有关于这部分的具体源码，看一看这里面的秘密。

为了更好的讲解 `Dep` 和 `Watcher`，我们需要选择一个合适的切入点，这个切入点就是 `Vue.prototype._init` 函数。为什么是 `Vue.prototype._init` 呢？因为数据响应系统本身的切入点就是 `initState` 函数，而 `initState` 函数的调用就在 `_init` 函数中。现在我们把视线重新转移到 `_init` 函数，然后**试图从 `渲染(render)` -> `重新渲染(re-render)` 的过程探索数据响应系统更深层次的内容**。

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

大家还记得 `$mount` 函数定义在哪里吗？我们在 [Vue 构造函数](/art/2vue-constructor.html) 一节中，在整理 `Vue` 构造函数的时候发现 `$mount` 的定义出现在两个地方，第一个地方是 `platforms/web/runtime/index.js` 文件，如下：

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

首先检测是否传递了 `el` 选项，如果传递了 `el` 选项则会接着判断 `inBrowser` 是否为真，即当前宿主环境是否是浏览器，如果在浏览器中则将 `el` 透传给 `query` 函数并用返回值重写 `el` 变量，否则 `el` 将被重写为 `undefined`。其中 [query](/appendix/web-util.html#query) 函数来自 `src/platforms/web/util/index.js` 文件，用来根据给定的参数在 `DOM` 中查找对应的元素并返回。总之如果在浏览器环境下，那么 `el` 变量将存储着 `DOM` 元素(理想情况下)。

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

首先如果传递了 `el` 参数，那么就使用 `query` 函数获取到指定的 `DOM` 元素并重新赋值给 `el` 变量，这个元素我们称之为挂载点。接着是一段 `if` 语句块，检测了挂载点是不是 `<body>` 元素或者 `<html>` 元素，如果是的话那么在非生产环境下会打印警告信息，警告你不要挂载到 `<body>` 元素或者 `<html>` 元素。为什么不允许这么做呢？那是因为挂载点的本意是**组件挂载的占位**，它将会被组件自身的模板**替换**掉，而  `<body>` 元素和 `<html>` 元素显然是不能被替换掉的。

继续看代码，如下是对 `$mount` 函数剩余代码的简化：

```js
const options = this.$options
// resolve template/el and convert to render function
if (!options.render) {
  // 省略...
}
return mount.call(this, el, hydrating)
```

可以看到，首先定义了 `options` 常量，该常量是 `$options` 的引用，然后使用一个 `if` 语句检测否包含 `render` 选项，即是否包含渲染函数。如果渲染函数存在那么什么都不会做，直接调用运行时版 `$mount` 函数即可，我们知道运行时版 `$mount` 仅有两句代码，且真正的挂载是通过调用 `mountComponent` 函数完成的，所以可想而知 `mountComponent` 完成挂载所需的必要条件就是：**提供渲染函数给 `mountComponent`**。

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

另外在上面的代码中使用到了两个工具函数，分别是 `idToTemplate` 和 `getOuterHTML`，这两个函数都定义当前文件。其中 `idToTemplate` 函数的源码如下：

```js
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})
```

如上代码所示 `idToTemplate` 是通过 `cached` 函数创建的。可以在附录 [shared/util.js 文件工具方法全解](/appendix/shared-util.html#cached) 中查看关于 `cached` 函数的讲解，该函数的作用是通过缓存来避免重复求值，提升性能。但 `cached` 函数并不改变原函数的行为，很显然原函数的功能是返回指定元素的 `innerHTML` 字符串。

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

在处理完 `options.template` 选项之后，`template` 变量中存储着最终用来生成渲染函数的字符串，但正如前面提到过的 `template` 变量可能是一个空字符串，所以在上面代码中第一句高亮的代码对 `template` 进行判断，只有在 `template` 存在的情况下才会执行 `if` 语句块内的代码，而 `if` 语句块内的代码的作用就是使用 `compileToFunctions` 函数将模板(`template`)字符串编译为渲染函数(`render`)，并将渲染函数添加到 `vm.$options` 选项中(`options` 是 `vm.$options` 的引用)。对于 `compileToFunctions` 函数我们会在讲解 `Vue` 编译器的时候会详细说明，现在大家只需要知道他的作用即可，实际上在 `src/platforms/web/entry-runtime-with-compiler.js` 文件的底部我们可以看到这样一句代码：

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

这两段高亮的代码是用来统计编译器性能的，我们在 `Vue.prototype._init` 函数中已经遇到过类似的代码，详细内容可以在 [以一个例子为线索](/art/3vue-example.html) 以及 [perf.js 文件代码说明](/appendix/core-util.html#perf-js-文件代码说明) 这两个章节中查看。

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

上面代码中，挂载元素为是一个 `id` 为 `foo` 的 `div` 元素，而组件模板是一个 `id` 为 `bar` 的 `div` 元素。那么大家思考一个问题：`vm.$el` 的值应该是哪一个 `div` 元素的引用？答案是：**`vm.$el` 是 `id` 为 `bar` 的 `div` 的引用**。这是因为 `vm.$el` 始终是组件模板的根元素。由于我们传递了 `template` 选项指定了模板，那么 `vm.$el` 自然就是 `id` 为 `bar` 的 `div` 的引用。假设我们没有传递 `template` 选项，那么根据我们前面的分析，`el` 选项指定的挂载点将被作为组件模板，这个时候 `vm.$el` 则是 `id` 为 `foo` 的 `div` 元素的引用。

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

这段代码的作用只有一个，即定义并初始化 `updateComponent` 函数，这个函数将用作创建 `Watcher` 实例时传递给 `Watcher` 构造函数的第二个参数，这也将使我们第一次真正的接触 `Watcher` 构造函数，不过现在我们需要先把 `updateComponent` 函数搞清楚，在上面的代码中首先定义了 `updateComponent` 变量，虽然是一个 `if...else` 语句块，其中 `if` 语句块的条件我们已经遇到过很多次了，在满足该添加的情况下会做一些性能统计，可以看到在 `if` 语句块中分别统计了 `vm._render()` 函数以及 `vm._update()` 函数的运行性能。也就是说说无论是执行 `if` 语句块还是执行 `else` 语句块，最终 `updateComponent` 函数的功能是不变的。

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

可以看到 `updateComponent` 是一个函数，该函数的作用是以 `vm._render()` 函数的返回值作为第一个参数调用 `vm._update()` 函数。由于我们还没有讲解 `vm._render` 函数和 `vm._update` 函数的作用，所以为了让大家更好理解，我们可以简单的认为：

* `vm._render` 函数的作用是调用 `vm.$options.render` 函数并返回生成的虚拟节点(`vnode`)
* `vm._update` 函数的作用是把 `vm._render` 函数生成的虚拟节点渲染成真正的 `DOM`

也就是说目前我们可以简单的认为 `updateComponent` 函数的作用就是：**把渲染函数生成的虚拟DOM渲染成真正的DOM**，其实在 `vm._update` 内部是通过虚拟DOM的补丁算法(`patch`)来完成的，这些我们放到后面的具体章节去讲。

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

前面说过，这将是我们第一次真正意义上的遇到观察者构造函数 `Watcher`，我们在 [揭开数据响应系统的面纱](/art/7vue-reactive.html) 一章中有提到过，正是因为 `watcher` 对表达式的求值，触发了数据属性的 `get` 拦截器函数，从而收集到了依赖，当数据变化时能够触发响应。在上面的代码中 `Watcher` 观察者实例将对 `updateComponent` 函数求值，我们知道 `updateComponent` 函数的执行会间接触发渲染函数(`vm.$options.render`)的执行，而渲染函数的执行则会触发数据属性的 `get` 拦截器函数，从而将依赖(`观察者`)收集，当数据变化时将重新执行 `updateComponent` 函数，这就完成了重新渲染。同时我们把上面代码中实例化的观察者对象称为**渲染函数的观察者**。

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

可以看到在创建渲染函数观察者实例对象时传递了全部五个参数，第一个参数 `vm` 很显然就是当前组件实例对象；第二个参数 `updateComponent` 就是被观察的目标，它是一个函数；第三个参数 `noop` 是一个空函数；第四个参数是一个包含 `before` 函数的对象，这个对象将作为传递给该观察者的选项；第五个参数为 `true`，我们知道这个参数标识着该观察者实例对象是否是渲染函数的观察者，很显然上面的代码是在为渲染函数创建观察者对象，所以第五个参数自然为 `true`。

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

* `options.user`，用来标识当前观察者实例对象是**开发者定义的**还是**内部定义的**

实际山无论是 `Vue` 的 `watch` 选项还是 `vm.$watch` 函数，他们都实现都是通过实例化 `Watcher` 类完成的，等到我们讲解 `Vue` 的 `watch` 选项和 `vm.$watch` 的具体实现时大家会看到，除了内部定义的观察者(如：渲染函数的观察者、计算属性的观察者等)之外，所有观察者都被认为是开发者定义的，这时 `options.user` 会自动被设置为 `true`。

* `options.computed`，用来标识当前观察者实例对象是否是计算属性的观察者

这里需要明确的是，计算属性的观察者并不是指一个观察某个计算属性变化的观察者，而是指 `Vue` 内部在实现计算属性这个功能时为计算属性创建的观察者。等到我们讲解计算属性的实现时再详细说明。

* `options.sync`，用来告诉观察者当数据变化时是否同步求值并执行回调

默认情况下当数据变化时不会同步求值并执行回调，而是将需要重新求值并执行回调的观察者放到一个异步队列中，当所有数据的变化结束之后统一求值并执行回调，这么做的好处有很多，我们后面会详细讲解。

* `options.before`，可以理解为 `Watcher` 实例的钩子，当数据变化之后触发更新之前调用

在创建渲染函数的观察者实例对象时传递了 `before` 选项，如下高亮代码：

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

这四个属性两两一组，`this.deps` 与 `this.depIds` 为一组，`this.newDeps` 与 `this.newDepIds` 为一组。那么这两组属性的作用是什么呢？其实它们就用传说中用来实现避免收集重复依赖，且移除无用依赖的功能也依赖于它们，后面我们会详细讲解，现在大家注意一下这四个属性的数据结构，其中 `this.deps` 与 `this.newDeps` 被初始化为空数组，而 `this.depIds` 与 `this.newDepIds` 被初始化为 `Set` 实例对象。

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

首先我们需要知道 `parsePath` 函数接收的参数是什么，如下是平时我们在使用 `$watch` 函数的例子：

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

* 不是 `\w`，也就是说这个位置不能是 `字母` 或 `数字` 或 `下划线` 或 `汉字`
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

看完了 `parsePath` 函数，我们在回到如下这段代码中：

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

通过这段代码我们可以发现，计算属性的观察者和其他观察者实例对象的处理方式是不同的，对于计算属性的观察者我们会在讲解计算属性是详细说明。除计算属性的观察者之外的所以观察者实例对象都将执行如上代码的 `else` 分支语句，即调用 `this.get()` 方法。






