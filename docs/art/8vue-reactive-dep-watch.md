# 进阶的数据响应系统

实际上在 [揭开数据响应系统的面纱](/art/7vue-reactive.html) 一节中我们仅仅学习了数据响应系统的部分内容，比如当时我们做了一个合理的假设，即：`dep.depend()` 这句代码的执行就代表观察者被收集了，而 `dep.notify()` 的执行则代表触发了响应，但是我们并没有详细讲解 `dep` 本身是什么东西，我们只是把它当做了一个收集依赖的“筐”。除此之外我们也没有讲解数据响应系统中另一个很重要的部分，即 `Watcher` ，我们知道正是由于 `Watcher` 对所观察字段的求值才触发了字段的 `get`，从而才有了收集到该观察者的机会。本节我们的目标就是深入 `Vue` 中有关于这部分的具体源码，看一看这里面的秘密。

为了更好的讲解 `Dep` 和 `Watcher`，我们需要选择一个合适的切入点，这个切入点就是 `Vue.prototype._init` 函数。为什么是 `Vue.prototype._init` 呢？因为数据响应系统的切入点是 `initState` 函数，而 `initState` 函数的调用就在 `_init` 函数中。现在我们把视线重新转移到 `_init` 函数，然后**试图从 `渲染(render)` -> `重新渲染(re-render)` 的过程探索数据响应系统更深层次的内容**。

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

以上是简化后的代码，注意高亮的那一句：`vm.$mount(vm.$options.el)`，这句代码是 `_init` 函数的最后一句代码，在这句代码执行之前完成了所有初始化的工作，虽然我们目前对初始化工作还有很多不了解的地方，不过没关系，不要忘记我们的目标是搞清楚数据响应系统的 `Dep` 以及 `Watcher`，而 `$mount` 很好的充当了切入点，现在我们就假设已经完成了所有初始化的工作，然后开始我们的探索，不过在这之前我们需要先了解一下 `$mount` 函数是如何将组件挂载到给定元素的。

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

我们知道 `platforms/web/runtime/index.js` 文件是运行时版 `Vue` 的入口文件，也就是说如上代码中 `$mount` 函数的功能就是运行时版 `Vue` 的 `$mount` 函数的功能，我们看看它做了什么，首先 `$mount` 函数接收两个参数，第一个参数 `el` 可以是一个字符串也可以是一个 `DOM` 元素，第二个参数 `hydrating` 是用于 `Virtual DOM` 的补丁算法的，这里大家不需要关心。来看 `$mount` 函数的第一句代码：

```js
el = el && inBrowser ? query(el) : undefined
```

首先检测是否传递了 `el` 选项，如果传递了 `el` 选项则会接着判断 `inBrowser` 是否为真，即当前宿主环境是否是浏览器，如果在浏览器中则将 `el` 透传给 `query` 函数并用返回值重写 `el` 变量，否则 `el` 将被重写为 `undefined`。其中 [query](/appendix/web-util.html#query) 函数来自 `src/platforms/web/util/index.js` 文件，用来根据给定的参数在 `DOM` 中查找对应的元素并返回。总之如果在浏览器环境下，那么 `el` 变量将存储着 `DOM` 元素(理想情况下)。

接着来到 `$mount` 函数的第二句代码：

```js
return mountComponent(this, el, hydrating)
```

调用了 `mountComponent` 函数完成真正的挂载工作，并返回(`return`)其运行结果，以上就是运行时版 `Vue` 的 `$mount` 函数所做的事情。

第二个定义 `$mount` 函数的地方是 `src/platforms/web/entry-runtime-with-compiler.js` 文件，我们知道这个文件是完整版 `Vue` 的入口文件，在改文件中重新定义了 `$mount` 函数，但是保留了运行时 `$mount` 的功能，为了不偏离主题我们暂且不去看重新定义的 `$mount` 函数，我们把目光聚焦在 `mountComponent` 函数上，因为它才是真正挂载组件的函数，在这个函数中我们将了解关于 `Watcher` 的使用，并以此为切入点探索整个数据响应系统。

`mountComponent` 定义在 `src/core/instance/lifecycle.js` 文件中，它接收三个参数，分别是当前 `Vue` 组件实例，`el` 变量以及透传的 `hydrating` 变量，这个大家注意 `el` 选项经过 `$mount` 函数的处理已经是一个 `DOM` 元素对象了。
