# 自定义渲染器和异步渲染

在本章之前，我们花费了很大的篇幅全面的讲解了一个普通渲染器的实现原理，它可以将 `Virtual DOM` 渲染为 Web 平台的真实 DOM。本章我们将在上一章的基础上讲解更加高级的渲染器：自定义渲染器(`Custom renderer`)以及异步渲染。

## 自定义渲染器的原理

渲染器是围绕 `Virtual DOM` 而存在的，在 Web 平台下它能够把 `Virtual DOM` 渲染为浏览器中的真实 DOM 对象，通过前面几章的讲解，相信你已经能够认识到渲染器的实现原理，为了能够将 `Virtual DOM` 渲染为真实 DOM，渲染器内部需要调用浏览器提供的 DOM 编程接口，下面罗列了在出上一章中我们曾经使用到的那些浏览器为我们提供的 DOM 编程接口：

- `document.createElement / createElementNS`：创建标签元素。
- `document.createTextNode`：创建文本元素。
- `el.nodeValue`：修改文本元素的内容。
- `el.removeChild`：移除 DOM 元素。
- `el.insertBefore`：插入 DOM 元素。
- `el.appendChild`：追加 DOM 元素。
- `el.parentNode`：获取父元素。
- `el.nextSibling`：获取下一个兄弟元素。
- `document.querySelector`：挂载 `Portal` 类型的 `VNode` 时，用它查找挂载点。

这些 DOM 编程接口完成了 Web 平台(或者说浏览器)下对 DOM 的增加、删除、查找的工作，它是 Web 平台独有的，所以如果渲染器自身强依赖于这些方法(函数)，那么这个渲染器也只能够运行在浏览器中，它不具备跨平台的能力。换句话说，如果想要实现一个平台无关的渲染器，那么渲染器自身必须不能强依赖于任何一个平台下特有的接口，而是应该提供一个抽象层，将 “DOM” 的增加、删除、查找等操作使用抽象接口实现，具体到某个平台下时，由开发者决定如何使用该平台下的接口实现这个抽象层，这就是自定义渲染器的本质。

:::tip
在下文中，我们将使用 “元素” 一词指代所有平台中的元素对象，例如在 Web 平台下 “元素” 一词指的就是 DOM 元素。
:::

渲染器除了负责对元素的增加、删除、查找之外，它还负责修改某个特定元素自身的属性/特性，例如 Web 平台中元素具有 `id`、`href` 等属性/特性。在上一章中，我们使用 `patchData` 函数来完成元素自身属性/特性的更新，如下代码用于修改一个元素的类名列表(`class`)：

```js
// patchData.js
case 'class':
  el.className = nextValue
  break
```

这段代码同样也只能运行在浏览器中，为了渲染器能够跨平台，那么修改一个元素自身的属性/特性的工作也应该作为可自定义的一部分才行，因此，一个跨平台的渲染器应该至少包含两个可自定义的部分：**可自定义元素的增加、删除、查找等操作**、**可自定义元素自身属性/特性的修改操作**。这样对于任何一个元素来说，它的增删改查都已经变成了可自定义的部分，我们只需要“告知”渲染器在对元素进行增删改查时应该做哪些具体的操作即可。

接下来我们就着手将一个普通渲染器修改为拥有自定义能力的渲染器，在之前的讲解中，我们将渲染器的代码存放在了 `render.js` 文件中，如下是整个 `render.js` 文件的核心代码：

