# 先设计 VNode 吧

上一章讲述了组件的本质，知道了一个组件的产出是 `VNode`，渲染器(`Renderer`)的渲染目标也是 `VNode`。可见 `VNode` 在框架设计的整个环节中都非常重要，甚至**设计 `VNode` 本身就是在设计框架**，`VNode` 的设计还会对后续算法的性能产生影响。本章我们就着手对 `VNode` 进行一定的设计，尝试用 `VNode` 描述各类渲染内容。

## 用 VNode 描述真实 DOM

一个 `html` 标签有它的名字、属性、事件、样式、子节点等诸多信息，这些内容都需要在 `VNode` 中体现，我们可以用如下对象来描述一个红色背景的正方形 `div` 元素：

```js
const elementVNode = {
  tag: 'div',
  data: {
    style: {
      width: '100px',
      height: '100px',
      backgroundColor: 'red'
    }
  }
}
```

我们使用 `tag` 属性来存储标签的名字，用 `data` 属性来存储该标签的附加信息，比如 `style`、`class`、事件等，通常我们把一个 `VNode` 对象的 `data` 属性称为 `VNodeData`。

为了描述子节点，我们需要给 `VNode` 对象添加 `children` 属性，如下 `VNode` 对象用来描述一个有子节点的 `div` 元素：

```js {4-7}
const elementVNode = {
  tag: 'div',
  data: null,
  children: {
    tag: 'span',
    data: null
  }
}
```

若有多个子节点，则可以把 `children` 属性设计为一个数组：

```js {4-13}
const elementVNode = {
  tag: 'div',
  data: null,
  children: [
    {
      tag: 'h1',
      data: null
    },
    {
      tag: 'p',
      data: null
    }
  ]
}
```

除了标签元素之外，DOM 中还有文本节点，我们可以用如下 `VNode` 对象来描述一个文本节点：

```js
const textVNode = {
  tag: null,
  data: null,
  children: '文本内容'
}
```

如上，由于文本节点没有标签名字，所以它的 `tag` 属性值为 `null`。由于文本节点也无需用额外的 `VNodeData` 来描述附加属性，所以其 `data` 属性值也是 `null`。

唯一需要注意的是我们使用 `children` 属性来存储一个文本节点的文本内容。有的同学可能会问：“可不可以新建一个属性 `text` 来存储文本内容呢？”

```js
const textVNode = {
  tag: null,
  data: null,
  children: null,
  text: '文本内容'
}
```

这完全没有问题，这取决于你如何设计，但是**尽可能的在保证语义能够说得通的情况下复用属性，会使 `VNode` 对象更加轻量**，所以我们采取使用 `children` 属性来存储文本内容的方案。

如下是一个以文本节点作为子节点的 `div` 标签的 `VNode` 对象：

```js
const elementVNode = {
  tag: 'div',
  data: null,
  children: {
    tag: null,
    data: null,
    children: '文本内容'
  }
}
```

## 用 VNode 描述抽象内容

什么是抽象内容呢？组件就属于抽象内容，比如你在 模板 或 `jsx` 中使用了一个组件，如下：

```html
<div>
  <MyComponent />
</div>
```

你的意图并不是要在页面中渲染一个名为 `MyComponent` 的标签元素，而是要渲染 `MyComponent` 组件所产出的内容。

但我们仍然需要使用 `VNode` 来描述 `<MyComponent/>`，并给此类用来描述组件的 `VNode` 添加一个标识，以便在挂载的时候有办法区分一个 `VNode` 到底是普通的 `html` 标签还是组件。

我们可以使用如下 `VNode` 对象来描述上面的模板：

```js {5}
const elementVNode = {
  tag: 'div',
  data: null,
  children: {
    tag: MyComponent,
    data: null
  }
}
```

如上，用来描述组件的 `VNode` 其 `tag` 属性值引用的就是组件类(或函数)本身，而不是标签名称字符串。所以理论上：**我们可以通过检查 `tag` 属性值是否是字符串来确定一个 `VNode` 是否是普通标签**。

