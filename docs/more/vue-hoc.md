## 探索Vue高阶组件

高阶组件(`HOC`)是 `React` 生态系统的常用词汇，`React` 中代码复用的主要方式就是使用高阶组件，并且这也是官方推荐的做法。而 `Vue` 中复用代码的主要方式是使用 `mixins`，并且在 `Vue` 中很少提到高阶组件的概念，这是因为在 `Vue` 中实现高阶组件并不像 `React` 中那样简单，原因在于 `React` 和 `Vue` 的设计思想不同，但并不是说在 `Vue` 中就不能使用高阶组件，只不过在 `Vue` 中使用高阶组件所带来的收益相对于 `mixins` 并没有质的变化。本篇文章主要从技术性的角度阐述 `Vue` 高阶组件的实现，且会从 `React` 与 `Vue` 两者的角度进行分析。

## 从 React 说起

起初 `React` 也是使用 `mixins` 来完成代码复用的，比如为了避免组件不必要的重复渲染我们可以在组件中混入 `PureRenderMixin`：

```js
const PureRenderMixin = require('react-addons-pure-render-mixin')
const MyComponent = React.createClass({
  mixins: [PureRenderMixin]
})
```

后来 `React` 抛弃了这种方式，进而使用 `shallowCompare`：

```js
const shallowCompare = require('react-addons-shallow-compare')
const Button = React.createClass({
  shouldComponentUpdate: function(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }
})
```

这需要你自己在组件中实现 `shouldComponentUpdate` 方法，只不过这个方法具体的工作由 `shallowCompare` 帮你完成，即浅比较。

再后来 `React` 为了避免开发者在组件中总是要写这样一段同样的代码，进而推荐使用 `React.PureComponent`，总之 `React` 在一步步地脱离 `mixins`，他们认为 `mixins` 在 `React` 生态系统中并不是一种好的模式(注意：并没有说 `mixins` 不好，仅仅针对 `React` 生态系统)，观点如下：

> 1、`mixins` 带来了隐式依赖
> 2、`mixins` 与 `mixins` 之间，`mixins` 与组件之间容易导致命名冲突
> 3、由于 `mixins` 是侵入式的，它改变了原组件，所以修改 `mixins` 等于修改原组件，随着需求的增长 `mixins` 将变得复杂，导致滚雪球的复杂性。