```js
// 导出渲染器
export default function render(vnode, container) { /* ... */ }

// ========== 挂载 ==========

function mount(vnode, container, isSVG, refNode) { /* ... */ }

function mountElement(vnode, container, isSVG, refNode) { /* ... */ }

function mountText(vnode, container) { /* ... */ }

function mountFragment(vnode, container, isSVG) { /* ... */ }

function mountPortal(vnode, container) { /* ... */ }

function mountComponent(vnode, container, isSVG) { /* ... */ }

function mountStatefulComponent(vnode, container, isSVG) { /* ... */ }

function mountFunctionalComponent(vnode, container, isSVG) { /* ... */ }

// ========== patch ==========

function patch(prevVNode, nextVNode, container) { /* ... */ }

function replaceVNode(prevVNode, nextVNode, container) { /* ... */ }

function patchElement(prevVNode, nextVNode, container) { /* ... */ }

function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) { /* ... */ }

function patchText(prevVNode, nextVNode) { /* ... */ }

function patchFragment(prevVNode, nextVNode, container) { /* ... */ }

function patchPortal(prevVNode, nextVNode) { /* ... */ }

function patchComponent(prevVNode, nextVNode, container) { /* ... */ }

// https://en.wikipedia.org/wiki/Longest_increasing_subsequence
function lis(arr) { /* ... */ }
```

观察如上代码结构，可以发现一个渲染器由两部分组成：`mount` 和 `patch`。在 `mount` 和 `patch` 中都会调用浏览器提供的 DOM 编程接口来完成真正的渲染工作。为了将浏览器提供的 DOM 编程接口与渲染器的代码分离，我们可以将如上代码封装到一个叫做 `createRenderer` 的函数中，如下代码所示：

```js {46}
export default function createRenderer(options) {
  function render(vnode, container) { /* ... */ }

  // ========== 挂载 ==========

  function mount(vnode, container, isSVG, refNode) { /* ... */ }

  function mountElement(vnode, container, isSVG, refNode) { /* ... */ }

  function mountText(vnode, container) { /* ... */ }

  function mountFragment(vnode, container, isSVG) { /* ... */ }

  function mountPortal(vnode, container) { /* ... */ }

  function mountComponent(vnode, container, isSVG) { /* ... */ }

  function mountStatefulComponent(vnode, container, isSVG) { /* ... */ }

  function mountFunctionalComponent(vnode, container, isSVG) { /* ... */ }

  // ========== patch ==========

  function patch(prevVNode, nextVNode, container) { /* ... */ }

  function replaceVNode(prevVNode, nextVNode, container) { /* ... */ }

  function patchElement(prevVNode, nextVNode, container) { /* ... */ }

  function patchChildren(
    prevChildFlags,
    nextChildFlags,
    prevChildren,
    nextChildren,
    container
  ) { /* ... */ }

  function patchText(prevVNode, nextVNode) { /* ... */ }

  function patchFragment(prevVNode, nextVNode, container) { /* ... */ }

  function patchPortal(prevVNode, nextVNode) { /* ... */ }

  function patchComponent(prevVNode, nextVNode, container) { /* ... */ }

  return { render }
}

// https://en.wikipedia.org/wiki/Longest_increasing_subsequence
function lis(arr) { /* ... */ }
```

`createRenderer` 函数的返回值就是之前的 `render` 函数，也就是说调用 `createRenderer` 函数可以创建一个渲染器。`createRenderer` 函数接收一个参数 `options`，该参数的作用是为了允许外界有能力将操作元素的具体实现以选项的方式传递进来。

那么 `options` 参数中应该包含哪些选项呢？其实前面我们已经分析过了，只要是需要自定义的部分就应该作为选项传递进来，所以参数 `options` 中至少要包含两部分：一部分是元素的增加、删除、查找；另外一部分是元素的修改，即 `patchData` 函数。如下代码所示：

```js
const { render } = createRenderer({
  // nodeOps 是一个对象，该对象包含了所有用于操作节点的方法
  nodeOps: {
    createElement() { /* ... */ },
    createText() { /* ... */ }
    // more...
  },
  patchData
})
```

基于此，在 `createRenderer` 函数内部我们就可以通过解构的方式从 `options` 参数中得到具体的方法：

```js {4-17}
export default function createRenderer(options) {
  // options.nodeOps 选项中包含了本章开头罗列的所有操作 DOM 的方法
  // options.patchData 选项就是 patchData 函数
  const {
    nodeOps: {
      createElement: platformCreateElement,
      createText: platformCreateText,
      setText: platformSetText, // 等价于 Web 平台的 el.nodeValue
      appendChild: platformAppendChild,
      insertBefore: platformInsertBefore,
      removeChild: platformRemoveChild,
      parentNode: platformParentNode,
      nextSibling: platformNextSibling,
      querySelector: platformQuerySelector
    },
    patchData: platformPatchData
  } = options

  function render(vnode, container) { /* ... */ }

  // ========== 挂载 ==========
  // 省略...

  // ========== patch ==========
  // 省略...

  return { render }
}
```