除了组件之外，还有两种抽象的内容需要描述，即 `Fragment` 和 `Portal`。我们先来了解一下什么是 `Fragment` 以及它所解决的问题。

`Fragment` 的寓意是要渲染一个片段，假设我们有如下模板：

```html {4}
<template>
  <table>
    <tr>
      <Columns />
    </tr>
  </table>
</template>
```

组件 `Columns` 会返回多个 `<td>` 元素：

```html
<template>
  <td></td>
  <td></td>
  <td></td>
</template>
```

大家思考一个问题，如上模板的 `VNode` 如何表示？如果模板中只有一个 `td` 标签，即只有一个根元素，这很容易表示：

```js
const elementVNode = {
  tag: 'td',
  data: null
}
```

但是模板中不仅仅只有一个 `td` 标签，而是有多个 `td` 标签，即多个根元素，这如何表示？此时我们就需要引入一个抽象元素，也就是我们要介绍的 `Fragment`。

```js {1,3-4}
const Fragment = Symbol()
const fragmentVNode = {
  // tag 属性值是一个唯一标识
  tag: Fragment,
  data: null,
  children: [
    {
      tag: 'td',
      data: null
    },
    {
      tag: 'td',
      data: null
    },
    {
      tag: 'td',
      data: null
    }
  ]
}
```

如上，我们把所有 `td` 标签都作为 `fragmentVNode` 的子节点，根元素并不是一个实实在在的真实 DOM，而是一个抽象的标识，即 `Fragment`。

当渲染器在渲染 `VNode` 时，如果发现该 `VNode` 的类型是 `Fragment`，就只需要把该 `VNode` 的子节点渲染到页面。

:::tip
在上面的代码中 `fragmentVNode.tag` 属性的值是一个通过 `Symbol` 创建的唯一标识，但实际上我们更倾向于给 `VNode` 对象添加一个 `flags` 属性，用来代表该 `VNode` 的类型，这在本章的后面会详细说明。
:::

再来看看 `Portal`，什么是 `Portal` 呢？

一句话：它允许你把内容渲染到任何地方。其应用场景是，假设你要实现一个蒙层组件 `<Overlay/>`，要求是该组件的 `z-index` 的层级最高，这样无论在哪里使用都希望它能够遮住全部内容，你可能会将其用在任何你需要蒙层的地方。

```html
<template>
  <div id="box" style="z-index: -1;">
    <Overlay />
  </div>
</template>
```

如上，不幸的事情发生了，在没有 `Portal` 的情况下，上面的 `<Overlay/>` 组件的内容只能渲染到 `id="box"` 的 `div` 标签下，这就会导致蒙层的层级失效甚至布局都可能会受到影响。

其实解决办法也很简单，假如 `<Overlay/>` 组件要渲染的内容不受 DOM 层级关系限制，即可以渲染到任何位置，该问题将迎刃而解。

使用 `Portal` 可以这样编写 `<Overlay/>` 组件的模板：

```html {2,4}
<template>
  <Portal target="#app-root">
    <div class="overlay"></div>
  </Portal>
</template>
```

其最终效果是，无论你在何处使用 `<Overlay/>` 组件，它都会把内容渲染到 `id="app-root"` 的元素下。由此可知，所谓 `Portal` 就是把子节点渲染到给定的目标，我们可以使用如下 `VNode` 对象来描述上面这段模板：

```js {1,3}
const Portal = Symbol()
const portalVNode = {
  tag: Portal,
  data: {
    target: '#app-root'
  },
  children: {
    tag: 'div',
    data: {
      class: 'overlay'
    }
  }
}
```

`Portal` 类型的 `VNode` 与 `Fragment` 类型的 `VNode` 类似，都需要一个唯一的标识，来区分其类型，目的是告诉渲染器如何渲染该 `VNode`。

## VNode 的种类

当 `VNode` 描述不同的事物时，其属性的值也各不相同。比如一个 `VNode` 对象是 `html` 标签的描述，那么其 `tag` 属性值就是一个字符串，即标签的名字；如果是组件的描述，那么其 `tag` 属性值则引用组件类(或函数)本身；如果是文本节点的描述，那么其 `tag` 属性值为 `null`。