具体大家可以查看这篇文章 [Mixins Considered Harmful](https://reactjs.org/blog/2016/07/13/mixins-considered-harmful.html)。不过 `HOC` 也并不是银弹，它自然带来了它的问题，有兴趣的同学可以查看这个视频：[Michael Jackson - Never Write Another HoC](https://www.youtube.com/watch?v=BcVAq3YFiuc)，其观点是：**使用普通组件配合 `render prop` 可以做任何 HOC 能做的事情**。

本篇文章不会过多讨论 `mixins` 和 `HOC` 谁好谁坏，就像技术本身就没有好坏之分，只有适合不适合。难道 `React` 和 `Vue` 这俩哥们儿不也是这样吗？

`ok`，我们回到高阶组件，所谓高阶组件其实就是高阶函数啦，`React` 和 `Vue` 都证明了一件事儿：**一个函数就是一个组件**。所以组件是函数这个命题成立了，那高阶组件很自然的就是高阶函数，即一个返回函数的函数，我们知道在 `React` 中写高阶组件就是在写高阶函数，很简单，那是不是在 `Vue` 中实现高阶组件也同样简单呢？其实 `Vue` 稍微复杂，甚至需要你对 `Vue` 足够了解，接下来就让我们一起在 `Vue` 中实现高阶组件，在文章的后面会分析为什么同样都是 `函数就是组件` 的思想，`Vue` 却不能像 `React` 那样轻松地实现高阶组件。

因此我们有必要在实现 `Vue` 高阶组件之前充分了解 `React` 中的高阶组件，看下面的 `React` 代码：

```js
function WithConsole (WrappedComponent) {
  return class extends React.Component {
    componentDidMount () {
      console.log('with console: componentDidMount')
    }
    render () {
      return <WrappedComponent {...this.props}/>
    }
  }
}
```

`WithConsole` 就是一个高阶组件，它有以下几个特点：

> 1、高阶组件(`HOC`)应该是无副作用的纯函数，且不应该修改原组件

可以看到 `WithConsole` 就是一个纯函数，它接收一个组件作为参数并返回了一个新的组件，在新组件的 `render` 函数中仅仅渲染了被包装的组件(`WrappedComponent`)，并没有侵入式地修改它。

> 2、高阶组件(`HOC`)不关心你传递的数据(`props`)是什么，并且被包装组件(`WrappedComponent`)不关心数据来源

这是保证高阶组件与被包装组件能够完美配合的根本

> 3、高阶组件(`HOC`)接收到的 `props` 应该透传给被包装组件(`WrappedComponent`)

高阶组件完全可以添加、删除、修改 `props`，但是除此之外，要将其余 `props` 透传，否则在层级较深的嵌套关系中(`这是高阶组件的常见问题`)将造成 `props` 阻塞。

以上是 `React` 中高阶组件的基本约定，除此之外还要注意其他问题，如：高阶组件(`HOC`)不应该在 `render` 函数中创建；高阶组件(`HOC`)也需要复制组件中的静态方法；高阶组件(`HOC`)中的 `ref` 引用的是最外层的容器组件而不是被包装组件(`WrappedComponent`) 等等。

## Vue 中的高阶组件

了解了这些，接下来我们就可以开始着手实现 `Vue` 高阶组件了，为了让大家有一个直观的感受，我仍然会使用 `React` 与 `Vue` 进行对比地讲解。首先是一个基本的 `Vue` 组件，我们常称其为被包装组件(`WrappedComponent`)，假设我们的组件叫做 `BaseComponent`：

**base-component.vue**

```html
<template>
  <div>
    <span @click="handleClick">props: {{test}}</span>
  </div>
</template>

<script>
export default {
  name: 'BaseComponent',
  props: {
    test: Number
  },
  methods: {
    handleClick () {
      this.$emit('customize-click')
    }
  }
}
</script>
```

我们观察一个 `Vue` 组件主要观察三点：`props`、`event` 以及 `slots`。对于 `BaseComponent` 组件而言，它接收一个数字类型的 `props` 即 `test`，并发射一个自定义事件，事件的名称是：`customize-click`，没有 `slots`。我们会这样使用该组件：

```html
<base-component @customize-click="handleCustClick" :test="100" />
```

现在我们需要 `base-component` 组件每次挂载完成的时候都打印一句话：`I have already mounted`，同时这也许是很多组件的需求，所以按照 `mixins` 的方式，我们可以这样做，首先定义个 `mixins`：

```js
export default consoleMixin {
  mounted () {
    console.log('I have already mounted')
  }
}
```

然后在 `BaseComponent` 组件中将 `consoleMixin` 混入：

```js
export default {
  name: 'BaseComponent',
  props: {
    test: Number
  },
  mixins: [ consoleMixin ]
  methods: {
    handleClick () {
      this.$emit('customize-click')
    }
  }
}
```

这样使用 `BaseComponent` 组件的时候，每次挂载完成之后都会打印一句 `I have already mounted`，不过现在我们要使用高阶组件的方式实现同样的功能，回忆高阶组件的定义：**接收一个组件作为参数，返回一个新的组件**，那么此时我们需要思考的是，在 `Vue` 中组件是什么？有的同学可能会有疑问，难道不是函数吗？对，`Vue` 中组件是函数没有问题，不过那是最终结果，比如我们在单文件组件中的组件定义其实就是一个普通的选项对象，如下：

```js
export default {
  name: 'BaseComponent',
  props: {...},
  mixins: [...]
  methods: {...}
}
```

这不就是一个纯对象吗？所以当我们从单文件中导入一个组件的时候：

```js
import BaseComponent from './base-component.vue'
console.log(BaseComponent)
```

思考一下，这里的 `BaseComponent` 是什么？它是函数吗？不是，虽然单文件组件会被 `vue-loader` 处理，但处理后的结果，也就是我们这里的 `BaseComponent` 仍然还是一个普通的 JSON 对象，只不过当你把这个对象注册为组件(`components` 选项)之后，`Vue` 最终会以该对象为参数创建一个构造函数，该构造函数就是生产组件实例的构造函数，所以在 `Vue` 中组件确实是函数，只不过那是最终结果罢了，在这之前我们完全可以说在 `Vue` 中组件也可以是一个普通对象，就像单文件组件中所导出的对象一样。

基于此，我们知道在 `Vue` 中一个组件可以以纯对象的形式存在，所以 `Vue` 中的高阶组件可以这样定义：**接收一个纯对象，并返回一个新的纯对象**，如下代码：

**hoc.js**

```js
export default function WithConsole (WrappedComponent) {
  return {
    template: '<wrapped v-on="$listeners" v-bind="$attrs"/>',
    components: {
      wrapped: WrappedComponent
    },
    mounted () {
      console.log('I have already mounted')
    }
  }
}
```

`WithConsole` 就是一个高阶组件，它接收一个组件作为参数：`WrappedComponent`，并返回一个新的组件。在新的组件定义中，我们将 `WrappedComponent` 注册为 `wrapped` 组件，并在 `template` 中将其渲染出来，同时添加 `mounted` 钩子，打印 `I have already mounted`。

以上就完成了与 `mixins` 同样的功能，不过这一次我们采用的是高阶组件，所以是非侵入式的，我们没有修改原组件(`WrappedComponent`)，而是在新组件中渲染了原组件，并且没有对原组件做任何修改。并且这里大家要注意 `$listeners` 和 `$attrs`：

```js
'<wrapped v-on="$listeners" v-bind="$attrs"/>'
```

这么做是必须的，这就等价于在 `React` 中透传 `props`：

```js
<WrappedComponent {...this.props}/>
```

否则在使用高阶组件的时候，被包装组件(`WrappedComponent`)接收不到 `props` 和 `事件`。

那这样真的就完美解决问题了吗？不是的，首先 `template` 选项只有在完整版的 `Vue` 中可以使用，在运行时版本中是不能使用的，所以最起码我们应该使用渲染函数(`render`)替代模板(`template`)，如下：

**hoc.js**

```js
export default function WithConsole (WrappedComponent) {
  return {
    mounted () {
      console.log('I have already mounted')
    },
    render (h) {
      return h(WrappedComponent, {
        on: this.$listeners,
        attrs: this.$attrs,
      })
    }
  }
}
```

上面的代码中，我们将模板改写成了渲染函数，看上去没什么问题，实则不然，上面的代码中 `WrappedComponent` 组件依然收不到 `props`，有的同学可能会问了，我们不是已经在 `h` 函数的第二个参数中将 `attrs` 传递过去了吗，怎么还收不到？当然收不到，`attrs` 指的是那些没有被声明为 `props` 的属性，所以在渲染函数中还需要添加 `props` 参数：

**hoc.js**

```js
export default function WithConsole (WrappedComponent) {
  return {
    mounted () {
      console.log('I have already mounted')
    },
    render (h) {
      return h(WrappedComponent, {
        on: this.$listeners,
        attrs: this.$attrs,
        props: this.$props
      })
    }
  }
}
```

那这样是不是可以了呢？依然不行，因为 `this.$props` 始终是空对象，这是因为这里的 `this.$props` 指的是高阶组件接收到的 `props`，而高阶组件没有声明任何 `props`，所以 `this.$props` 自然是空对象啦，那怎么办呢？很简单只需要将高阶组件的 `props` 设置成与被包装组件的 `props` 相同即可：

**hoc.js**

```js
export default function WithConsole (WrappedComponent) {
  return {
    mounted () {
      console.log('I have already mounted')
    },
    props: WrappedComponent.props,
    render (h) {
      return h(WrappedComponent, {
        on: this.$listeners,
        attrs: this.$attrs,
        props: this.$props
      })
    }
  }
}
```

现在才是一个稍微完整可用的高阶组件。大家注意用词：`稍微`，纳尼？都修改成这样了还不行吗？当然，上面的高阶组件能完成以下工作：

> 1、透传 `props`
> 2、透传没有被声明为 `props` 的属性
> 3、透传事件

大家不觉得缺少点儿什么吗？我们前面说过，一个 `Vue` 组件的三个重要因素：`props`、`事件` 以及 `slots`，前两个都搞定了，但 `slots` 还不行。我们修改 `BaseComponent` 组件为其添加一个具名插槽和默认插槽，如下：

**base-component.vue**

```html
<template>
  <div>
    <span @click="handleClick">props: {{test}}</span>
    <slot name="slot1"/> <!-- 具名插槽 -->
    <p>===========</p>
    <slot/> <!-- 默认插槽 -->
  </div>
</template>

<script>
export default {
  ...
}
</script>
```

然后我们写下如下测试代码：

```html
<template>
  <div>
    <base-component>
      <h2 slot="slot1">BaseComponent slot</h2>
      <p>default slot</p>
    </base-component>
    <enhanced-com>
      <h2 slot="slot1">EnhancedComponent slot</h2>
      <p>default slot</p>
    </enhanced-com>
  </div>
</template>

<script>
  import BaseComponent from './base-component.vue'
  import hoc from './hoc.js'

  const EnhancedCom = hoc(BaseComponent)

  export default {
    components: {
      BaseComponent,
      EnhancedCom
    }
  }
</script>
```

渲染结果如下：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-01-07-084715.jpg)