如上代码所示，`options.nodeOps` 选项是一个对象，它包含了所有用于对元素进行增、删、查的操作，`options.patchData` 选项是一个函数，用于处理某个特定元素上的属性/特定，这些内容都是在创建渲染器时由外界来决定的。

接下来我们要做的就是将渲染器中原本使用了 Web 平台进行 DOM 操作的地方修改成使用通过解构得到的函数进行替代，例如在创建 DOM 元素时，原来的实现如下：

```js
function mountElement(vnode, container, isSVG, refNode) {
  isSVG = isSVG || vnode.flags & VNodeFlags.ELEMENT_SVG
  const el = isSVG
    ? document.createElementNS('http://www.w3.org/2000/svg', vnode.tag)
    : document.createElement(vnode.tag)
  // 省略...
}
```

现在我们应该使用 `platformCreateElement` 函数替代 `document.createElement(NS)`：

```js {3}
function mountElement(vnode, container, isSVG, refNode) {
  isSVG = isSVG || vnode.flags & VNodeFlags.ELEMENT_SVG
  const el = platformCreateElement(vnode.tag, isSVG)
  // 省略...
}
```

类似的，其他所有涉及 DOM 操作的地方都应该使用这些通过解构得到的抽象接口替代。当这部分工作完成之后，接下来要做的就是对这些用于操作节点的抽象方法进行实现，如下代码所示，我们实现了 Web 平台下创建 DOM 节点的方法：

```js
const { render } = createRenderer({
  nodeOps: {
    createElement(tag, isSVG) {
      return isSVG
        ? document.createElementNS('http://www.w3.org/2000/svg', tag)
        : document.createElement(tag)
    }
  }
})
```

再举一个例子，下面这条语句是我们之前实现的渲染器中用于移除旧 `children` 中节点的代码：

```js
container.removeChild(prevChildren.el)
```

现在我们将之替换为 `platformRemoveChild` 函数：

```js
platformRemoveChild(container, prevVNode.el)
```

为了让这段代码在 Web 平台正常工作，我们需要在创建渲染器时实现 `nodeOps.removeChild` 函数：

```js {8-10}
const { render } = createRenderer({
  nodeOps: {
    createElement(tag, isSVG) {
      return isSVG
        ? document.createElementNS('http://www.w3.org/2000/svg', tag)
        : document.createElement(tag)
    },
    removeChild(parent, child) {
      parent.removeChild(child)
    }
  }
})
```

也许你已经想到了，当我们实现了所有 `nodeOps` 下的规定的抽象接口之后，实际上就完成了一个面向 Web 平台的渲染器，如下代码所示：

```js
const { render } = createRenderer({
  nodeOps: {
    createElement(tag, isSVG) {
      return isSVG
        ? document.createElementNS('http://www.w3.org/2000/svg', tag)
        : document.createElement(tag)
    },
    removeChild(parent, child) {
      parent.removeChild(child)
    },
    createText(text) {
      return document.createTextNode(text)
    },
    setText(node, text) {
      node.nodeValue = text
    },
    appendChild(parent, child) {
      parent.appendChild(child)
    },
    insertBefore(parent, child, ref) {
      parent.insertBefore(child, ref)
    },
    parentNode(node) {
      return node.parentNode
    },
    nextSibling(node) {
      return node.nextSibling
    },
    querySelector(selector) {
      return document.querySelector(selector)
    }
  }
})
```

当然了，如上代码所创建的渲染器只能够完成 Web 平台中对 DOM 的增加、删除和查找的功能，为了能够修改 DOM 元素自身的属性和特性，我们还需要在创建渲染器时将 `patchData` 函数作为选项传递过去，好在我们之前已经封装了 `patchData` 函数，现在直接拿过来用即可：

