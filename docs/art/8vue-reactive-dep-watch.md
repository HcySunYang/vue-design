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