上图中蓝色框是 `BaseComponent` 组件渲染的内容，是正常的。红色框是高阶组件渲染的内容，可以发现无论是具名插槽还是默认插槽，全部丢失。其原因很简单，就是因为我们在高阶组件中没有将分发的插槽内容透传给被包装组件(`WrappedComponent`)，所以我们尝试着修改高阶组件：

**hoc.js**

```js
function WithConsole (WrappedComponent) {
  return {
    mounted () {
      console.log('I have already mounted')
    },
    props: WrappedComponent.props,
    render (h) {

      // 将 this.$slots 格式化为数组，因为 h 函数第三个参数是子节点，是一个数组
      const slots = Object.keys(this.$slots)
        .reduce((arr, key) => arr.concat(this.$slots[key]), [])

      return h(WrappedComponent, {
        on: this.$listeners,
        attrs: this.$attrs,
        props: this.$props
      }, slots) // 将 slots 作为 h 函数的第三个参数
    }
  }
}
```

好啦，大功告成刷新页面，如下：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-01-07-090407.jpg)

纳尼😱？我们发现，分发的内容确实是渲染出来了，不过貌似顺序不太对。。。。。。蓝色框是正常的，在具名插槽与默认插槽的中间是有分界线(`===========`)的，而红色框中所有的插槽全部渲染到了分界线(`===========`)的下面，看上去貌似具名插槽也被作为默认插槽处理了。这到底是怎么回事呢？

