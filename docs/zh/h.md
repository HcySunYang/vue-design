# 辅助创建 VNode 的 h 函数

自从有了 `VNode` ，开发页面的方式就变成了书写 `VNode`，但如果日常开发中需要手写 `VNode` ，那绝对是反人类的，在“组件的本质”一章中我们使用了 `snabbdom` 的 `h` 函数来辅助讲解一些小例子，`h` 函数作为创建 `VNode` 对象的函数封装，在一定程度上改善了这个问题，但却没有解决本质问题，这也是为什么我们需要模板或 `jsx` 的原因。但 `h` 函数依然很重要，因为无论是模板还是 `jsx` 都需要经过编译，那么是直接编译成 `VNode` 树好呢？还是编译成由 `h` 函数组成的调用集合好呢？这个其实很难说，但可以肯定的一点是，我们将可**公用、灵活、复杂的逻辑封装成函数，并交给运行时**，这能够大大降低编译器的书写难度，甚至经过编译器生成的代码也具有一定的可读性，而 `h` 函数就是众多运行时函数中的一个。

## 在VNode创建时确定其类型 - flags

一个最简单的 `h` 函数如下：

```js
function h() {
  return {
    _isVNode: true,
    flags: VNodeFlags.ELEMENT_HTML,
    tag: 'h1',
    data: null,
    children: null,
    childFlags: ChildrenFlags.NO_CHILDREN,
    el: null
  }
}
```

这个 `h` 函数只能用来创建一个空的 `<h1></h1>` 标签，可以说没有任何意义。为了让 `h` 函数更加灵活，我们可以增加一些参数，问题是哪些内容应该提取到参数中呢？如果提取的参数多了，就会导致函数的使用不便，如果提取的参数少了又会导致函数的功能不足，所以这也是一个探索的过程。实际上只需要把 `tag`、`data` 和 `children` 提取为参数即可：

```js
function h(tag, data = null, children = null) {
  //...
}
```

我们来看看为什么三个参数就能满足需求，对于 `_isVNode` 属性，它的值始终都为 `true`，所以不需要提取到参数中。对于 `flags` 属性，我们可以通过检查 `tag` 属性值的特征来确定该 `VNode` 的 `flags` 属性值，如下：

```js
function h(tag, data = null, children = null) {
  let flags = null
  if (typeof tag === 'string') {
    flags = tag === 'svg' ? VNodeFlags.ELEMENT_SVG : VNodeFlags.ELEMENT_HTML
  }
}
```

如上代码所示，如果 `tag` 是字符串则可以确定该 `VNode` 是标签元素，再次通过 `tag === 'svg'` 进一步判断是否是 `SVG` 标签，从而确定了该 `VNode` 的类型。

:::tip
请注意区分下文中出现的 `tag`，有时指的是 `VNode` 对象的 `tag` 属性，有时指的是 `h` 函数的第一个参数。
:::

对于 `Fragment` 类型的 **`VNode`**，它的 `tag` 属性值为 `null`，但是纯文本类型的 `VNode` 其 `tag` 属性值也是 `null`，所以为了区分，我们可以增加一个唯一的标识，当 `h` 函数的第一个参数(`tag`)的值等于该标识的时候，则意味着创建的是 `Fragment` 类型的 `VNode`：

```js {2,7-9}
// 唯一标识
export const Fragment = Symbol()
function h(tag, data = null, children = null) {
  let flags = null
  if (typeof tag === 'string') {
    flags = tag === 'svg' ? VNodeFlags.ELEMENT_SVG : VNodeFlags.ELEMENT_HTML
  } else if (tag === Fragment) {
    flags = VNodeFlags.FRAGMENT
  }
}
```

这时我们可以像如下这样调用 `h` 函数创建 `Fragment`：

```js
import { h, Fragment } from 'vue'

h(Fragment, null, children)
```