最终我们发现，**不同类型的 `VNode` 拥有不同的设计**，这些差异积少成多，所以我们完全可以将它们分门别类。

总的来说，我们可以把 `VNode` 分成五类，分别是：**`html/svg` 元素**、**组件**、**纯文本**、**Fragment** 以及 **Portal**：

![vnode types](@imgs/vnode-types.png)

如上图所示，我们可以把组件细分为 **有状态组件** 和 **函数式组件**。同时有状态组件还可以细分为三部分：**普通的有状态组件**、**需要被 keepAlive 的有状态组件** 以及 **已经被 keepAlive 的有状态组件** 。

但无论是普通的有状态组件还是 `keepAlive` 相关的有状态组件，它们都是**有状态组件**。所以我们在设计 `VNode` 时可以将它们作为一类看待。

## 使用 flags 作为 VNode 的标识

既然 `VNode` 有类别之分，我们就有必要使用一个唯一的标识，来标明某一个 `VNode` 属于哪一类。同时给 `VNode` 添加 `flags` 也是 `Virtual DOM` 算法的优化手段之一。

比如在 `Vue2` 中区分 `VNode` 是 `html` 元素还是组件亦或是普通文本，是这样做的：

- 1、拿到 `VNode` 后先尝试把它当作组件去处理，如果成功地创建了组件，那说明该 `VNode` 就是组件的 `VNode`
- 2、如果没能成功地创建组件，则检查 `vnode.tag` 是否有定义，如果有定义则当作普通标签处理
- 3、如果 `vnode.tag` 没有定义则检查是否是注释节点
- 4、如果不是注释节点，则会把它当作文本节点对待

以上这些判断都是在挂载(或`patch`)阶段进行的，换句话说，一个 `VNode` 到底描述的是什么是在挂载或 `patch` 的时候才知道的。这就带来了两个难题：**无法从 `AOT` 的层面优化**、**开发者无法手动优化**。

为了解决这个问题，我们的思路是在 `VNode` 创建的时候就把该 `VNode` 的类型通过 `flags` 标明，这样在挂载或 `patch` 阶段通过 `flags` 可以直接避免掉很多消耗性能的判断，我们先提前感受一下渲染器的代码：

```js
if (flags & VNodeFlags.ELEMENT) {
  // VNode 是普通标签
  mountElement(/* ... */)
} else if (flags & VNodeFlags.COMPONENT) {
  // VNode 是组件
  mountComponent(/* ... */)
} else if (flags & VNodeFlags.TEXT) {
  // VNode 是纯文本
  mountText(/* ... */)
}
```

如上，采用了位运算，在一次挂载任务中如上判断很可能大量的进行，使用位运算在一定程度上再次拉升了运行时性能。