想弄清楚这个问题，就回到了文章开始时我提到的一点，即你需要对 `Vue` 的实现原理有所了解才行，否则无解。接下来就从原理出发来讲解如何解决这个问题。这个问题的根源在于：**`Vue` 在处理具名插槽的时候会考虑作用域的因素**。不明白没关系，我们一点点分析。

首先补充一个提示：**`Vue` 会把模板(`template`)编译成渲染函数(`render`)**，比如如下模板：

```html
<div>
  <h2 slot="slot1">BaseComponent slot</h2>
</div>
```

会被编译成如下渲染函数：

```js
var render = function() {
  var _vm = this
  var _h = _vm.$createElement
  var _c = _vm._self._c || _h
  return _c("div", [
    _c("h2", {
      attrs: { slot: "slot1" },
      slot: "slot1"
    }, [
      _vm._v("BaseComponent slot")
    ])
  ])
}
```

想要查看一个组件的模板被编译后的渲染函数很简单，只需要访问 `this.$options.render` 即可。观察上面的渲染函数我们发现普通的 `DOM` 是通过 `_c` 函数创建对应的 `VNode` 的。现在我们修改模板，模板中除了有普通 `DOM` 之外，还有组件，如下：

```html
<div>
  <base-component>
    <h2 slot="slot1">BaseComponent slot</h2>
    <p>default slot</p>
  </base-component>
</div>
```