类似的，对于`Portal` 类型的 **`VNode`**，它的 `tag` 属性值也可以是字符串，这就会与普通标签元素类型的 `VNode` 冲突，导致无法区分一个 `VNode` 到底是普通标签元素还是 `Portal`，所以我们参考 `Fragment` 的实现方式，增加一个 `Portal` 标识：

```js {2,9-12}
export const Fragment = Symbol()
export const Portal = Symbol()
function h(tag, data = null, children = null) {
  let flags = null
  if (typeof tag === 'string') {
    flags = tag === 'svg' ? VNodeFlags.ELEMENT_SVG : VNodeFlags.ELEMENT_HTML
  } else if (tag === Fragment) {
    flags = VNodeFlags.FRAGMENT
  } else if (tag === Portal) {
    flags = VNodeFlags.PORTAL
    tag = data && data.target
  }
}
```

这里需要注意的一点是，类型为 `Portal` 的 `VNode`，其 `tag` 属性值存储的是 `Portal` 挂载的目标，即 `target`。通常模板在经过编译后，我们把 `target` 数据存储在 `VNodeData` 中，所以我们看到如上代码中包含 `tag = data && data.target`。

如果一个 `VNode` 对象的 `tag` 属性值不满足以上全部条件，那只有一种可能了，即该 `VNode` 是组件。有的同学可能会说，也有可能是文本节点啊，没错，但是我们很少会用 `h` 函数去创建一个文本节点，而是单纯的使用字符串，然后在内部实现中检测到该字符串的寓意是文本节点的时候会为其自动创建一个纯文本的 `VNode` 对象，例如：

```js {6}
h(
  'div',
  {
    style: { color: 'red' }
  },
  '我是文本'
)
```

如上代码所示，`h` 函数的第三个参数 `children` 的值是一段文本字符串，这时在 `h` 函数内部会为这段文本字符串创建一个与之相符的纯文本 `VNode` 对象。

我们回过头来，继续讨论当一个 `VNode` 是组件时，如何根据 `tag` 属性确定该 `VNode` 对象的 `flags` 值，很简单如下：

```js {11-22}
// 省略...
function h(tag, data = null, children = null) {
  let flags = null
  if (typeof tag === 'string') {
    flags = tag === 'svg' ? VNodeFlags.ELEMENT_SVG : VNodeFlags.ELEMENT_HTML
  } else if (tag === Fragment) {
    flags = VNodeFlags.FRAGMENT
  } else if (tag === Portal) {
    flags = VNodeFlags.PORTAL
    tag = data && data.target
  } else {
    // 兼容 Vue2 的对象式组件
    if (tag !== null && typeof tag === 'object') {
      flags = tag.functional
        ? VNodeFlags.COMPONENT_FUNCTIONAL       // 函数式组件
        : VNodeFlags.COMPONENT_STATEFUL_NORMAL  // 有状态组件
    } else if (typeof tag === 'function') {
      // Vue3 的类组件
      flags = tag.prototype && tag.prototype.render
        ? VNodeFlags.COMPONENT_STATEFUL_NORMAL  // 有状态组件
        : VNodeFlags.COMPONENT_FUNCTIONAL       // 函数式组件
    }
  }
}
```

在 `Vue2` 中用一个对象作为组件的描述，而在 `Vue3` 中，有状态组件是一个继承了基类的类。所以如果是 `Vue2` 的对象式组件，我们通过检查该对象的 `functional` 属性的真假来判断该组件是否是函数式组件。在 `Vue3` 中，因为有状态组件会继承基类，所以通过原型链判断其原型中是否有 `render` 函数的定义来确定该组件是否是有状态组件。

一旦确定了一个 `VNode` 的类型，那么 `h` 函数就可返回带有正确类型的 `VNode`：

```js
function h(tag, data = null, children = null) {
  let flags = null
  // 省略用来确定 flags 的代码

  return {
    flags,
    // 其他属性...
  }
}
```

## 在VNode创建时确定其children的类型