:::tip
实际上 `Vue3` 在 `Virtual DOM` 的优化上采用的就是 [inferno](https://github.com/infernojs/inferno) 的手段。具体如何做我们会在后面的章节介绍。
:::

这就意味着我们在设计 `VNode` 对象时，应该包含 `flags` 字段：

```js
// VNode 对象
{
  flags: ...
}
```

## 枚举值 VNodeFlags

那么一个 `VNode` 对象的 `flags` 可以是哪些值呢？那就看 `VNode` 有哪些种类就好了，每一个 `VNode` 种类我们都为其分配一个 `flags` 值即可，我们把它设计成一个枚举值并取名为 `VNodeFlags`，在 `javascript` 里就用一个对象来表示即可：

```js
const VNodeFlags = {
  // html 标签
  ELEMENT_HTML: 1,
  // SVG 标签
  ELEMENT_SVG: 1 << 1,

  // 普通有状态组件
  COMPONENT_STATEFUL_NORMAL: 1 << 2,
  // 需要被keepAlive的有状态组件
  COMPONENT_STATEFUL_SHOULD_KEEP_ALIVE: 1 << 3,
  // 已经被keepAlive的有状态组件
  COMPONENT_STATEFUL_KEPT_ALIVE: 1 << 4,
  // 函数式组件
  COMPONENT_FUNCTIONAL: 1 << 5,

  // 纯文本
  TEXT: 1 << 6,
  // Fragment
  FRAGMENT: 1 << 7,
  // Portal
  PORTAL: 1 << 8
}
```

如上这些枚举属性所代表的意义能够与下面的图片一一对应上：

![vnode types](@imgs/vnode-types.png)

我们注意到，这些枚举属性的值基本都是通过将十进制数字 `1` 左移不同的位数得来的。根据这些基本的枚举属性值，我们还可以派生出额外的三个标识：

```js
// html 和 svg 都是标签元素，可以用 ELEMENT 表示
VNodeFlags.ELEMENT = VNodeFlags.ELEMENT_HTML | VNodeFlags.ELEMENT_SVG
// 普通有状态组件、需要被keepAlive的有状态组件、已经被keepAlice的有状态组件 都是“有状态组件”，统一用 COMPONENT_STATEFUL 表示
VNodeFlags.COMPONENT_STATEFUL =
  VNodeFlags.COMPONENT_STATEFUL_NORMAL |
  VNodeFlags.COMPONENT_STATEFUL_SHOULD_KEEP_ALIVE |
  VNodeFlags.COMPONENT_STATEFUL_KEPT_ALIVE
// 有状态组件 和  函数式组件都是“组件”，用 COMPONENT 表示
VNodeFlags.COMPONENT = VNodeFlags.COMPONENT_STATEFUL | VNodeFlags.COMPONENT_FUNCTIONAL
```

其中 `VNodeFlags.ELEMENT`、`VNodeFlags.COMPONENT_STATEFUL` 以及 `VNodeFlags.COMPONENT` 是由基本标识通过`按位或(|)`运算得到的，这三个派生值将用于辅助判断。

有了这些 `flags` 之后，我们在创建 `VNode` 的时候就可以预先为其打上 `flags`，以标明该 `VNode` 的类型：

```js
// html 元素节点
const htmlVnode = {
  flags: VNodeFlags.ELEMENT_HTML,
  tag: 'div',
  data: null
}

// svg 元素节点
const svgVnode = {
  flags: VNodeFlags.ELEMENT_SVG,
  tag: 'svg',
  data: null
}

// 函数式组件
const functionalComponentVnode = {
  flags: VNodeFlags.COMPONENT_FUNCTIONAL,
  tag: MyFunctionalComponent
}

// 普通的有状态组件
const normalComponentVnode = {
  flags: VNodeFlags.COMPONENT_STATEFUL_NORMAL,
  tag: MyStatefulComponent
}

// Fragment
const fragmentVnode = {
  flags: VNodeFlags.FRAGMENT,
  // 注意，由于 flags 的存在，我们已经不需要使用 tag 属性来存储唯一标识
  tag: null
}

// Portal
const portalVnode = {
  flags: VNodeFlags.PORTAL,
  // 注意，由于 flags 的存在，我们已经不需要使用 tag 属性来存储唯一标识，tag 属性用来存储 Portal 的 target
  tag: target
}
```

如下是利用 `VNodeFlags` 判断 `VNode` 类型的例子，比如判断一个 `VNode` 是否是组件：

```js
// 使用按位与(&)运算
functionalComponentVnode.flags & VNodeFlags.COMPONENT // 真
normalComponentVnode.flags & VNodeFlags.COMPONENT // 真
htmlVnode.flags & VNodeFlags.COMPONENT // 假
```

熟悉位运算的话，理解起来很简单。这实际上是多种位运算技巧中的一个小技巧。我们可以列一个表格：

| VNodeFlags                           | 左移运算 | 32 位的 bit 序列(出于简略，只用 9 位表示) |
| ------------------------------------ | -------- | ----------------------------------------- |
| ELEMENT_HTML                         | 无       | 00000000`1`                               |
| ELEMENT_SVG                          | 1 << 1   | 0000000`1`0                               |
| COMPONENT_STATEFUL_NORMAL            | 1 << 2   | 000000`1`00                               |
| COMPONENT_STATEFUL_SHOULD_KEEP_ALIVE | 1 << 3   | 00000`1`000                               |
| COMPONENT_STATEFUL_KEPT_ALIVE        | 1 << 4   | 0000`1`0000                               |
| COMPONENT_FUNCTIONAL                 | 1 << 5   | 000`1`00000                               |
| TEXT                                 | 1 << 6   | 00`1`000000                               |
| FRAGMENT                             | 1 << 7   | 0`1`0000000                               |
| PORTAL                               | 1 << 8   | `1`00000000                               |

根据上表展示的基本 `flags` 值可以很容易地得出下表：

| VNodeFlags         | 32 位的比特序列(出于简略，只用 9 位表示) |
| ------------------ | ---------------------------------------- |
| ELEMENT            | 0000000`1` `1`                           |
| COMPONENT_STATEFUL | 0000`1` `1` `1`00                        |
| COMPONENT          | 000`1` `1` `1` `1`00                     |

所以很自然的，只有 `VNodeFlags.ELEMENT_HTML` 和 `VNodeFlags.ELEMENT_SVG` 与 `VNodeFlags.ELEMENT` 进行按位与(`&`)运算才会得到非零值，即为真。

## children 和 ChildrenFlags

DOM 是一棵树早已家至人说，既然 `VNode` 是真实渲染内容的描述，那么它必然也是一棵树。在之前的设计中，我们给 `VNode` 定义了 `children` 属性，用来存储子 `VNode`。大家思考一下，一个标签的子节点会有几种情况？

总的来说无非有以下几种：

- 没有子节点
- 只有一个子节点
- 多个子节点
  - 有 `key`
  - 无 `key`
- 不知道子节点的情况

我们可以用一个叫做 `ChildrenFlags` 的对象来枚举出以上这些情况，作为一个 `VNode` 的子节点的类型标识：

```js
const ChildrenFlags = {
  // 未知的 children 类型
  UNKNOWN_CHILDREN: 0,
  // 没有 children
  NO_CHILDREN: 1,
  // children 是单个 VNode
  SINGLE_VNODE: 1 << 1,

  // children 是多个拥有 key 的 VNode
  KEYED_VNODES: 1 << 2,
  // children 是多个没有 key 的 VNode
  NONE_KEYED_VNODES: 1 << 3
}
```

由于 `ChildrenFlags.KEYED_VNODES` 和 `ChildrenFlags.NONE_KEYED_VNODES` 都属于多个 `VNode`，所以我们可以派生出一个“多节点”标识，以方便程序的判断：

```js
ChildrenFlags.MULTIPLE_VNODES = ChildrenFlags.KEYED_VNODES | ChildrenFlags.NONE_KEYED_VNODES
```

这样我们判断一个 `VNode` 的子节点是否是多个子节点就变得容易多了：

```js
someVNode.childFlags & ChildrenFlags.MULTIPLE_VNODES
```

:::tip
为什么 `children` 也需要标识呢？原因只有一个：**为了优化**。在后面讲解 `diff` 算法的章节中你将会意识到，这些信息是至关重要的。
:::

在一个 `VNode` 对象中，我们使用 `flags` 属性来存储该 `VNode` 的类型，类似的，我们将使用 `childFlags` 来存储子节点的类型，我们来举一些实际的例子：

```js
// 没有子节点的 div 标签
const elementVNode = {
  flags: VNodeFlags.ELEMENT_HTML,
  tag: 'div',
  data: null,
  children: null,
  childFlags: ChildrenFlags.NO_CHILDREN
}

// 文本节点的 childFlags 始终都是 NO_CHILDREN
const textVNode = {
  tag: null,
  data: null,
  children: '我是文本',
  childFlags: ChildrenFlags.NO_CHILDREN
}

// 拥有多个使用了key的 li 标签作为子节点的 ul 标签
const elementVNode = {
  flags: VNodeFlags.ELEMENT_HTML,
  tag: 'ul',
  data: null,
  childFlags: ChildrenFlags.KEYED_VNODES,
  children: [
    {
      tag: 'li',
      data: null,
      key: 0
    },
    {
      tag: 'li',
      data: null,
      key: 1
    }
  ]
}

// 只有一个子节点的 Fragment
const elementVNode = {
  flags: VNodeFlags.FRAGMENT,
  tag: null,
  data: null,
  childFlags: ChildrenFlags.SINGLE_VNODE,
  children: {
    tag: 'p',
    data: null
  }
}
```

但并非所有类型的 `VNode` 的 `children` 属性都是用来存储子 `VNode`，比如组件的“子 `VNode`”其实不应该作为 `children` 而是应该作为 `slots`，所以我们会定义 `VNode.slots` 属性来存储这些子 `VNode`，不过目前来说我们还不需要深入探讨有关插槽的知识。

## VNodeData

前面提到过，`VNodeData` 指的是 `VNode` 的 `data` 属性，它是一个对象：

```js {4-7}
{
  flags: ...,
  tag: ...,
  // VNodeData
  data: {
    ...
  }
}
```

`VNodeData` 顾名思义，它就是 `VNode` 数据，用于对 `VNode` 进行描述。举个例子，假如一个 `VNode` 的类型是 `html` 标签，则 `VNodeData` 中可以包含 `class`、`style` 以及一些事件，这样渲染器在渲染此 `VNode` 时，才知道这个标签的背景颜色、字体大小以及监听了哪些事件等等。所以从设计角度来讲，任何可以对 `VNode` 进行描述的内容，我们都可以将其存放到 `VNodeData` 对象中，如：

```js {4-11}
{
  flags: VNodeFlags.ELEMENT_HTML,
  tag: 'div',
  data: {
    class: ['class-a', 'active'],
    style: {
      background: 'red',
      color: 'green'
    },
    // 其他数据...
  }
}
```

如果 `VNode` 的类型是组件，那么我们同样可以用 `VNodeData` 来描述组件，比如组件的事件、组件的 `props` 等等，假设有如下模板：

```html
<MyComponent @some-event="handler" prop-a="1" />
```

则其对应的 `VNodeData` 应为：

```js {4-10}
{
  flags: VNodeFlags.COMPONENT_STATEFUL,
  tag: 'div',
  data: {
    on: {
      'some-event': handler
    },
    propA: '1'
    // 其他数据...
  }
}
```

当然了，只要能够正确地对 `VNode` 进行描述，具体的数据结构你可以随意设计。我们暂且不限制 `VNodeData` 的固定格式。

在后续章节中，我们会根据需求逐渐地完善 `VNodeData` 的设计。

至此，我们已经对 `VNode` 完成了一定的设计，目前为止我们所设计的 `VNode` 对象如下：

```js
export interface VNode {
  // _isVNode 属性在上文中没有提到，它是一个始终为 true 的值，有了它，我们就可以判断一个对象是否是 VNode 对象
  _isVNode: true
  // el 属性在上文中也没有提到，当一个 VNode 被渲染为真实 DOM 之后，el 属性的值会引用该真实DOM
  el: Element | null
  flags: VNodeFlags
  tag: string | FunctionalComponent | ComponentClass | null
  data: VNodeData | null
  children: VNodeChildren
  childFlags: ChildrenFlags
}
```

其中 `_isVNode` 属性和 `el` 属性在上文中没有提到，`_isVNode` 属性是一个始终为 `true` 的值，有了它，我们就可以判断一个对象是否是 `VNode` 对象。`el` 属性的值在 `VNode` 被渲染为真实 DOM 之前一直都是 `null`，当 `VNode` 被渲染为真实 DOM 之后，`el` 属性的值会引用该真实 DOM。

实际上，如果你看过 `Vue3` 的源码，你会发现在源码中一个 `VNode` 对象除了包含本节我们所讲到的这些属性之外，还包含诸如 `handle` 和 `contextVNode`、`parentVNode`、`key`、`ref`、`slots` 等其他额外的属性。

我们之所以没有在本章中包含这些内容，是因为目前来讲，我们根本不需要这些属性，比如 `handle` 属性仅用于函数式组件，所以我们会在函数式组件原理相关的章节再讲。