那么生成的渲染函数(`render`)是这样的：

```js
var render = function() {
  var _vm = this
  var _h = _vm.$createElement
  var _c = _vm._self._c || _h
  return _c(
    "div",
    [
      _c("base-component", [
        _c("h2", { attrs: { slot: "slot1" }, slot: "slot1" }, [
          _vm._v("BaseComponent slot")
        ]),
        _vm._v(" "),
        _c("p", [_vm._v("default slot")])
      ])
    ],
    1
  )
}
```

我们发现无论是普通DOM还是组件，都是通过 `_c` 函数创建其对应的 `VNode` 的。其实 `_c` 在 `Vue` 内部就是 `createElement` 函数。`createElement` 函数会自动检测第一个参数是不是普通DOM标签，如果不是普通DOM标签那么 `createElement` 会将其视为组件，在子组件渲染函数执行的时候面临一个问题：**组件需要知道父级模板中是否传递了 `slot` 以及传递了多少，传递的是具名的还是不具名的等等**。那么子组件如何才能得知这些信息呢？很简单，假如组件的模板如下：

```html
<div>
  <base-component>
    <h2 slot="slot1">BaseComponent slot</h2>
    <p>default slot</p>
  </base-component>
</div>
```

父组件的模板最终会生成父组件对应的 `VNode`，所以以上模板对应的 `VNode` 全部由父组件所有，那么在创建子组件实例的时候能否通过获取父组件的 `VNode` 进而拿到 `slot` 的内容呢？即通过父组件将下面这段模板对应的 `VNode` 拿到：

```html
<base-component>
  <h2 slot="slot1">BaseComponent slot</h2>
  <p>default slot</p>
</base-component>
```

如果能够通过父级拿到这段模板对应的 `VNode`，那么子组件就知道要渲染哪些 `slot` 了，其实 `Vue` 内部就是这么干的，实际上你可以通过访问子组件的 `this.$vnode` 来获取这段模板对应的 `VNode`：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-01-07-102532.jpg)

其中 `this.$vnode` 并没有写进 `Vue` 的官方文档。子组件拿到了需要渲染的 `slot` 之后进入到了关键的一步，这一步就是导致高阶组件中透传 `slot` 给 `BaseComponent` 却无法正确渲染的原因，看下图：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-01-07-104411.jpg)

这张图与上一张图相同，在子组件中打印 `this.$vnode`，标注中的 `context` 引用着 `VNode` 被创建时所在的组件实例，由于 `this.$vnode` 中引用的 `VNode` 对象是在父组件中被创建的，所以 `this.$vnode` 中的 `context` 引用着父实例。理论上图中标注的两个 `context` 应该是相等的：

```js
console.log(this.$vnode.context === this.$vnode.componentOptions.children[0].context) // true
```

而 `Vue` 内部做了一件很重要的事儿，即上面那个表达式必须成立，才能够正确处理具名 `slot`，否则即使 `slot` 具名也不会被考虑，而是被作为默认插槽。这就是高阶组件中不能正确渲染 `slot` 的原因。

那么为什么高阶组件中上面的表达式就不成立了呢？那是因为由于高阶组件的引入，在原本的父组件与子组件之间插入了一个组件(`也就是高阶组件`)，这导致在子组件中访问的 `this.$vnode` 已经不是原来的父组件中的 `VNode` 片段了，而是高阶组件的 `VNode` 片段，所以此时 `this.$vnode.context` 引用的是高阶组件，但是我们却将 `slot` 透传，`slot` 中的 `VNode` 的 `context` 引用的还是原来的父组件实例，所以这就造成了以下表达式为假：