```js {1,6}
import { patchData } from './patchData'
const { render } = createRenderer({
  nodeOps: {
    // 省略...
  },
  patchData
})
```

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/mq8v65qyry](https://codesandbox.io/s/mq8v65qyry)
:::

以上我们就完成了对渲染器的抽象，使它成为一个平台无关的工具。并基于此实现了一个 Web 平台的渲染器，专门用于浏览器环境。

## 自定义渲染器的应用

`Vue3` 提供了一个叫做 `@vue/runtime-test` 的包，其作用是方便开发者在无 DOM 环境时有能力对组件的渲染内容进行测试，这实际上就是对自定义渲染器的应用。本节我们尝试来实现与 `@vue/runtime-test` 具有相同功能的渲染器。

原理其实很简单，如下代码所示，这是用于 Web 平台下创建真实 DOM 元素的代码：

```js
const { render } = createRenderer({
  nodeOps: {
    createElement(tag, isSVG) {
      return isSVG
        ? document.createElementNS('http://www.w3.org/2000/svg', tag)
        : document.createElement(tag)
    }
  }
})
```

其中 `nodeOps.createElement` 函数会返回一个真实的 DOM 对象，在其内部调用的是浏览器为我们提供的 `document.createElement/NS` 函数。实际上 `nodeOps.createElement` 函数的真正意图是：**创建一个元素**，然而并没有规定这个元素应该由谁来创建，或这个元素应该具有什么样的特征，这就是自定义的核心所在。因此，我们完全使 `nodeOps.createElement` 函数返回一个普通对象来代指一个元素，后续的所有操作都是基于我们所规定的元素而进行，如下代码所示：

```js
const { render } = createRenderer({
  nodeOps: {
    createElement(tag) {
      const customElement = {
        type: 'ELEMENT',
        tag
      }
      return customElement
    }
  }
})
```

在这段代码中，我们自行规定了 `nodeOps.createElement` 函数所返回的元素的格式，即 `customElement` 对象，它包含两个属性，分别是 用来代表元素类型的 `type` 属性以及用来代表元素名称的 `tag` 属性。虽然看上去很奇怪，但这确实是一个完全符合要求的实现。这么做的结果就是：**`nodeOps.createElement` 函数所创建的元素不来自于浏览器的 DOM 编程接口，更不来自于任何其他平台的 API**，因此，如上代码所创建的渲染器也将是一个平台无关的渲染器。这就是为什么 `@vue/runtime-test` 可以运行在 `NodeJs` 中的原因。

当然了，如上代码中 `customElement` 只有两个属性，实际上这并不能满足需求，即使元素的格式由我们自行定义，但还是要有一定的限制，例如元素会有子节点，子节点也需要保存对父节点的引用，元素自身也会有属性/特性等等。一个最小且完整的元素定义应该包含以下属性：

```js
const customElement = {
  type, // 元素的类型：ELEMENT ---> 标签元素；TEXT ---> 文本
  tag, // 当 type === 'ELEMENT' 时，tag 属性为标签名字
  parentNode, // 对父节点的引用
  children, // 子节点
  props,  // 当 type === 'ELEMENT' 时，props 中存储着元素的属性/特性
  eventListeners,  // 当 type === 'ELEMENT' 时，eventListeners 中存储着元素的事件信息
  text  // 当 type === 'TEXT' 时，text 存储着文本内容
}
```

现在 `customElement` 就是一个能完全代替真实 DOM 对象的模拟实现了，我们用它修改之前的代码：

```js
const { render } = createRenderer({
  nodeOps: {
    createElement(tag) {
      const customElement = {
        type: 'ELEMENT',
        tag,
        parentNode: null,
        children: [],
        props: {},
        eventListeners: {},
        text: null
      }
      return customElement
    }
  }
})
```

如上代码所示，由于 `nodeOps.createElement` 函数用于创建元素节点，因此 `type` 属性的值为 `'ELEMENT'`；刚刚创建的元素还不能确定其父节点，因此 `parentNode` 为 `null`；用于存储子节点的 `children` 属性被初始化为一个数组，`props` 属性和 `eventListeners` 被初始化为空对象；最后的 `text` 为 `null`，因为它不是一个文本节点。

现在创建元素节点的功能已经实现，那么创建文本节点呢？如下：

```js {7-14}
const { render } = createRenderer({
  nodeOps: {
    createElement(tag) {
      const customElement = {/* 省略... */}
      return customElement
    },
    createText(text) {
      const customElement = {
        type: 'TEXT',
        parentNode: null,
        text: text
      }
      return customElement
    }
  }
})
```

文本元素的 `type` 类型值为 `'TEXT'`，`parentNode` 同样被初始化为 `unll`，`text` 属性存储着文本节点的内容。由于文本元素没有子节点、属性/特性、事件等信息，因此不需要其他描述信息。

文本节点与元素节点的创建都已经实现，接下来我们看看当元素被追加时应该如何处理，即 `nodeOps.appendChild` 函数的实现：

```js {11-15}
const { render } = createRenderer({
  nodeOps: {
    createElement(tag) {
      const customElement = {/* 省略... */}
      return customElement
    },
    createText(text) {
      const customElement = {/* 省略... */}
      return customElement
    },
    appendChild(parent, child) {
      // 简历父子关系
      child.parentNode = parent
      parent.children.push(child)
    }
  }
})
```

如上高亮代码所示，追加节点时我们要做的就是建立节点间正确的父子关系，在 Web 平台下，当我们调用 `el.appendChild` 函数时，父子关系是由浏览器负责建立的，但在模拟实现中，这个关系需要我们自己来维护。不过好在这很简单，让子元素的 `parentNode` 指向父元素，同时将子元素添加到父元素的 `children` 数组中即可。

类似的，如下是 `nodeOps.removeChild` 函数的实现：

```js {10-25}
const { render } = createRenderer({
  nodeOps: {
    createElement(tag) {/* 省略... */},
    createText(text) {/* 省略... */},
    appendChild(parent, child) {
      // 简历父子关系
      child.parentNode = parent
      parent.children.push(child)
    },
    removeChild(parent, child) {
      // 找到将要移除的元素 child 在父元素的 children 中的位置
      const i = parent.children.indexOf(child)
      if (i > -1) {
        // 如果找到了，则将其删除
        parent.children.splice(i, 1)
      } else {
        // 没找到，说明渲染器出了问题，例如没有在 nodeOps.appendChild 函数中维护正确的父子关系等
        // 这时需要打印错误信息，以提示开发者
        console.error('target: ', child)
        console.error('parent: ', parent)
        throw Error('target 不是 parent 的子节点')
      }
      // 清空父子链
      child.parentNode = null
    }
  }
})
```

如上高亮代码所示，在移除节点时，思路也很简单，首先需要在父节点的 `children` 属性中查找即将要被移除的节点的位置索引，如果找到了，那么就直接将其从父节点的 `children` 数组中移除即可。如果没有找到则说明渲染器出问题了，例如在你实现自定义渲染器时没有在 `nodeOps.appendChild` 函数或 `nodeOps.insertBefore` 函数中维护正确的父子关系，这时我们需要打印错误信息以提示开发者。最后不要忘记清空父子链。

通过如上的讲解，你可能已经领会到了，我们所做的其实就是在模拟 Web 平台在操作元素时的行为，并且这个模拟的思路也及其简单。实际上，当我们实现了所有 `nodeOps` 下的抽象函数之后，那么这个类似于 `@vue/runtime-test` 的自定义渲染器就基本完成了。当然，不要忘记的是我们还需要实现 `patchData` 函数，这可能比你想象的要简单的多，如下高亮代码所示：

```js {9-23}
const { render } = createRenderer({
  nodeOps: {
    createElement(tag) {/* 省略... */},
    createText(text) {/* 省略... */},
    appendChild(parent, child) {/* 省略... */},
    removeChild(parent, child) {/* 省略... */}
    // 其他 nodeOps 函数的实现
  },
  patchData(
    el,
    key,
    prevValue,
    nextValue
  ) {
    // 将属性添加到元素的 props 对象下
    el.props[key] = nextValue
    // 我们将属性名字中前两个字符是 'o' 和 'n' 的属性认为是事件绑定
    if (key[0] === 'o' && key[1] === 'n') {
      // 如果是事件，则将事件添加到元素的 eventListeners 对象下
      const event = key.slice(2).toLowerCase()
      ;(el.eventListeners || (el.eventListeners = {}))[event] = nextValue
    }
  }
})
```

在创建渲染器时我们需要实现 `patchData` 函数的功能，它的功能是用来更新元素自身的属性/特性的，在之前的讲解中我们实现了 Web 平台中 `patchData` 函数，然而在这个模拟实现中，我们要做的事情就少了很多。只需要把元素的属性添加到元素的 `props` 对象中即可，同时如果是事件的话，我们也只需要将其添加到元素的 `eventListeners` 对象中就可以了。

实际上，本节我们所实现的自定义渲染器，就能够满足我们对组件测试的需求，我们可以利用它来测试组件所渲染内容的正确性。如果你想要进一步提升该自定义渲染器的能力，例如希望该渲染器有能力在控制台中打印出操作元素的信息，也很简单，我们以创建元素为例，如下代码所示：

```js {14-17}
const { render } = createRenderer({
  nodeOps: {
    createElement(tag) {
      const customElement = {
        type: 'ELEMENT',
        tag,
        parentNode: null,
        children: [],
        props: {},
        eventListeners: {},
        text: null
      }

      console.table({
        type: 'CREATE ELEMENT',
        targetNode: customElement
      })

      return customElement
    }
  }
})
```

只需要在 `nodeOps.createElement` 函数中调用 `console.table` 进行打印你想要的信息即可，例如我们打印了一个对象，该对象包含 `type` 属性用于指示当前操作元素的类型，所以对于创建元素来说，我们为 `type` 属性赋值了字符串 `'CREATE ELEMENT'`，同时将目标节点也打印了出来(即 `targetNode`)。类似的，追加节点可以打印如下信息：

```js {9-13}
const { render } = createRenderer({
  nodeOps: {
    createElement(tag) {/* 省略... */},
    appendChild(parent, child) {
      // 简历父子关系
      child.parentNode = parent
      parent.children.push(child)

      console.table({
        type: 'APPEND',
        targetNode: child,
        parentNode: parent
      })
    }
  }
})
```

怎么样，是不是很简单。当然了这只是自定义渲染器的应用之一，对于自定义渲染器来说，它可发挥的空间还是非常大的，举几个例子：

- 渲染到 `PDF`，我们可以实现一个自定义渲染器如 `vue-pdf-renderer`，它能够将 `Vue` 组件渲染为 `PDF` 文件。
- 渲染到文件系统，我们可以实现一个 `vue-file-renderer`，它可以根据 `VNode` 的结构在本地渲染与该结构相同的文件目录。
- `canvas` 渲染器，我们可以实现一个 `vue-canvas-renderer`，它可以从渲染器的层面渲染 `canvas`，而非组件层面。

以上仅仅是简单的列了几个小想法，实际上由于自定义渲染器本身就是平台无关的，很多事情需要看特定平台的能力，渲染器为你提供的就是在组件层面的抽象能力以及虚拟 DOM 的更新算法，剩下的就靠社区的想象力和实现能力了。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/v39py7lxq5](https://codesandbox.io/s/v39py7lxq5)
:::

## References

- [Jake Archibald: In The Loop - JSConf.Asia 2018](https://www.youtube.com/watch?reload=9&v=cCOL7MC4Pl0&feature=youtu.be)
- [https://stackoverflow.com/questions/25915634/difference-between-microtask-and-macrotask-within-an-event-loop-context](https://stackoverflow.com/questions/25915634/difference-between-microtask-and-macrotask-within-an-event-loop-context)
- [https://html.spec.whatwg.org/#event-loop-processing-model](https://html.spec.whatwg.org/#event-loop-processing-model)