上文通过 **检测 `tag` 属性值** 来确定一个 `VNode` 对象的 `flags` 属性值。类似地，可以通过 **检测 `children`** 来确定 `childFlags` 的值。根据 `h` 函数的调用方式可以很容易地确定参数 `children` 包含哪些值：

- 1、`children` 是一个数组：

```js
h('ul', null, [
  h('li'),
  h('li')
])
```

- 2、`children` 是一个 `VNode` 对象：

```js
h('div', null, h('span'))
```

- 3、没有 `children`：

```js
h('div')
```

- 4、`children` 是一个普通文本字符串：

```js
h('div', null, '我是文本')
```

以上是四种常见的 `h` 函数的调用方式，根据这四种调用方式中 `children` 的不同形式即可确定一个 `VNode` 对象的 `childFlags`：

```js {15-17,28}
function h(tag, data = null, children = null) {
  // 省略用于确定 flags 相关的代码

  let childFlags = null
  if (Array.isArray(children)) {
    const { length } = children
    if (length === 0) {
      // 没有 children
      childFlags = ChildrenFlags.NO_CHILDREN
    } else if (length === 1) {
      // 单个子节点
      childFlags = ChildrenFlags.SINGLE_VNODE
      children = children[0]
    } else {
      // 多个子节点，且子节点使用key
      childFlags = ChildrenFlags.KEYED_VNODES
      children = normalizeVNodes(children)
    }
  } else if (children == null) {
    // 没有子节点
    childFlags = ChildrenFlags.NO_CHILDREN
  } else if (children._isVNode) {
    // 单个子节点
    childFlags = ChildrenFlags.SINGLE_VNODE
  } else {
    // 其他情况都作为文本节点处理，即单个子节点，会调用 createTextVNode 创建纯文本类型的 VNode
    childFlags = ChildrenFlags.SINGLE_VNODE
    children = createTextVNode(children + '')
  }
}
```

首先，如果 `children` 是数组，则根据数组的长度来判断 `children` 的类型到底是 `ChildrenFlags.NO_CHILDREN`、`ChildrenFlags.SINGLE_VNODE` 还是 `ChildrenFlags.KEYED_VNODES`。这里大家可能会有疑问：“为什么多个子节点时会直接被当做使用了 `key` 的子节点？”，这是因为 `key` 是可以人为创造的，如下是 `normalizeVNodes` 函数的简化：

```js
function normalizeVNodes(children) {
  const newChildren = []
  // 遍历 children
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child.key == null) {
      // 如果原来的 VNode 没有key，则使用竖线(|)与该VNode在数组中的索引拼接而成的字符串作为key
      child.key = '|' + i
    }
    newChildren.push(child)
  }
  // 返回新的children，此时 children 的类型就是 ChildrenFlags.KEYED_VNODES
  return newChildren
}
```

如上， `normalizeVNodes` 函数接收 `children` 数组作为参数，并遍历该数组，对于数组中没有 `key` 的 `VNode` 对象，为其添加一个由竖线(`|`)与该 `VNode` 在数组中的索引拼接而成的字符串作为该 `VNode` 的 `key`。

如果 `children` 不是数组，则判断 `children` 是否为 `null/undefined`，条件为真则说明没有子节点，所以 `childFlags` 的值为 `ChildrenFlags.NO_CHILDREN`。如果 `children` 不为 `null/undefined`，并且 `children._isVNode` 为真，则说明 `children` 就是单个 `VNode` 对象，即单个子节点 `ChildrenFlags.SINGLE_VNODE`。

最后，如果 `children` 不满足以上任何条件，则会把 `children` 作为纯文本节点的文本内容处理，这时会使用 `createTextVNode` 函数创建一个纯文本类型的 `VNode`，`createTextVNode` 函数接收一个字符串作为参数，创建一个与之相符的纯文本类型的 `VNode`，如下：