```js
console.log(this.$vnode.context === this.$vnode.componentOptions.children[0].context) // false
```

最终导致具名插槽被作为默认插槽，从而渲染不正确。

而解决办法也很简单，只需要手动设置一下 `slot` 中 `VNode` 的 `context` 值为高阶组件实例即可，修改高阶组件如下：

**hoc.js**

```js
function WithConsole (WrappedComponent) {
  return {
    mounted () {
      console.log('I have already mounted')
    },
    props: WrappedComponent.props,
    render (h) {
      const slots = Object.keys(this.$slots)
        .reduce((arr, key) => arr.concat(this.$slots[key]), [])
        // 手动更正 context
        .map(vnode => {
          vnode.context = this._self
          return vnode
        })

      return h(WrappedComponent, {
        on: this.$listeners,
        props: this.$props,
        attrs: this.$attrs
      }, slots)
    }
  }
}
```

现在，都能够正常渲染啦，如下图：

![](http://7xlolm.com1.z0.glb.clouddn.com/2018-01-07-113740.jpg)

这里的关键点除了你需要了解 `Vue` 处理 `slot` 的方式之外，你还要知道通过当前实例 `_self` 属性访问当前实例本身，而不是直接使用 `this`，因为 `this` 是一个代理对象。

现在貌似看上去没什么问题了，不过我们还忘记了一件事儿，即 `scopedSlots`，不过 `scopedSlots` 与 `slot` 的实现机制不一样，本质上 `scopedSlots` 就是一个接收数据作为参数并渲染 `VNode` 的函数，所以不存在 `context` 的概念，所以直接透传即可：

**hoc.js**

```js
function WithConsole (WrappedComponent) {
  return {
    mounted () {
      console.log('I have already mounted')
    },
    props: WrappedComponent.props,
    render (h) {
      const slots = Object.keys(this.$slots)
        .reduce((arr, key) => arr.concat(this.$slots[key]), [])
        .map(vnode => {
          vnode.context = this._self
          return vnode
        })

      return h(WrappedComponent, {
        on: this.$listeners,
        props: this.$props,
        // 透传 scopedSlots
        scopedSlots: this.$scopedSlots,
        attrs: this.$attrs
      }, slots)
    }
  }
}
```

到现在为止，一个高阶组件应该具备的基本功能算是实现了，但这仅仅是个开始，要实现一个完整健壮的 `Vue` 高阶组件，还要考虑很多内容，比如：

> 函数式组件中要使用 `render` 函数的第二个参数代替 `this`。
> 以上我们只讨论了以纯对象形式存在的 `Vue` 组件，然而除了纯对象外还可以是函数。
> 创建 `render` 函数的很多步骤都可以进行封装。
> 处理更多高阶函数组件本身的选项(`而不仅仅是上面例子中的一个简单的生命周期钩子`)

我觉得需要放上两个关于高阶组件的参考链接，供参考交流：

[Discussion: Best way to create a HOC](https://github.com/vuejs/vue/issues/6201)
[https://github.com/jackmellis/vue-hoc](https://github.com/jackmellis/vue-hoc)

## 为什么在 Vue 中实现高阶组件比较难

前面说过要分析一下为什么在 `Vue` 中实现高阶组件比较复杂而 `React` 比较简单。这主要是二者的设计思想和设计目标不同，在 `React` 中写组件就是在写函数，函数拥有的功能组件都有。而 `Vue` 更像是高度封装的函数，在更高的层面 `Vue` 能够让你轻松的完成一些事情，但与高度的封装相对的就是损失一定的灵活，你需要按照一定规则才能使系统更好地运行。

有句话说的好：

> 会了不难，难了不会

复杂还是简单都是相对而言的，最后希望大家玩的转 `Vue` 也欣赏的了 `React`。

