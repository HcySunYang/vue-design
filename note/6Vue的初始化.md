## 待定

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

现在有一个问题需要大家思考一下，现在我们还没有看 `initProxy` 函数的具体内容，那么你能猜到 `initProxy` 函数的主要作用是什么吗？我可以直接告诉大家，这个函数的主要作用，听清楚是主要作用其实还是在实例对象 `vm` 上添加 `_renderProxy` 属性。为什么呢？因为生产环境和非生产环境下要保持功能一直。在上面的代码中生产环境下直接执行这句：

```js
vm._renderProxy = vm
```

那么可想而知，在非生产环境下也应该执行这句代码，但实际上却调用了 `initProxy` 函数，所以 `initProxy` 函数的作用之一必然也是在实例对象 `vm` 上添加 `_renderProxy` 属性，那么接下来我们就看看 `initProxy` 的内容，验证一下我们的判断，打开 `core/instance/proxy.js` 文件