```js
function createTextVNode(text) {
  return {
    _isVNode: true,
    // flags 是 VNodeFlags.TEXT
    flags: VNodeFlags.TEXT,
    tag: null,
    data: null,
    // 纯文本类型的 VNode，其 children 属性存储的是与之相符的文本内容
    children: text,
    // 文本节点没有子节点
    childFlags: ChildrenFlags.NO_CHILDREN,
    el: null
  }
}
```

**这里再次强调！！！** ，以上用于确定 `childFlags` 的代码仅限于非组件类型的 `VNode`，因为对于组件类型的 `VNode` 来说，它并没有子节点，所有子节点都应该作为 `slots` 存在，所以如果使用 `h` 函数创建一个组件类型的 `VNode`，那么我们应该把 `children` 的内容转化为 `slots`，然后再把 `children` 置为 `null`，这些内容我们会在合适的章节讲解。

## 使用 h 函数创建 VNode

:::tip
本章关于 `h` 函数的完整代码&在线体验地址：[https://codesandbox.io/s/6x2nvmmxn3](https://codesandbox.io/s/6x2nvmmxn3)
:::

假设有如下模板：

```html
<template>
  <div>
    <span></span>
  </div>
</template>
```

用 `h` 函数来创建与之相符的 `VNode`：

```js
const elementVNode = h('div', null, h('span'))
```

得到的 `VNode` 对象如下：

```js
const elementVNode = {
  _isVNode: true,
  flags: 1, // VNodeFlags.ELEMENT_HTML
  tag: 'div',
  data: null,
  children: {
    _isVNode: true,
    flags: 1, // VNodeFlags.ELEMENT_HTML
    tag: 'span',
    data: null,
    children: null,
    childFlags: 1, // ChildrenFlags.NO_CHILDREN
    el: null
  },
  childFlags: 2, // ChildrenFlags.SINGLE_VNODE
  el: null
}
```

> ---- 我是一条分割线\(^o^)/~ ---

假设有如下模板：

```html
<template>
  <div>我是文本</div>
</template>
```

用 `h` 函数来创建与之相符的 `VNode`：

```js
const elementWithTextVNode = h('div', null, '我是文本')
```

得到的 `VNode` 对象如下：

```js
const elementWithTextVNode = {
  _isVNode: true,
  flags: 1, // VNodeFlags.ELEMENT_HTML
  tag: 'div',
  data: null,
  children: {
    _isVNode: true,
    flags: 64,  // VNodeFlags.TEXT
    tag: null,
    data: null,
    children: '我是文本',
    childFlags: 1, // ChildrenFlags.NO_CHILDREN
    el: null
  },
  childFlags: 2, // ChildrenFlags.SINGLE_VNODE
  el: null
}
```

> ---- 我是一条分割线\(^o^)/~ ---

假设有如下模板：

```html
<template>
  <td></td>
  <td></td>
</template>
```

我们在之前的章节中曾经遇到过此模板，我们知道这种模板拥有多个根节点，它是一个 `Fragment`，我们可以像如下这样使用 `h` 函数来创建 `Fragment` 类型的 `VNode`：

```js
import { h, Fragment } from './h'
const fragmentVNode = h(Fragment, null, [
  h('td'), h('td')
])
```

得到的 `VNode` 对象如下：

```js
const fragmentVNode = {
  _isVNode: true,
  flags: 128, // VNodeFlags.FRAGMENT
  data: null,
  children: [
    {
      _isVNode: true,
      flags: 1, // VNodeFlags.ELEMENT_HTML
      tag: 'td',
      data: null,
      children: null,
      childFlags: 1,  // ChildrenFlags.NO_CHILDREN
      key: '|0', // 自动生成的 key
      el: null
    },
    {
      _isVNode: true,
      flags: 1, // VNodeFlags.ELEMENT_HTML
      tag: 'td',
      data: null,
      children: null,
      childFlags: 1,  // ChildrenFlags.NO_CHILDREN
      key: '|1', // 自动生成的 key
      el: null
    }
  ],
  childFlags: 4, // ChildrenFlags.KEYED_VNODES
  el: null
}
```

观察如上 `VNode` 对象可以发现，`children` 数组中的每一个 `VNode` 都自动添加了 `key` 属性。

> ---- 我是一条分割线\(^o^)/~ ---

假设有如下模板：

```html
<template>
  <Portal target="#box">
    <h1></h1>
  </Portal>
</template>
```

这段模板是一个 `Portal`，并且会将其内容渲染到 `id="box"` 的元素下。我们可以像如下这样使用 `h` 函数来创建 `Portal` 类型的 `VNode`：

```js
import { h, Portal } from './h'
const portalVNode = h(
  Portal,
  {
    target: '#box'
  },
  h('h1')
)
```

得到的 `VNode` 对象如下：

```js
const portalVNode = {
  _isVNode: true,
  flags: 256, // VNodeFlags.PORTAL
  tag: '#box',  // 类型为 Portal 的 VNode，其 tag 属性值等于 data.target
  data: { target: '#box' },
  children: {
    _isVNode: true,
    flags: 1, // VNodeFlags.ELEMENT_HTML
    tag: 'h1',
    data: null,
    children: null,
    childFlags: 1, // ChildrenFlags.NO_CHILDREN
    el: null
  },
  childFlags: 2, // ChildrenFlags.SINGLE_VNODE
  el: null
}
```

如上 `VNode` 对象所示，类型为 `Portal` 的 `VNode` 其 `tag` 属性值等于 `data.target`。

> ---- 我是一条分割线\(^o^)/~ ---

假设有如下模板：

```html
<template>
  <MyFunctionalComponent>
    <div></div>
  </MyFunctionalComponent>
</template>
```

这段模板中包含了一个函数式组件，并为该组件提供了一个空的 `div` 标签作为默认的插槽内容，我们尝试用 `h` 函数创建与该模板相符的 `VNode`：

```js
// 一个函数式组件
function MyFunctionalComponent() {}

// 传递给 h 函数的第一个参数就是组件函数本身
const functionalComponentVNode = h(MyFunctionalComponent, null, h('div'))
```

来看一下我们最终得到的 `VNode` 对象：

```js
const functionalComponentVNode = {
  _isVNode: true,
  flags: 32,  // VNodeFlags.COMPONENT_FUNCTIONAL
  tag: MyFunctionalComponent, // tag 属性值引用组件函数
  data: null,
  children: {
    _isVNode: true,
    flags: 1,
    tag: 'div',
    data: null,
    children: null,
    childFlags: 1,
    el: null
  },
  childFlags: 2, // ChildrenFlags.SINGLE_VNODE
  el: null
}
```

大家观察如上 `VNode` 对象，其中 `tag` 属性的值就是组件函数本身，另外 `functionalComponentVNode.children` 的值就是作为默认插槽的空 `div` 标签的 `VNode`，我们暂且这样设计，因为它不会影响我们对渲染器的理解，等到讲解插槽的章节时再来说明：为什么我们不使用 `children` 属性来存储插槽内容，以及我们应该如何使用 `VNode` 来描述插槽。

> ---- 我是一条分割线\(^o^)/~ ---

我们再来使用 `h` 函数创建一个有状态组件的 `VNode`：

```js
// 有状态组件
class MyStatefulComponent {}
const statefulComponentVNode = h(MyStatefulComponent, null, h('div'))
```

我们将得到如下 `VNode`：

```js {3}
const statefulComponentVNode = {
  _isVNode: true,
  flags: 32,  // VNodeFlags.COMPONENT_FUNCTIONAL
  tag: MyStatefulComponent,
  data: null,
  children: {
    _isVNode: true,
    flags: 1,
    tag: 'div',
    data: null,
    children: null,
    childFlags: 1,
    el: null
  },
  childFlags: 2,
  el: null
}
```

观察 `statefulComponentVNode.flags` 属性的值，我们明明使用 `h` 创建的是有状态组件的 `VNode`，为什么最终产生的 `VNode` 是函数式组件呢？别急，大家还记得 `h` 函数是如何区分有状态组件和函数式组件的吗？如下是我们之前编写的 `h` 中的一段用来区分函数式组件和有状态组件的代码：

```js
// Vue3 的类组件
flags =
  tag.prototype && tag.prototype.render
    ? VNodeFlags.COMPONENT_STATEFUL_NORMAL // 有状态组件
    : VNodeFlags.COMPONENT_FUNCTIONAL // 函数式组件
```

只有当组件的原型上拥有 `render` 函数时才会把它当作有状态组件，这里我们再次说明为什么要这样设计，实际上我们在编写有状态组件时，通常需要继承一个框架提供好的基础组件，如下：

```js
class MyStatefulComponent extends Component {}
```

其中 `Component` 组件就是基础组件，而基础组件中会包含 `render` 函数，如下是 `Component` 组件的实现：

```js
class Component {
  render() {}
}
```

那么基础组件的 `render` 函数有什么用呢？我们知道对于一个组件来说它的 `render` 函数就是它的一切，假设一个组件没有 `render` 函数，那么请问该组件存在的意义是什么？它要渲染的又是什么？所以在设计框架的时候，组件是必须要拥有 `render` 函数的，如果没有 `render` 函数我们需要打印错误信息来提示用户，这个“警示”的工作就是由基础组件的 `render` 函数来完成的，如下：

```js
class Component {
  render() {
    throw '组件缺少 render 函数'
  }
}
```

它是如何起作用的呢？还记得我们在“组件的本质”一章中曾经讲到过的挂载组件的 `mountComponent` 函数吗：

```js
function mountComponent(vnode, container) {
  // 创建组件实例
  const instance = new vnode.tag()
  // 渲染
  instance.$vnode = instance.render()
  // 挂载
  mountElement(instance.$vnode, container)
}
```

在挂载组件时我们会创建组件实例，并调用组件的 `render` 函数，由于任何组件都会继承基础组件，所以一旦组件没有 `render` 函数，那么基础组件的 `render` 函数将被调用，此时就会抛出一个异常提示用户：“你的组件缺少 `render` 函数”。

实际上，基础组件还会做更多的任务，本章不会展开讨论。大家只需要知道**在设计有状态组件时，我们会设计一个基础组件，所有组件都会继承基础组件，并且基础组件拥有用来报告错误信息的 `render` 函数**，这就是我们可以通过以下代码来区分函数式组件和有状态组件的原因：

```js
// Vue3 的类组件
flags =
  tag.prototype && tag.prototype.render
    ? VNodeFlags.COMPONENT_STATEFUL_NORMAL // 有状态组件
    : VNodeFlags.COMPONENT_FUNCTIONAL // 函数式组件
```

了解了这些，我们再来使用 `h` 函数创建有状态组件的 `VNode`，如下：

```js
// 有状态组件应该继承 Component
class MyStatefulComponent extends Component {}
const statefulComponentVNode = h(MyStatefulComponent, null, h('div'))
```

此时我们得到的 `VNode` 对象如下：

```js
const statefulComponentVNode = {
  _isVNode: true,
  flags: 4, // VNodeFlags.COMPONENT_STATEFUL_NORMAL
  data: null,
  children: {
    _isVNode: true,
    flags: 1,
    tag: 'div',
    data: null,
    children: null,
    childFlags: 1,
    el: null
  },
  childFlags: 2,
  el: null
}
```

可以看到 `statefulComponentVNode.flags` 的值已经修正了。

至此，我们的 `h` 函数已经可以创建任何类型的 `VNode` 对象了，有了 `VNode` 对象，我们下一步要做的就是将 `VNode` 对象渲染成真实 DOM，下一章我们将开启渲染器之旅。