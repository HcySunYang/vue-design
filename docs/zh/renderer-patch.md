# 渲染器之patch

在上一章中我们讲解并实现了渲染器的挂载逻辑，本质上就是将各种类型的 `VNode` 渲染成真实DOM的过程。渲染器除了将全新的 `VNode` 挂载成真实DOM之外，它的另外一个职责是负责对新旧 `VNode` 进行比对，并以合适的方式更新DOM，也就是我们常说的 `patch`。本章内容除了让你了解基本的比对逻辑之外，还讲述了在新旧 `VNode` 比对的过程中应该遵守怎样的原则，让我们开始吧！

## 基本原则

通常重渲染(`re-render`)是由组件的更新开始的，因为在框架的使用层面开发者通过变更数据状态从而引起框架内部对UI的自动更新，但是组件的更新本质上还是对真实DOM的更新，或者说是对标签元素的更新，所以我们就优先来看一下如何更新一个标签元素。

我们首先回顾一下渲染器的代码，如下：

```js {8,13}
function render(vnode, container) {
  const prevVNode = container.vnode
  if (prevVNode == null) {
    if (vnode) {
      // 没有旧的 VNode，使用 `mount` 函数挂载全新的 VNode
      mount(vnode, container)
      // 将新的 VNode 添加到 container.vnode 属性下，这样下一次渲染时旧的 VNode 就存在了
      container.vnode = vnode
    }
  } else {
    if (vnode) {
      // 有旧的 VNode，则调用 `patch` 函数打补丁
      patch(prevVNode, vnode, container)
      // 更新 container.vnode
      container.vnode = vnode
    } else {
      // 有旧的 VNode 但是没有新的 VNode，这说明应该移除 DOM，在浏览器中可以使用 removeChild 函数。
      container.removeChild(prevVNode.el)
      container.vnode = null
    }
  }
}
```

如上高亮的两句代码所示，当使用 `render` 渲染器渲染一个全新的 `VNode` 时，会调用 `mount` 函数挂载该 `VNode`，同时让容器元素存储对该 `VNode` 对象的引用，这样当再次调用渲染器渲染新的 `VNode` 对象到相同的容器元素时，由于旧的 `VNode` 已经存在，所以会调用 `patch` 函数以合适的方式进行更新，如下代码所示：

```js
// 旧的 VNode
const prevVNode = h('div')

// 新的 VNode
const nextVNode = h('span')

// 第一次渲染 VNode 到 #app，此时会调用 mount 函数
render(prevVNode, document.getElementById('app'))

// 第二次渲染新的 VNode 到相同的 #app 元素，此时会调用 patch 函数
render(nextVNode, document.getElementById('app'))
```

`patch` 函数会对新旧 `VNode` 进行比对，也就是我们所说的 `diff`，那么不同的两个 `VNode` 之间应该遵守怎样的比对规则呢？其实这个问题很容易回答，我们知道 `VNode` 有类型之分，不同类型的 `VNode` 之间存在一定的差异，所以不同的 `VNode` 之间第一个比对原则就是：**只有相同类型的 `VNode` 才有比对的意义**，例如我们有两个 `VNode`，其中一个 `VNode` 的类型是标签元素，而另一个 `VNode` 的类型是组件，当这两个 `VNode` 进行比对时，最优的做法是**使用新的 `VNode` 完全替换旧的 `VNode`**，换句话说我们根本就没有做任何比对的操作，因为这完全没有意义，所以根据这个思想我们实现的 `patch` 函数如下：

```js
function patch(prevVNode, nextVNode, container) {
  // 分别拿到新旧 VNode 的类型，即 flags
  const nextFlags = nextVNode.flags
  const prevFlags = prevVNode.flags

  // 检查新旧 VNode 的类型是否相同，如果类型不同，则直接调用 replaceVNode 函数替换 VNode
  // 如果新旧 VNode 的类型相同，则根据不同的类型调用不同的比对函数
  if (prevFlags !== nextFlags) {
    replaceVNode(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.ELEMENT) {
    patchElement(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.COMPONENT) {
    patchComponent(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.TEXT) {
    patchText(prevVNode, nextVNode)
  } else if (nextFlags & VNodeFlags.FRAGMENT) {
    patchFragment(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.PORTAL) {
    patchPortal(prevVNode, nextVNode)
  }
}
```

如上代码所示，既然 `patch` 函数的作用是用来比对新旧 `VNode`，那么 `patch` 函数必然需要接收新旧 `VNode` 作为参数，我们使用 `prevVNode` 形参代表旧的 `VNode`，使用 `nextVNode` 形参代表新的 `VNode`，如上是很清晰的一段比对逻辑，首先我们需要拿到新旧 `VNode` 的类型(`flags`)，接着是一连串的 `if...else if` 语句，其核心原则是：**如果类型不同，则直接调用 `replaceVNode` 函数使用新的 `VNode` 替换旧的 `VNode`，否则根据不同的类型调用与之相符的比对函数**，如下图所示：

![](@imgs/flags-patch.png)

## 替换 VNode

我们首先来研究一下如何替换 `VNode`，即 `replaceVNode` 函数应该做什么，我们先来复现需要替换 `VNode` 的场景，如下代码所示：

```js
// 旧的 VNode 是一个 div 标签
const prevVNode = h('div', null, '旧的 VNode')

class MyComponent {
  render () {
    return h('h1', null, '新的 VNode')
  }
}
// 新的 VNode 是一个组件
const nextVNode = h(MyComponent)

// 先后渲染新旧 VNode 到 #app
render(prevVNode, document.getElementById('app'))
render(nextVNode, document.getElementById('app'))
```

在如上代码中，我们先后渲染了新旧 `VNode` 到 `#app` 元素，由于新旧 `VNode` 具有不同的类型，所以此时会触发 `VNode` 的替换操作，替换操作并不复杂，本质就是**把旧的 `VNode` 所渲染的DOM移除，再挂载新的 `VNode`**，如下是 `replaceVNode` 函数的实现：

```js
function replaceVNode(prevVNode, nextVNode, container) {
  // 将旧的 VNode 所渲染的 DOM 从容器中移除
  container.removeChild(prevVNode.el)
  // 再把新的 VNode 挂载到容器中
  mount(nextVNode, container)
}
```

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/jlxjk18vm5](https://codesandbox.io/s/jlxjk18vm5)
:::

看上去很简单，但实际上仅有这两行代码的话，是存在缺陷的。至于有何缺陷我们会在本章的后面讲解，因为目前我们的背景铺垫还不够。

## 更新标签元素

### 更新标签元素的基本原则

当新旧 `VNode` 的类型不同时，会调用 `replaceVNode` 函数直接使用新的 `VNode` 替换旧的 `VNode`。但如果新旧 `VNode` 的类型相同，则会根据不同的类型调用不同的比对函数，这一小节我们就来看看如何更新一个标签元素。

首先即使两个 `VNode` 的类型同为标签元素，但它们也可能是不同的标签，也就是说它们的 `tag` 属性值不尽相同。这就又引申出了一条更新原则：**我们认为不同的标签渲染的内容不同**，例如 `ul` 标签下只能渲染 `li` 标签，所以拿 `ul` 标签和一个 `div` 标签进行比对是没有任何意义的，这种情况下我们不会对旧的标签元素打补丁，而是使用新的标签元素替换旧的标签元素，这就需要用到我们前面讲过的 `replaceVNode` 函数，如下 `patchElement` 函数所示：

```js
function patchElement(prevVNode, nextVNode, container) {
  // 如果新旧 VNode 描述的是不同的标签，则调用 replaceVNode 函数，使用新的 VNode 替换旧的 VNode
  if (prevVNode.tag !== nextVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
    return
  }
}
```

那么如果新旧 `VNode` 描述的是相同的标签呢？如果标签相同，那两个 `VNode` 之间的差异就只会出现在 `VNodeData` 和 `children` 上了，所以对于描述相同标签的两个 `VNode` 之间的比对，本质上就是对 `VNodeData` 和 `children` 的比对，我们先来看一下如何更新 `VNodeData`，如下面两个 `VNode` 所示：

```js {6,15}
// 旧的 VNode
const prevVNode = h('div', {
  style: {
    width: '100px',
    height: '100px',
    backgroundColor: 'red'
  }
})

// 新的 VNode
const nextVNode = h('div', {
  style: {
    width: '100px',
    height: '100px',
    border: '1px solid green'
  }
})
```

如上代码所示，新旧 `VNode` 描述的都是 `div` 标签，但是他们拥有不同的样式，旧的 `VNode` 描述的是一个红色背景的 `div`，而新的 `VNode` 描述的是拥有绿色边框的 `div`，如果仅针对这个案例而言，我们的更新规则应该是：**先将红色背景从元素上移除，再为元素添加绿色边框**。如果我们把问题的解决方案宏观化，就变成了：**将新的 VNodeData 全部应用到元素上，再把那些已经不存在于新的 `VNodeData` 上的数据从元素上移除**，根据这个思想，我们为 `patchElement` 函数增加如下高亮的代码：

```js {8-37}
function patchElement(prevVNode, nextVNode, container) {
  // 如果新旧 VNode 描述的是不同的标签，则调用 replaceVNode 函数，使用新的 VNode 替换旧的 VNode
  if (prevVNode.tag !== nextVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
    return
  }

  // 拿到 el 元素，注意这时要让 nextVNode.el 也引用该元素
  const el = (nextVNode.el = prevVNode.el)
  // 拿到 新旧 VNodeData
  const prevData = prevVNode.data
  const nextData = nextVNode.data
  // 新的 VNodeData 存在时才有必要更新
  if (nextData) {
    // 遍历新的 VNodeData
    for (let key in nextData) {
      // 根据 key 拿到新旧 VNodeData 值
      const prevValue = prevData[key]
      const nextValue = nextData[key]
      switch (key) {
        case 'style':
          // 遍历新 VNodeData 中的 style 数据，将新的样式应用到元素
          for (let k in nextValue) {
            el.style[k] = nextValue[k]
          }
          // 遍历旧 VNodeData 中的 style 数据，将已经不存在于新的 VNodeData 的数据移除
          for (let k in prevValue) {
            if (!nextValue.hasOwnProperty(k)) {
              el.style[k] = ''
            }
          }
          break
        default:
          break
      }
    }
  }
}
```

如上高亮代码所示，我们在更新 `VNodeData` 时的思路分为以下几步：

- 第 1 步：当新的 `VNodeData` 存在时，遍历新的 `VNodeData`。
- 第 2 步：根据新 `VNodeData` 中的 `key`，分别尝试读取旧值和新值，即 `prevValue` 和 `nextValue`。
- 第 3 步：使用 `switch...case` 语句匹配不同的数据进行不同的更新操作

以样式(`style`)的更新为例，如上代码所展示的更新过程是：

- 1 ：遍历新的样式数据(`prevValue`)，将新的样式数据全部应用到元素上
- 2 ：遍历旧的样式数据(`nextValue`)，将那些已经不存在于新的样式数据中的样式从元素上移除，最终我们完成了元素样式的更新。

这个过程实际上就是更新标签元素的基本规则。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/9l2mxjkw14](https://codesandbox.io/s/9l2mxjkw14)
:::

### 更新 VNodeData

观察我们在 `patchElement` 函数中用来更新样式的代码，大家有没有注意到似曾相识？没错，这段代码与 `mountElement` 函数内用来处理 `VNodeData` 的代码非常相似，这就指导我们封装一个函数用来统一处理 `VNodeData`，实际上无论是 `mountElement` 函数中用来处理 `VNodeData` 的代码还是 `patchElement` 函数中用来处理 `VNodeData` 的代码，它们的本质都是将 `VNodeData` 中的数据应用到 DOM 元素上，唯一的区别就是在 `mountElement` 函数中没有“旧”数据可言，而在 `patchElement` 函数中既有旧数据也有新数据，所以我们完全可以封装一个叫做 `patchData` 的函数，该函数接收新旧数据作为参数，对于 `mountElement` 函数来讲，由于它没有旧数据可言，所以在调用 `patchData` 函数时只需要传递 `null` 作为旧数据即可。

我们先来使用 `patchData` 函数修改 `patchElement` 函数的代码，如下：

```js {13-30}
function patchElement(prevVNode, nextVNode, container) {
  // 如果新旧 VNode 描述的是不同的标签，则调用 replaceVNode 函数，使用新的 VNode 替换旧的 VNode
  if (prevVNode.tag !== nextVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
    return
  }

  // 拿到 el 元素，注意这时要让 nextVNode.el 也引用该元素
  const el = (nextVNode.el = prevVNode.el)
  const prevData = prevVNode.data
  const nextData = nextVNode.data

  if (nextData) {
    // 遍历新的 VNodeData，将旧值和新值都传递给 patchData 函数
    for (let key in nextData) {
      const prevValue = prevData[key]
      const nextValue = nextData[key]
      patchData(el, key, prevValue, nextValue)
    }
  }
  if (prevData) {
    // 遍历旧的 VNodeData，将已经不存在于新的 VNodeData 中的数据移除
    for (let key in prevData) {
      const prevValue = prevData[key]
      if (prevValue && !nextData.hasOwnProperty(key)) {
        // 第四个参数为 null，代表移除数据
        patchData(el, key, prevValue, null)
      }
    }
  }
}
```

如上高亮代码所示，使用 `patchData` 函数改写之后的代码变得较之前简洁了许多，核心思想没有变，仍然是：**遍历新的 `VNodeData`，将旧值和新值都传递给 `patchData` 函数，并由 `patchData` 函数负责更新数据；同时也需要遍历旧的 `VNodeData`，将已经不存在于新的 `VNodeData` 中的数据从元素上移除**，所以我们可以看到在遍历旧 `VNodeData` 时如果没有旧数据，或者虽然有旧数据但旧数据已经不存在于新数据上了，这时我们传递给 `patchData` 函数的第四个参数为 `null`，意味着将该数据从元素上移除。如下是 `patchData` 函数的实现，本质就是把原来 `patchElement` 函数中的 `switch` 语句块移动到了 `patchData` 函数中：

```js
export function patchData(el, key, prevValue, nextValue) {
  switch (key) {
    case 'style':
      // 将新的样式数据应用到元素
      for (let k in nextValue) {
        el.style[k] = nextValue[k]
      }
      // 移除已经不存在的样式
      for (let k in prevValue) {
        if (!nextValue.hasOwnProperty(k)) {
          el.style[k] = ''
        }
      }
      break
    default:
      break
  }
}
```

当然以上 `patchData` 函数中的代码只包含对于样式(`style`)数据的处理，实际上我们可以把上一章中 `mountElement` 函数中完整的用来处理 `VNodeData` 数据的代码拷贝到 `patchData` 函数中，如下：

```js
export function patchData(el, key, prevValue, nextValue) {
  switch (key) {
    case 'style':
      for (let k in nextValue) {
        el.style[k] = nextValue[k]
      }
      for (let k in prevValue) {
        if (!nextValue.hasOwnProperty(k)) {
          el.style[k] = ''
        }
      }
      break
    case 'class':
      el.className = nextValue
      break
    default:
      if (key[0] === 'o' && key[1] === 'n') {
        // 事件
        el.addEventListener(key.slice(2), nextValue)
      } else if (domPropsRE.test(key)) {
        // 当作 DOM Prop 处理
        el[key] = nextValue
      } else {
        // 当作 Attr 处理
        el.setAttribute(key, nextValue)
      }
      break
  }
}
```

这样 `patchData` 函数就能够用来处理 `style`、`class`、`DOM Prop` 以及 `Attr` 的更新操作，并且可以同时满足 `mountElement` 和 `patchElement` 的需求。但 `patchData` 函数还不能够满足事件的更新操作，因为当新的 `VNodeData` 中已经不包含某个事件时，我们需要将旧的事件回调函数移除，解决办法很简单，如下：

```js {8-17}
export function patchData(el, key, prevValue, nextValue) {
  switch (key) {
    case 'style':
      // 省略处理样式的代码...
    case 'class':
      // 省略处理 class 的代码...
    default:
      if (key[0] === 'o' && key[1] === 'n') {
        // 事件
        // 移除旧事件
        if (prevValue) {
          el.removeEventListener(key.slice(2), prevValue)
        }
        // 添加新事件
        if (nextValue) {
          el.addEventListener(key.slice(2), nextValue)
        }
      } else if (domPropsRE.test(key)) {
        // 当作 DOM Prop 处理
        el[key] = nextValue
      } else {
        // 当作 Attr 处理
        el.setAttribute(key, nextValue)
      }
      break
  }
}
```

如上高亮代码所示，如果旧的事件回调函数存在，我们先将其从 DOM 元素上移除，接着如果新的事件回调函数存在我们再将其添加到 DOM 元素中。至此我们的 `patchData` 函数就算大功告成了。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/wk8pl46o18](https://codesandbox.io/s/wk8pl46o18)
:::

### 更新子节点

当 `VNodeData` 更新完成之后，对于新旧两个标签来说，就剩下子节点的差异了，所以我们在 `patchElement` 函数中最后一步需要做的事情就是递归地更新子节点，如下高亮的代码所示：

```js {32-39}
function patchElement(prevVNode, nextVNode, container) {
  // 如果新旧 VNode 描述的是不同的标签，则调用 replaceVNode 函数，使用新的 VNode 替换旧的 VNode
  if (prevVNode.tag !== nextVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
    return
  }

  // 拿到 el 元素，注意这时要让 nextVNode.el 也引用该元素
  const el = (nextVNode.el = prevVNode.el)
  const prevData = prevVNode.data
  const nextData = nextVNode.data

  if (nextData) {
    // 遍历新的 VNodeData，将旧值和新值都传递给 patchData 函数
    for (let key in nextData) {
      const prevValue = prevData[key]
      const nextValue = nextData[key]
      patchData(el, key, prevValue, nextValue)
    }
  }
  if (prevData) {
    // 遍历旧的 VNodeData，将已经不存在于新的 VNodeData 中的数据移除
    for (let key in prevData) {
      const prevValue = prevData[key]
      if (prevValue && !nextData.hasOwnProperty(key)) {
        // 第四个参数为 null，代表移除数据
        patchData(el, key, prevValue, null)
      }
    }
  }

  // 调用 patchChildren 函数递归地更新子节点
  patchChildren(
    prevVNode.childFlags, // 旧的 VNode 子节点的类型
    nextVNode.childFlags, // 新的 VNode 子节点的类型
    prevVNode.children,   // 旧的 VNode 子节点
    nextVNode.children,   // 新的 VNode 子节点
    el                    // 当前标签元素，即这些子节点的父节点
  )
}
```

我们在 `patchElement` 函数的最后调用了 `patchChildren` 函数，`patchChildren` 函数的作用就是对新旧 `VNode` 的子节点进行**同层级**的比较，它接收五个参数，前四个参数分别是新旧 `VNode` 子节点以及子节点的类型，第五个参数 `el` 是这些子节点的父节点，也就是当前被更新的标签元素。

在开始实现同层级子节点的更新之前，需要根据我们目前掌握的知识思考一下应该如何做，**思路是能够写出代码的原因**。我们观察如下两个 `div` 标签的子节点，我们用 `VNode` 来表示：

```js
const prevVNode = h('div', null, h('span'))

const nextVNode = h('div')
```

如上代码所示， `prevVNode` 所描述的 `div` 标签只有一个子节点，所以 `prevVNode` 的子节点类型应该是 `ChildrenFlags.SINGLE_VNODE`，而 `nextVNode` 所描述的 `div` 标签没有子节点，所以 `nextVNode` 的子节点类型应该是 `ChildrenFlags.NO_CHILDREN`。如果单纯地看这个例子，我们应该如何更新呢？很简单，我们只需要把 `prevVNode` 的子节点移除即可。再来看下面的两个 `VNode`：

```js
const prevVNode = h('div')

const nextVNode = h('div', null, h('span'))
```

这个例子与之前的例子恰好相反，`prevVNode` 没有子节点而 `nextVNode` 有一个子节点，所以 `prevVNode` 和 `nextVNode` 的子节点的类型分别是 `ChildrenFlags.NO_CHILDREN` 和 `ChildrenFlags.SINGLE_VNODE`，这时我们的更新操作也很简单，只需要把 `nextVNode` 的子节点挂载到 `div` 标签即可。再来看下面的例子：

```js
const prevVNode = h('div', null, h('p'))

const nextVNode = h('div', null, h('span'))
```

在这个例子中，新旧 `div` 标签都有一个子节点，所以他们的子节点类型相同，这时子节点的更新操作就等价于两个子节点之间的 `patch`。

通过这些例子我们注意到，根据新旧标签的子节点的类型不同，我们可以轻松地找到合适的方式去更新它们，我们在讲解 `VNode` 的种类时就曾经强调过，`VNode` 的类型标识在 `patch` 阶段是非常重要的信息，在这里就体现了出来。

但无论是新标签还是旧标签，该标签的子节点都可以分为三种情况：只有一个子节点、没有子节点 以及 有多个子节点。至于一个标签的子节点属于哪种类型是可以通过该标签所对应的 `VNode` 对象的 `childFlags` 属性得知的。最终在这个思路的引导下我们就可以编写出 `patchChildren` 函数，如下代码所示：

```js {}
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) {
  switch (prevChildFlags) {
    // 旧的 children 是单个子节点，会执行该 case 语句块
    case ChildrenFlags.SINGLE_VNODE:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          // 新的 children 也是单个子节点时，会执行该 case 语句块
          break
        case ChildrenFlags.NO_CHILDREN:
          // 新的 children 中没有子节点时，会执行该 case 语句块
          break
        default:
          // 新的 children 中有多个子节点时，会执行该 case 语句块
          break
      }
      break
    // 旧的 children 中没有子节点时，会执行该 case 语句块
    case ChildrenFlags.NO_CHILDREN:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          // 新的 children 是单个子节点时，会执行该 case 语句块
          break
        case ChildrenFlags.NO_CHILDREN:
          // 新的 children 中没有子节点时，会执行该 case 语句块
          break
        default:
          // 新的 children 中有多个子节点时，会执行该 case 语句块
          break
      }
      break
    // 旧的 children 中有多个子节点时，会执行该 case 语句块
    default:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          // 新的 children 是单个子节点时，会执行该 case 语句块
          break
        case ChildrenFlags.NO_CHILDREN:
          // 新的 children 中没有子节点时，会执行该 case 语句块
          break
        default:
          // 新的 children 中有多个子节点时，会执行该 case 语句块
          break
      }
      break
  }
}
```

如上代码所示，虽然看上去代码很长，但是很有规律，我们使用了嵌套的 `switch...case` 语句，外层的 `switch...case` 语句用来匹配旧的 `children` 的类型，而内层的 `switch...case` 语句则用来匹配新的 `children` 的类型。由于新旧 `children` 各有三种情况，所以合起来共有九种(`3 * 3`)情况，根据不同的情况我们所做的操作也会不同。接下来我们逐个实现，当我们把这九种情况下的更新操作全部实现之后，我们的 `patchChildren` 函数就大功告成了。

我们先来看一下当旧的 `children` 类型为 `ChildrenFlags.SINGLE_VNODE` 且新的 `children` 类型也是 `ChildrenFlags.SINGLE_VNODE` 的情况，即新旧 `children` 都是单个子节点，我们上面提到过，在这种情况下新旧 `children` 的比较等价于两个 `children(单个子节点)`之间的比较，所以只需要递归地调用 `patch` 函数即可，如下：

```js {12,13}
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) {
  switch (prevChildFlags) {
    case ChildrenFlags.SINGLE_VNODE:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          // 此时 prevChildren 和 nextChildren 都是 VNode 对象
          patch(prevChildren, nextChildren, container)
          break
        case ChildrenFlags.NO_CHILDREN:
          // 新的 children 中没有子节点时，会执行该 case 语句块
          break
        default:
          // 新的 children 中有多个子节点时，会执行该 case 语句块
          break
      }
      break

    // 省略...
  }
}
```

如上高亮代码所示，只需一行代码即可搞定，我们编写一个案例来测试我们的代码：

```js {7,18}
// 旧的 VNode
const prevVNode = h('div', null,
  h('p', {
    style: {
      height: '100px',
      width: '100px',
      background: 'red'
    }
  })
)

// 新的 VNode
const nextVNode = h('div', null,
  h('p', {
    style: {
      height: '100px',
      width: '100px',
      background: 'green'
    }
  })
)

render(prevVNode, document.getElementById('app'))

// 2秒后更新
setTimeout(() => {
  render(nextVNode, document.getElementById('app'))
}, 2000)
```

如上代码所示，新旧 `VNode` 描述的都是只有一个 `p` 标签作为子节点的 `div` 标签，所以新旧 `div` 标签的 `children` 类型都是单个子节点，只不过这两个 `p` 标签拥有不同的背景颜色，然后我们先后调用 `render` 渲染器渲染了这两个 `VNode`，最终效果是 `p` 标签的背景色被正确地更新了。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/m3oqr3knq9](https://codesandbox.io/s/m3oqr3knq9)
:::

接着我们来看一下当旧的 `children` 类型为 `ChildrenFlags.SINGLE_VNODE`，而新的 `children` 类型为 `ChildrenFlags.NO_CHILDREN` 时的情况，也就是说旧的 `children` 是单个子节点，而新的 `children` 为 `null`，即新的 `VNode` 没有子节点。在这种情况下我们只需要把旧的子节点移除即可，如下代码所示：

```js {18}
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) {
  switch (prevChildFlags) {
    // 旧的 children 是单个子节点，会执行该 case 语句块
    case ChildrenFlags.SINGLE_VNODE:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          // 新的 children 也是单个子节点时，会执行该 case 语句块
          patch(prevChildren, nextChildren, container)
          break
        case ChildrenFlags.NO_CHILDREN:
          // 新的 children 中没有子节点时，会执行该 case 语句块
          container.removeChild(prevChildren.el)
          break
        default:
          // 新的 children 中有多个子节点时，会执行该 case 语句块
          break
      }
      break

    // 省略...
  }
}
```

如上高亮代码所示，`container` 是父级元素，我们调用父级元素的 `removeChild` 方法将之前渲染好的 `prevChildren.el` 移除即可，同样只使用了一行代码就实现了功能。不过可能很多同学已经发现了这么做的问题所在，假如 `prevChildren` 的类型是一个片段的话，那么它可能渲染多个元素到容器中，所以我们需要对片段类型的 `VNode` 额外处理。但本质不变：**想办法把已经渲染好了的 DOM 元素从页面上移除**。

最后我们使用如下例子测试我们的代码：

```js
// 旧的 VNode
const prevVNode = h(
  'div',
  null,
  h('p', {
    style: {
      height: '100px',
      width: '100px',
      background: 'red'
    }
  })
)

// 新的 VNode
const nextVNode = h('div')

render(prevVNode, document.getElementById('app'))

// 2秒后更新
setTimeout(() => {
  render(nextVNode, document.getElementById('app'))
}, 2000)
```

上例中 `prevVNode` 描述的是：以一个红色背景的 `p` 标签作为子节点的 `div` 标签，而 `nextVNode` 是一个没有子节点的 `div` 标签，接着我们先后渲染了旧的和新的 `VNode`，最终效果是 `p` 标签被移除了。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/3roo60w1kp](https://codesandbox.io/s/3roo60w1kp)
:::

接着我们再来看一下当旧的 `children` 类型为 `ChildrenFlags.SINGLE_VNODE`，而新的 `children` 类型为多个子节点时的情况，在这种情况下由于旧的子节点只有一个，而新的子节点有多个，所以我们可以采用**将旧的单个子节点移除，再将新的多个子节点挂载上去**的方案，在这个思路下我们可以做出如下实现，修改我们的 `patchChildren` 函数：

```js {20-24}
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) {
  switch (prevChildFlags) {
    // 旧的 children 是单个子节点，会执行该 case 语句块
    case ChildrenFlags.SINGLE_VNODE:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          patch(prevChildren, nextChildren, container)
          break
        case ChildrenFlags.NO_CHILDREN:
          container.removeChild(prevChildren.el)
          break
        default:
          // 移除旧的单个子节点
          container.removeChild(prevChildren.el)
          // 遍历新的多个子节点，逐个挂载到容器中
          for (let i = 0; i < nextChildren.length; i++) {
            mount(nextChildren[i], container)
          }
          break
      }
      break

    // 省略...
  }
}
```

如上高亮代码所示，实现起来也非常简单，我们使用了与之前一样的方法将旧的单个子节点移除，然后遍历新的多个子节点，并调用 `mount` 函数逐个将之挂载到容器中。我们可以使用下面的例子测试我们的代码：

```js
// 旧的 VNode
const prevVNode = h('div', null, h('p', null, '只有一个子节点'))

// 新的 VNode
const nextVNode = h('div', null, [
  h('p', null, '子节点 1'),
  h('p', null, '子节点 2')
])

render(prevVNode, document.getElementById('app'))

// 2秒后更新
setTimeout(() => {
  render(nextVNode, document.getElementById('app'))
}, 2000)

```

如上代码所示，旧的 `VNode` 是一个只有一个子节点的 `div` 标签，而新的 `VNode` 是一个拥有多个子节点的 `div` 标签。最终的效果是旧的单个子节点被移除，新的多个子节点全都被添加上去。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/lpm17161m](https://codesandbox.io/s/lpm17161m)
:::

以上我们讲解并实现了当旧的 `children` 类型为单个子节点时，所有情况下的更新操作，可以用一张图来总结，如下：

![](@imgs/patch-children-1.png)

类似的，当旧的 `children` 类型为 `ChildrenFlags.NO_CHILDREN`，即没有子节点时，新的 `children` 依然可能有三种情况，我们也可以用一张图来表示：

![](@imgs/patch-children-2.png)

我们来解释一下上图的操作：

- 情况一：没有旧的子节点、新的子节点为单个子节点，此时只需要把新的单个子节点添加到容器元素即可。
- 情况二：没有旧的子节点、同时也没有新的子节点，那自然什么都不用做了。
- 情况三：没有旧的子节点、但有多个新的子节点，那把这多个子节点都添加到容器元素即可。

基于此，我们可以轻松编写出对应的逻辑，如下 `patchChildren` 函数所示：

```js {16-17,21,25-28}
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) {
  switch (prevChildFlags) {
    // 省略...

    // 旧的 children 中没有子节点时，会执行该 case 语句块
    case ChildrenFlags.NO_CHILDREN:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          // 新的 children 是单个子节点时，会执行该 case 语句块
          // 使用 mount 函数将新的子节点挂载到容器元素
          mount(nextChildren, container)
          break
        case ChildrenFlags.NO_CHILDREN:
          // 新的 children 中没有子节点时，会执行该 case 语句块
          // 什么都不做
          break
        default:
          // 新的 children 中有多个子节点时，会执行该 case 语句块
          // 遍历多个新的子节点，逐个使用 mount 函数挂载到容器元素
          for (let i = 0; i < nextChildren.length; i++) {
            mount(nextChildren[i], container)
          }
          break
      }
      break

    // 省略...
  }
}
```

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/62x41myyrz](https://codesandbox.io/s/62x41myyrz)
:::

现在对于旧的 `children` 类型来说，我们只剩下最后一种情况没有处理了，就是当旧的 `children` 类型为多个子节点时，同样的我们来画一张图：

![](@imgs/patch-children-3.png)

如上图所示，当旧的 `children` 类型为多个子节点时，新的 `children` 类型有三种情况，不同的情况采用不同的操作：

- 情况一：有多个旧的子节点，但新的子节点是单个子节点，这时只需要把所有旧的子节点移除，再将新的单个子节点添加到容器元素即可。
- 情况二：有多个旧的子节点，但没有新的子节点，这时只需要把所有旧的子节点移除即可。
- 情况三：新旧子节点都是多个子节点，这时将进入到至关重要的一步，即核心 `diff` 算法的用武之地。

实际上在整个新旧 `children` 的比对中，只有当新旧子节点都是多个子节点时才有必要进行真正的核心 `diff`，从而尽可能的复用子节点。

对于**情况一**和**情况二**而言，实现起来相当容易，如下代码所示：

```js {14-17,20-22}
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) {
  switch (prevChildFlags) {
    // 省略...

    default:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          for (let i = 0; i < prevChildren.length; i++) {
            container.removeChild(prevChildren[i].el)
          }
          mount(nextChildren, container)
          break
        case ChildrenFlags.NO_CHILDREN:
          for (let i = 0; i < prevChildren.length; i++) {
            container.removeChild(prevChildren[i].el)
          }
          break
        default:
          // 新的 children 中有多个子节点时，会执行该 case 语句块
          break
      }
      break
  }
}
```

如上高亮代码所示，对于新的 `children` 为单个子节点的情况，我们遍历旧的子节点逐个将之从容器元素中移除，并调用 `mount` 函数将新的子节点挂载到容器元素中，对于新的 `children` 为没有子节点的情况，我们则直接遍历旧的子节点将其全部从容器元素中移除即可。实际上整个 `children` 的 `patch` 过程中，最复杂的当属最后一种情况：**新旧子节点都是多个子节点的情况**，之所以在这种情况下更新操作会变的复杂，是因为我们对“自己”的要求较高，因为假设按照之前的思路我们完全可以采用 **“将旧的子节点全部移除，再将所有新的子节点添加”** 的思路来完成更新，这样事情就会简单许多，不过虽然这么做可以实现最终的目的，但所有 DOM 的更新都毫无复用可言。限于本章的篇幅我们暂时采用简单的办法完成子节点的更新，对于真正的核心 `diff` 算法我们将会在下一章统一着重讲解，简化版本的实现如下：

```js {26-33}
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) {
  switch (prevChildFlags) {
    // 省略...

    // 旧的 children 中有多个子节点时，会执行该 case 语句块
    default:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          for (let i = 0; i < prevChildren.length; i++) {
            container.removeChild(prevChildren[i].el)
          }
          mount(nextChildren, container)
          break
        case ChildrenFlags.NO_CHILDREN:
          for (let i = 0; i < prevChildren.length; i++) {
            container.removeChild(prevChildren[i].el)
          }
          break
        default:
          // 遍历旧的子节点，将其全部移除
          for (let i = 0; i < prevChildren.length; i++) {
            container.removeChild(prevChildren[i].el)
          }
          // 遍历新的子节点，将其全部添加
          for (let i = 0; i < nextChildren.length; i++) {
            mount(nextChildren[i], container)
          }
          break
      }
      break
  }
}
```

如上高亮代码所示，我们先遍历旧的子节点，将其全部从容器元素中移除。然后再遍历新的子节点，并将其全部添加到容器元素中。这样我们就完成了更新的操作，但这里再次强调：我们这么做是限于篇幅，同时为了方便后续案例代码的编写，在下一章中我们将着重讲解**当新旧子节点都是多个子节点时，应该如何尽可能的复用子节点**。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/ym6k442lmj](https://codesandbox.io/s/ym6k442lmj)
:::

## 更新文本节点

我们花了很大的篇幅讲解了标签元素的更新，实际上标签元素的确是 DOM 更新中的主要操作，接下来我们讲解一下文本节点的更新。如果新旧两个 `VNode` 的类型都是纯文本类型，那么在 `patch` 内部会调用 `patchText` 函数更新旧的文本节点。文本节点的更新非常简单，如果一个 DOM 元素是文本节点或注释节点，那么可以通过调用该 DOM 对象的 `nodeValue` 属性读取或设置文本节点(或注释节点)的内容，例如：

```js
// 创建一个文本节点
const textEl = document.createTextNode('a')

textEl.nodeValue  // 'a'

textEl.nodeValue = 'b'

textEl.nodeValue  // 'b'
```

利用这一点我们就可以轻松实现对于文本元素的更新，如下是 `patchText` 函数的实现：

```js
function patchText(prevVNode, nextVNode) {
  // 拿到文本元素 el，同时让 nextVNode.el 指向该文本元素
  const el = (nextVNode.el = prevVNode.el)
  // 只有当新旧文本内容不一致时才有必要更新
  if (nextVNode.children !== prevVNode.children) {
    el.nodeValue = nextVNode.children
  }
}
```

`patchText` 函数接收新旧 `VNode` 作为参数，首先我们需要通过旧的 `prevVNode.el` 属性拿到已经渲染在页面上的文本节点元素，并让 `nextVNode.el` 指向它。接着由于对纯文本类型的 `VNode` 而言，它的 `children` 属性存储的就是其文本内容，所以通过对比新旧文本内容是否一致来决定是否需要更新，只有新旧文本内容不一致时我们才会设置文本节点的 `el.nodeValue` 属性的值，从而完成文本节点的更新。

我们可以使用如下例子测试我们的代码：

```js
// 旧的 VNode
const prevVNode = h('p', null, '旧文本')

// 新的 VNode
const nextVNode = h('p', null, '新文本')

render(prevVNode, document.getElementById('app'))

// 2秒后更新
setTimeout(() => {
  render(nextVNode, document.getElementById('app'))
}, 2000)
```

我们先后创建了两个带有文本子节点的 `p` 标签，并调用 `render` 渲染器渲染了旧的 `VNode` 以及新的 `VNode`。最终效果是两秒之后文本被更新了。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/73zzzv9xn6](https://codesandbox.io/s/73zzzv9xn6)
:::

## 更新 Fragment

如果两个 `VNode` 的类型都是片段，则 `patch` 函数会调用 `patchFragment` 函数更新片段的内容。实际上**片段的更新是简化版的标签元素的更新**，我们知道对于标签元素来说更新的过程分为两个步骤：首先需要更新标签本身的 `VNodeData`，其次更新其子节点。然而由于 `Fragment` 没有包裹元素，只有子节点，所以我们对 `Fragment` 的更新本质上就是更新两个片段的“子节点”。

如下是 `patchFragment` 函数的实现：

```js
function patchFragment(prevVNode, nextVNode, container) {
  // 直接调用 patchChildren 函数更新 新旧片段的子节点即可
  patchChildren(
    prevVNode.childFlags, // 旧片段的子节点类型
    nextVNode.childFlags, // 新片段的子节点类型
    prevVNode.children,   // 旧片段的子节点
    nextVNode.children,   // 新片段的子节点
    container
  )
}
```

如上代码所示，我们直接调用 `patchChildren` 函数更新新旧片段的子节点即可，但是不要忘记更新 `nextVNode.el` 属性，就像我们当初实现 `mountFragment` 时一样，根据子节点的类型不同，`VNode` 所引用的元素也不同，我们为 `patchFragment` 添加如下代码：

```js {11-20}
function patchFragment(prevVNode, nextVNode, container) {
  // 直接调用 patchChildren 函数更新 新旧片段的子节点即可
  patchChildren(
    prevVNode.childFlags, // 旧片段的子节点类型
    nextVNode.childFlags, // 新片段的子节点类型
    prevVNode.children,   // 旧片段的子节点
    nextVNode.children,   // 新片段的子节点
    container
  )

  switch (nextVNode.childFlags) {
    case ChildrenFlags.SINGLE_VNODE:
      nextVNode.el = nextVNode.children.el
      break
    case ChildrenFlags.NO_CHILDREN:
      nextVNode.el = prevVNode.el
      break
    default:
      nextVNode.el = nextVNode.children[0].el
  }
}
```

如上高亮代码所示，我们通过检查新的片段的 `children` 类型，如果新的片段的 `children` 类型是单个子节点，则意味着其 `vnode.children` 属性的值就是 `VNode` 对象，所以直接将 `nextVNode.children.el` 赋值给 `nextVNode.el` 即可。如果新的片段没有子节点，我们知道对于没有子节点的片段我们会使用一个空的文本节点占位，而 `prevVNode.el` 属性引用的就是该空文本节点，所以我们直接通过旧片段的 `prevVNode.el` 拿到该空文本元素并赋值给新片段的 `nextVNode.el` 即可。如果新的片段的类型是多个子节点，则 `nextVNode.children` 是一个 `VNode` 数组，我们会让新片段的 `nextVNode.el` 属性引用数组中的第一个元素。实际上这段逻辑与我们在 `mountFragment` 函数中所实现的逻辑是一致的。

我们可以使用下面的例子测试我们的代码：

```js
// 旧的 VNode
const prevVNode = h(Fragment, null, [
  h('p', null, '旧片段子节点 1'),
  h('p', null, '旧片段子节点 2')
])

// 新的 VNode
const nextVNode = h(Fragment, null, [
  h('p', null, '新片段子节点 1'),
  h('p', null, '新片段子节点 2')
])

render(prevVNode, document.getElementById('app'))

// 2秒后更新
setTimeout(() => {
  render(nextVNode, document.getElementById('app'))
}, 2000)
```

如上这段代码中我们创建了旧的和新的两个片段，并先后使用渲染器进行渲染，结果是片段得到了正确的更新。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/1r9k5y1ozq](https://codesandbox.io/s/1r9k5y1ozq)
:::

## 更新 Portal

如果两个 `VNode` 的类型都是 `Portal`，那么 `patch` 函数内部会调用 `patchPortal` 函数进行更新。我们在“渲染器之挂载”一章中曾做出一个不严谨但很直观的比喻：可以把 `Portal` 当作可以到处挂载的 `Fragment`。实际上 `Portal` 的更新与 `Fragment` 类似，我们需要更新其子节点，但由于 `Portal` 可以被到处挂载，所以新旧 `Portal` 的挂载目标可能不同，所以对于 `Portal` 的更新除了要更新其子节点之外，还要对比新旧挂载目标是否相同，如果新的 `Portal` 的挂载目标变了我们就需要将 `Portal` 的内容从旧的容器中搬运到新的容器中。我们首先来更新 `Portal` 的子节点，如下代码所示，与更新 `Fragment` 的子节点相同：

```js
patchPortal (prevVNode, nextVNode){
  patchChildren(
    prevVNode.childFlags,
    nextVNode.childFlags,
    prevVNode.children,
    nextVNode.children,
    prevVNode.tag // 注意容器元素是旧的 container
  )

  // 让 nextVNode.el 指向 prevVNode.el
  nextVNode.el = prevVNode.el
}
```

如上代码所示，我们首先调用 `patchChildren` 函数更新 `Portal` 的子节点，其中需要注意的是 `patchChildren` 的第五个参数是旧的挂载容器，也就是说即使新的 `Portal` 的挂载目标变了，但是在这一步的更新完成之后 `Portal` 的内容仍然存在于旧的容器中。接着我们将 `prevVNode.el` 赋值给 `nextVNode.el`，这一步要比 `Fragment` 容易的多，因为我们知道对于 `Portal` 类型的 `VNode` 来说其 `el` 属性始终是一个占位的文本节点。

在如上这些工作完成之后，我们要思考的问题就是挂载目标了，由于新旧 `Portal` 的挂载目标可能是不同的，例如：

```js
// 挂载目标是 id="box1" 的元素
const prevPortal = h(Portal, { target: '#box1' }, h('div'))

// 挂载目标是 id="box2" 的元素
const nextPortal = h(Portal, { target: '#box2' }, h('div'))
```

可以看到，旧的 `Portal` 的挂载目标是 `id="box1"` 的容器元素，而新的 `Portal` 的挂载目标是 `id="box2"` 的容器元素。但是由于我们在更新子节点的过程中，传递给 `patchChildren` 函数的容器元素始终都是旧的容器元素，所以最终结果是：**更新后的子节点也存在于旧的容器中**，所以我们还需要做最后一步工作，就是**把旧容器内的元素都搬运到新容器中**，我们给 `patchPortal` 函数增加如下代码：

```js {12-32}
function patchPortal(prevVNode, nextVNode) {
  patchChildren(
    prevVNode.childFlags,
    nextVNode.childFlags,
    prevVNode.children,
    nextVNode.children,
    prevVNode.tag // 注意 container 是旧的 container
  )
  // 让 nextVNode.el 指向 prevVNode.el
  nextVNode.el = prevVNode.el

  // 如果新旧容器不同，才需要搬运
  if (nextVNode.tag !== prevVNode.tag) {
    // 获取新的容器元素，即挂载目标
    const container =
      typeof nextVNode.tag === 'string'
        ? document.querySelector(nextVNode.tag)
        : nextVNode.tag

    switch (nextVNode.childFlags) {
      case ChildrenFlags.SINGLE_VNODE:
        // 如果新的 Portal 是单个子节点，就把该节点搬运到新容器中
        container.appendChild(nextVNode.children.el)
        break
      case ChildrenFlags.NO_CHILDREN:
        // 新的 Portal 没有子节点，不需要搬运
        break
      default:
        // 如果新的 Portal 是多个子节点，遍历逐个将它们搬运到新容器中
        for (let i = 0; i < nextVNode.children.length; i++) {
          container.appendChild(nextVNode.children[i].el)
        }
        break
    }
  }
}
```

如上高亮代码所示，我们通过 `nextVNode.tag !== prevVNode.tag` 来判断新旧 `Portal` 的容器是否相同，只有容器不同的情况下才需要搬运工作。搬运的原理是什么呢？我们知道当我们调用 `appendChild` 方法向 DOM 中添加元素时，如果被添加的元素已存在于页面上，那么就会移动该元素到目标容器元素下。我们利用这一点，由于经过 `patchChildren` 函数的处理之后，新的子节点已经存在于旧的容器中了，所以我们只需要在新容器元素上调用 `appendChild` 方法将这些已经存在于旧容器中的子节点搬运过去即可。

当然了，在搬运的过程中，我们要检查新的 `Portal` 的子节点类型，并采用合适的处理方式。我们可以使用如下例子测试我们的代码：

```js
// 旧的 VNode
const prevVNode = h(
  Portal,
  { target: '#old-container' },
  h('p', null, '旧的 Portal')
)

// 新的 VNode
const nextVNode = h(
  Portal,
  { target: '#new-container' },
  h('p', null, '新的 Portal')
)

render(prevVNode, document.getElementById('app'))

// 2秒后更新
setTimeout(() => {
  render(nextVNode, document.getElementById('app'))
}, 2000)
```

如上代码所示，在这个例子中 `prevVNode` 和 `nextVNode` 的类型都是 `Portal`，并且新旧 `Portal` 的挂载目标不同，分别是 `#old-container` 和 `#new-container`，如下是完整的代码和在线体验地址。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/xj118zm82o](https://codesandbox.io/s/xj118zm82o)
:::

## 有状态组件的更新

接下来我们要介绍的就是有状态组件的更新，首先我们需要思考的问题是：在什么情况下才会触发有状态组件的更新呢？实际上对于有状态组件来说它的更新方式有两种：**主动更新** 和 **被动更新**。

什么是**主动更新**呢？所谓主动更新指的是组件自身的状态发生变化所导致的更新，例如组件的 `data` 数据发生了变化就必然需要重渲染。但是大家不要忘记：一个组件所渲染的内容是很可能包含其它组件的，也就是子组件，对于子组件来讲，它除了自身状态之外，很可能还包含从父组件传递进来的外部状态(`props`)，所以父组件自身状态的变化很可能引起子组件外部状态的变化，此时就需要更新子组件，像这种因为外部状态变化而导致的组件更新就叫做**被动更新**。

### 主动更新

我们先来讨论组件的主动更新，我们知道组件的核心是渲染函数，渲染函数会产出 `VNode`，渲染器会将渲染函数产出的 `VNode` 渲染为真实 DOM，当组件的状态变化时我们需要做的就是重新执行渲染函数并产出新的 `VNode`，最后通过新旧 `VNode` 之间的补丁算法完成真实 DOM 的更新。这里的关键点在于**数据变化之后需要重新执行渲染函数，得到新的 VNode**，我们来回顾一下前面章节中讲解过的用于挂载有状态组件的 `mountStatefulComponent` 函数：

```js
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例
  const instance = new vnode.tag()
  // 渲染VNode
  instance.$vnode = instance.render()
  // 挂载
  mount(instance.$vnode, container, isSVG)
  // el 属性值 和 组件实例的 $el 属性都引用组件的根DOM元素
  instance.$el = vnode.el = instance.$vnode.el
}
```

组件挂载的核心步骤分为三步：1、创建组件实例，2、调用组件的 `render` 获得 `VNode`，3、将 `VNode` 挂载到容器元素。实际上我们可以把除了创建组件实例这一步之外的代码封装成一个函数，如下：

```js {5-12,14}
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例
  const instance = new vnode.tag()

  instance._update = function() {
    // 1、渲染VNode
    instance.$vnode = instance.render()
    // 2、挂载
    mount(instance.$vnode, container, isSVG)
    // 4、el 属性值 和 组件实例的 $el 属性都引用组件的根DOM元素
    instance.$el = vnode.el = instance.$vnode.el
  }

  instance._update()
}
```

如上代码所示，在 `mountStatefulComponent` 函数内部，我们将除了创建组件实例之外的所有工作封装到了组件实例对象的 `instance._update` 函数中，紧接着在 `mountStatefulComponent` 函数的最后立即调用了 `_update` 函数，我们为什么要这么做呢？实际上 `_update` 函数所做的工作就是渲染组件，这样当组件自身状态发生变化后，我们就可以再次调用 `_update` 函数来完成组件的更新。

假设我们有 `MyComponent` 组件，如下：

```js
class MyComponent {
  // 自身状态 or 本地状态
  localState = 'one'

  // mounted 钩子
  mounted() {
    // 两秒钟之后修改本地状态的值，并重新调用 _update() 函数更新组件
    setTimeout(() => {
      this.localState = 'two'
      this._update()
    }, 2000)
  }

  render() {
    return h('div', null, this.localState)
  }
}
```

如上组件所示，该组件拥有一个叫做 `localState` 的数据，并且 `render` 函数中使用到了该数据。接着我们在组件的 `mounted` 钩子函数中设置了一个定时器，两秒钟之后会修改自身状态 `localState` 的值，由于我们目前没有讲解响应系统，所以我们暂时需要手动调用 `_update` 函数来完成组件的更新，等到后面响应系统相关的章节中我们再来详细讲解如何完成自动更新。另外在如上组件中我们使用了 `mounted` 生命周期钩子，但是就我们目前所实现的 `mountStatefulComponent` 函数而言，它并没有调用组件的任何生命周期函数的能力，为了代码的正常运行，我们需要为 `mountStatefulComponent` 函数添加执行 `mounted` 回调的能力，很简单我们只需要在组件被渲染为真实 DOM 之后调用该组件实例的 `mounted` 函数即可，如下高亮代码所示：

```js {12,13}
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例
  const instance = new vnode.tag()

  instance._update = function() {
    // 1、渲染VNode
    instance.$vnode = instance.render()
    // 2、挂载
    mount(instance.$vnode, container, isSVG)
    // 4、el 属性值 和 组件实例的 $el 属性都引用组件的根DOM元素
    instance.$el = vnode.el = instance.$vnode.el
    // 5、调用 mounted 钩子
    instance.mounted && instance.mounted()
  }

  instance._update()
}
```

这样当我们使用 `mountStatefulComponent` 函数挂载有状态组件时，如果组件提供了 `mounted` 方法，那么该方法就会被当作钩子函数调用，更多的关于生命周期钩子函数的内容我们暂且不做深入讨论，我们还是回到组件更新的问题上。现在 `MyComponent` 组件的 `mounted` 钩子函数已经可以被正确执行，我们在 `mounted` 钩子函数内修改了组件的自身状态的值并再次调用了 `_update` 函数进行组件的更新，但是在更新时我们不应该像初次挂载组件那样去调用 `mount` 函数，而是应该调用 `patch` 函数将组件新产出的 `VNode` 与初次挂载时产出的旧 `VNode` 做比较并完成更新，但无论是初次挂载还是后续更新我们调用的都是 `_update` 函数，可是 `_update` 函数怎么知道当前这次渲染到底是初次挂载还是后续更新呢？所以我们需要为组件实例设计一个 `boolean` 类型的状态标识，用来标记组件是否已经被挂载，这样 `_update` 函数就能够区分当前这次渲染到底是初次挂载还是后续更新了，如下是我们修改之后的 `mountStatefulComponent` 函数的代码：

```js
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例
  const instance = new vnode.tag()

  instance._update = function() {
    // 如果 instance._mounted 为真，说明组件已挂载，应该执行更新操作
    if (instance._mounted) {
      // 1、拿到旧的 VNode
      const prevVNode = instance.$vnode
      // 2、重渲染新的 VNode
      const nextVNode = (instance.$vnode = instance.render())
      // 3、patch 更新
      patch(prevVNode, nextVNode, prevVNode.el.parentNode)
      // 4、更新 vnode.el 和 $el
      instance.$el = vnode.el = instance.$vnode.el
    } else {
      // 1、渲染VNode
      instance.$vnode = instance.render()
      // 2、挂载
      mount(instance.$vnode, container, isSVG)
      // 3、组件已挂载的标识
      instance._mounted = true
      // 4、el 属性值 和 组件实例的 $el 属性都引用组件的根DOM元素
      instance.$el = vnode.el = instance.$vnode.el
      // 5、调用 mounted 钩子
      instance.mounted && instance.mounted()
    }
  }

  instance._update()
}
```

如上代码所示，我们通过一个 `if...else` 语句判断组件实例的 `instance._mounted` 属性值的真假，来判断应该执行初次挂载操作还是更新操作。`if` 语句块内的代码用于执行更新操作，大致分为四个步骤：

- 1、取得旧的 `VNode`，由于初次挂载组件时所产出的 `VNode` 存储在组件实例的 `$vnode` 属性中，所以我们可以通过 `$vnode` 属性拿到旧的 `VNode`。
- 2、重新调用 `render` 函数产出新的 `VNode`。
- 3、调用 `patch` 函数对比新旧 `VNode`，完成更新操作。

除了以上三步之外，我们还应该使用新的真实 DOM 元素去更新 `vnode.el` 属性和组件实例的 `$el` 属性的值。另外大家注意我们在第三步中传递给 `patch` 函数的第三个参数，它是容器元素，这个容器元素可以通过获取旧的 `vnode.el` 的父节点得到。

现在组件的主动更新我们就讲解完了，下面的链接是完整代码和线上体验地址。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/jzl0nk81xy](https://codesandbox.io/s/jzl0nk81xy)
:::

### 初步了解组件的外部状态 props

上面我们讲解了有状态组件的主动更新，接下来我们本应该继续讲解有状态组件的被动更新，但是在讲解被动更新之前，需要花点时间来做一些铺垫，我们先了解一下组件的 `props`，为什么需要了解 `props` 呢？因为组件的被动更新是由组件的外部状态变化所导致的，而 `props` 就是组件的外部状态。不过本节不会深入讨论 `props`，点到为止，我们会在后续的章节中专门详细地讲解 `props`。

假设父组件的模板如下：

```html
<!-- 父组件模板 -->
<template>
  <ChildComponent :text="localState" />
</template>
```

父组件的模板中渲染了 `ChildComponent` 子组件，`ChildComponent` 子组件有一个 `text` 属性，它是一个绑定属性，绑定的变量是父组件的自身状态 `localState`。这段模板被编译后的渲染函数可以表示为：

```js
render() {
  return h(ChildComponent, {
    text: this.localState
  })
}
```

这段渲染函数就是父组件的渲染函数，所以我们可以这样定义父组件：

```js
class ParentComponent {

  // 本地状态
  localState = 'one'

  render() {
    childCompVNode = h(ChildComponent, {
      text: this.localState
    })
    return childCompVNode
  }
}
```

如上代码所示，父组件渲染函数所返回的就是子组件的 `VNode`，即 `childCompVNode`。`childCompVNode` 将会被 `mountStatefulComponent` 函数挂载，挂载的步骤我们已经再熟悉不过了：1、创建组件实例，2、调用组件实例的 `render` 函数，3、调用 `mount` 函数挂载。实际上我们可以在组件实例创建之后立即初始化组件的 `props`。为 `mountStatefulComponent` 函数添加如下代码：

```js {5}
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例
  const instance = (vnode.children = new vnode.tag())
  // 初始化 props
  instance.$props = vnode.data

  // 省略...
}
```

如上高亮代码所示，在组件实例创建完成之后，我们为组件实例添加了 `$props` 属性，并且将 `vnode.data` 赋值给 `$props`。这样，子组件中就可以通过 `this.$props.text` 访问从父组件传递进来的 `props` 数据。如下是 `ChildComponent` 组件中使用外部数据的方式：

```js
// 子组件类
class ChildComponent {
  render() {
    // 通过 this.$props.text 访问外部数据
    return h('div', null, this.$props.text)
  }
}
```

这样我们就实现了父组件向子组件传递 `props` 的能力，不过在该实现中我们以最简单的方式，直接将 `VNodeData` 赋值给 `$props`，我们知道 `VNodeData` 中的数据并不全是 `props`，其中还包含事件以及其他重要的信息，所以在真正的实现中，我们会从 `VNodeData` 中提取 `props`。不过这并不是本章的重点内容，我们一切从简。

现在子组件已经有能力拿到从父组件传递进来的 `props` 数据了，我们可以使用如下例子测试我们的代码：

```js
// 子组件类
class ChildComponent {
  render() {
    // 子组件中访问外部状态：this.$props.text
    return h('div', null, this.$props.text)
  }
}
// 父组件类
class ParentComponent {
  localState = 'one'

  render() {
    return h(ChildComponent, {
      // 父组件向子组件传递的 props
      text: this.localState
    })
  }
}

// 有状态组件 VNode
const compVNode = h(ParentComponent)
render(compVNode, document.getElementById('app'))
```

这里是完整的代码和在线体验地址：[https://codesandbox.io/s/k5lll524m5](https://codesandbox.io/s/k5lll524m5)，可以看到如上代码能够正确运行，子组件中可以访问由父组件传递进来的数据。

### 被动更新

有了 `props` 的铺垫之后，我们可以开始讨论有状态组件的**被动更新**了。如前所述，被动更新指的是由外部状态变化而引起的更新操作，通常父组件自身状态的变化可能会引起子组件的更新，我们可以修改上面的例子，为父组件添加 `mounted` 钩子，并在该钩子函数中修改父组件的自身状态 `localState` 的值，如下：

```js {12-18}
// 子组件类
class ChildComponent {
  render() {
    // 子组件中访问外部状态：this.$props.text
    return h('div', null, this.$props.text)
  }
}
// 父组件类
class ParentComponent {
  localState = 'one'

  mounted() {
    // 两秒钟后将 localState 的值修改为 'two'
    setTimeout(() => {
      this.localState = 'two'
      this._update()
    }, 2000)
  }

  render() {
    return h(ChildComponent, {
      // 父组件向子组件传递的 props
      text: this.localState
    })
  }
}

// 有状态组件 VNode
const compVNode = h(ParentComponent)
render(compVNode, document.getElementById('app'))
```

如上高亮代码所示，我们为父组件定义了 `mounted` 钩子函数，在 `mounted` 钩子函数内我们设置了一个定时器，两秒钟后修改 `localState` 的值为 `'two'` 并调用 `_update` 方法更新父组件。这个过程我们可以理解为父组件 `ParentComponent` 先后产出了两个不同的 `VNode`：第一次渲染产出的 `VNode` 是：

```js
const prevCompVNode = h(ChildComponent, {
  text: 'one'
})
```

第二次由于自身状态变化所产出的 `VNode` 为：

```js
const nextCompVNode = h(ChildComponent, {
  text: 'two'
})
```

所以在 `_update` 函数内部的更新操作，等价于 `prevCompVNode` 和 `nextCompVNode` 之间的 `patch`，即：

```js
patch(prevCompVNode, nextCompVNode, prevCompVNode.el.parentNode)
```

由于 `prevCompVNode` 和 `nextCompVNode` 的类型都是组件类型的 `VNode`，所以在 `patch` 函数内部会调用 `patchComponent` 函数进行更新，如下高亮代码所示：

```js {10}
function patch(prevVNode, nextVNode, container) {
  const nextFlags = nextVNode.flags
  const prevFlags = prevVNode.flags

  if (prevFlags !== nextFlags) {
    replaceVNode(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.ELEMENT) {
    patchElement(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.COMPONENT) {
    patchComponent(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.TEXT) {
    patchText(prevVNode, nextVNode)
  } else if (nextFlags & VNodeFlags.FRAGMENT) {
    patchFragment(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.PORTAL) {
    patchPortal(prevVNode, nextVNode)
  }
}
```

`patchComponent` 函数接收三个参数，分别是旧的 `VNode` 和新的 `VNode` 以及容器元素 `container`，如下是 `patchComponent` 函数的实现：

```js
function patchComponent(prevVNode, nextVNode, container) {
  // 检查组件是否是有状态组件
  if (nextVNode.flags & VNodeFlags.COMPONENT_STATEFUL_NORMAL) {
    // 1、获取组件实例
    const instance = (nextVNode.children = prevVNode.children)
    // 2、更新 props
    instance.$props = nextVNode.data
    // 3、更新组件
    instance._update()
  }
}
```

如上代码所示，我们通过检查组件的 `flags` 判断组件是否是有状态组件，如果是有状态组件则更新之。更新操作很简单，三步：

- 1、通过 `prevVNode.children` 拿到组件实例
- 2、更新 `props`，使用新的 `VNodeData` 重新设置组件实例的 `$props` 属性
- 3、由于组件的 `$props` 已更新，所以调用组件的 `_update` 方法，让组件重渲染。

这里需要澄清的一件事，我们之所以能够通过 `VNode` 的 `children` 属性来读取组件实例，例如上面代码中的 `prevVNode.children`，是因为每个类型为有状态组件的 `VNode`，在挂载期间我们都会让其 `children` 属性引用组件的实例，以便能够通过 `VNode` 访问组件实例对象。这一点我们早在“先设计 VNode 吧”一章中就有提及。所以我们需要修改 `mountStatefulComponent` 函数的代码，在创建组件实例后需要将实例对象赋值给 `vnode.children` 属性，如下：

```js {3}
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例
  const instance = (vnode.children = new vnode.tag())

  // 省略...
}
```

这样我们在 `patchComponent` 函数中就能够通过 `VNode` 拿到组件实例了，这里我们再次强调：`VNode` 的 `children` 属性本应该用来存储子节点，但是对于组件类型的 `VNode` 来说，它的子节点都应该作为插槽存在，并且我们选择将插槽内容存储在单独的 `slots` 属性中，而非存储在 `children` 属性中，这样 `children` 属性就可以用来存储组件实例了，这些内容我们会在后面章节中讲解插槽时再次说明。

如下是完整代码以及在线体验地址：

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/2z7335kn5y](https://codesandbox.io/s/2z7335kn5y)
:::

在上面的讲解中，父组件自身状态变化之后，它渲染的子组件并没有变化，仍然是 `ChildComponent`，仅仅是传递给子组件的 `props` 数据发生了变化。但是，有时父组件自身状态的变化会导致父组件渲染不同的子组件，如下代码所示：

```js {13,14}
// 父组件类
class ParentComponent {
  isTrue = true

  mounted() {
    setTimeout(() => {
      this.isTrue = false
      this._update()
    }, 2000)
  }

  render() {
    // 如果 this.isTrue 的值为真，则渲染 ChildComponent1，否则渲染 ChildComponent2
    return this.isTrue ? h(ChildComponent1) : h(ChildComponent2)
  }
}
// 有状态组件 VNode
const compVNode = h(ParentComponent)

render(compVNode, document.getElementById('app'))
```

如上代码所示，观察 `ParentComponent` 组件的 `render` 函数，当 `ParentComponent` 组件的自身状态 `isTrue` 为真时会渲染子组件 `ChildComponent1`，否则会渲染子组件 `ChildComponent2`。同时我们在 `mounted` 钩子中设置了定时器，两秒钟后将 `isTrue` 的值变更为 `false`，并调用 `_update` 方法更新 `ParentComponent` 组件。在这种情况下就会出现因父组件自身状态的变化而导致其渲染不同的组件，在初次挂载时 `ParentComponent` 组件所产出的 `VNode` 为：

```js
const pervCompVNode = h(ChildComponent1)
```

更新之后 `ParentComponent` 组件所产出的 `VNode` 为：

```js
const nextCompVNode = h(ChildComponent2)
```

虽然 `pervCompVNode` 和 `nextCompVNode` 的类型都是组件，但它们是不同的组件。拿上面的例子来说，`pervCompVNode` 描述的是组件 `ChildComponent1`，`nextCompVNode` 描述的是组件 `ChildComponent2`，也就是说新旧 `VNode` 所描述的不是同一个组件，这就引申出我们更新组件的一个原则：**我们认为不同的组件渲染不同的内容**，所以对于不同的组件，我们采用的方案是使用新组件的内容替换旧组件渲染的内容。根据这个思想，我们修改 `patchComponent` 函数的代码，如下：

```js {3-4}
function patchComponent(prevVNode, nextVNode, container) {
  // tag 属性的值是组件类，通过比较新旧组件类是否相等来判断是否是相同的组件
  if (nextVNode.tag !== prevVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
  } else if (nextVNode.flags & VNodeFlags.COMPONENT_STATEFUL_NORMAL) {
    // 获取组件实例
    const instance = (nextVNode.children = prevVNode.children)
    // 更新 props
    instance.$props = nextVNode.data
    // 更新组件
    instance._update()
  }
}
```

如上 `patchComponent` 函数中的高亮代码所示，增加了一个判断条件，我们知道对于组件类型的 `VNode` 而言，它的 `tag` 属性值引用的就是组件类本身，我们通过对比前后组件类是否相同来确定新旧组件是否是相同的组件，如果不相同则直接调用 `replaceVNode` 函数使用新组件替换旧的组件。大家还记的 `replaceVNode` 函数的实现方式吗？如下：

```js
function replaceVNode(prevVNode, nextVNode, container) {
  container.removeChild(prevVNode.el)
  mount(nextVNode, container)
}
```

这是我们之前实现过的 `replaceVNode` 函数，它的原理就是将旧的 `VNode` 所渲染的内容从容器元素中移除，并将新的 `VNode` 挂载到容器元素中。这段代码同样适用于组件，但是对于组件来说我们不能仅仅将组件所渲染的内容移除就算大功告成，我们还有另外一件事需要做，即调用 `unmounted` 钩子，所以我们为 `replaceVNode` 函数添加如下代码：

```js {3-8}
function replaceVNode(prevVNode, nextVNode, container) {
  container.removeChild(prevVNode.el)
  // 如果将要被移除的 VNode 类型是组件，则需要调用该组件实例的 unmounted 钩子函数
  if (prevVNode.flags & VNodeFlags.COMPONENT_STATEFUL_NORMAL) {
    // 类型为有状态组件的 VNode，其 children 属性被用来存储组件实例对象
    const instance = prevVNode.children
    instance.unmounted && instance.unmounted()
  }
  mount(nextVNode, container)
}
```

如上高亮代码所示，如果将要被移除的 `prevVNode` 的类型是有状态组件，则需要调用该组件实例的 `unmounted` 钩子函数。这里是完整的代码以及在线体验地址：[https://codesandbox.io/s/ll92yq0o2l](https://codesandbox.io/s/ll92yq0o2l)。

### 我们需要 shouldUpdateComponent

【占位】

## 函数式组件的更新

接下来我们要讨论的是函数式组件的更新，其实无论是有状态组件还是函数式组件，它们的更新原理都是一样的：用组件新产出的 `VNode` 与之前产出的旧 `VNode` 进行比对，从而完成更新。为了让讲解不至于太抽象，我们还是拿一个具体的例子来说，如下代码所示：

```js
// 子组件 - 函数式组件
function MyFunctionalComp(props) {
  return h('div', null, props.text)
}
// 父组件的 render 函数中渲染了 MyFunctionalComp 子组件
class ParentComponent {
  localState = 'one'

  mounted() {
    setTimeout(() => {
      this.localState = 'two'
      this._update()
    }, 2000)
  }

  render() {
    return h(MyFunctionalComp, {
      text: this.localState
    })
  }
}

// 有状态组件 VNode
const compVNode = h(ParentComponent)
render(compVNode, document.getElementById('app'))
```

观察上面的代码，我们定义了 `ParentComponent` 组件，它是一个有状态组件，在它的 `render` 函数中渲染了 `MyFunctionalComp` 子组件，这个子组件是一个函数式组件。观察 `MyFunctionalComp` 函数的参数，由于函数式组件没有组件实例，所以在函数式组件中我们不能通过 `this.$props.xxx` 访问 `props` 数据，`props` 数据是作为函数的参数传递进去的，如下是我们之前实现的 `mountFunctionalComponent` 函数：

```js
function mountFunctionalComponent(vnode, container, isSVG) {
  // 获取 VNode
  const $vnode = vnode.tag()
  // 挂载
  mount($vnode, container, isSVG)
  // el 元素引用该组件的根元素
  vnode.el = $vnode.el
}
```

为了实现函数式组件的 `props` 传递，我们需要修对 `mountFunctionalComponent` 函数做一些修改，如下代码所示：

```js {3,5}
function mountFunctionalComponent(vnode, container, isSVG) {
  // 获取 props
  const props = vnode.data
  // 获取 VNode
  const $vnode = (vnode.children = vnode.tag(props))
  // 挂载
  mount($vnode, container, isSVG)
  // el 元素引用该组件的根元素
  vnode.el = $vnode.el
}
```

如上高亮代码所示，我们在调用组件函数获取 `VNode` 之前，要先获取 `props`，这里我们同样直接将整个 `VNodeData` 作为 `props` 数据，前面我们已经解释了这么做的原因是出于简便。拿到 `props` 数据之后，在调用组件函数 `vnode.tag(props)` 时将 `props` 作为参数传递过去，这样子组件就可以通过参数访问由父组件传递过来的数据了。另外，我们将组件产出的 `VNode` 赋值给了 `vnode.children` 属性，这里需要做一些说明，通过之前的讲解可知，对于有状态组件类型的 `VNode` 来说，我们使用其 `children` 属性存储组件实例，并在将来会用 `slots` 属性存储插槽数据。同样的，在函数式组件中，由于函数式组件没有组件实例，所以对于函数式组件类型的 `VNode`，我们用其 `children` 属性存储组件产出的 `VNode`，将来也会使用 `slots` 属性存储插槽数据。这个是设计上的决定，并非一定要这么做，但为了与 `Vue3` 的设计保持一致，所以我们就沿用 `Vue3` 的设计。

现在我们已经实现了函数式组件接收 `props` 数据的功能，我们再来观察一下上面的例子，在这个例子中我们为有状态组件 `ParentComponent` 提供了 `mounted` 钩子函数，两秒之后修改自身状态 `localState` 的值，并调用 `_update` 函数重渲染，在重渲染的过程中，`_update` 函数内部发生的事情等价于：

```js
// 旧的 VNode
const prevVNode = h(MyFunctionalComp, {
  text: 'one'
})

// 新的 VNode
const nextVNode = h(MyFunctionalComp, {
  text: 'two'
})

// 更新
patch(prevVNode, nextVNode, prevVNode.el.parentNode)
```

由于 `prevVNode` 和 `nextVNode` 的类型都是组件，所以在 `patch` 函数内部会调用 `patchComponent` 函数更新，我们来回顾一下 `patchComponent` 函数的代码：

```js
function patchComponent(prevVNode, nextVNode, container) {
  if (nextVNode.tag !== prevVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
  } else if (nextVNode.flags & VNodeFlags.COMPONENT_STATEFUL_NORMAL) {
    // 获取组件实例
    const instance = (nextVNode.children = prevVNode.children)
    // 更新 props
    instance.$props = nextVNode.data
    // 更新组件
    instance._update()
  }
}
```

在这段代码中 `if` 语句块内的代码用于处理两个不同组件之间的更新，`else...if` 语句块内的代码用于处理有状态组件的更新，所以`patchComponent` 函数还不能完成函数式组件的更新。为了达到目的，我们需要为 `patchComponent` 函数添加一段代码，用来处理函数式组件类型的 `VNode` 的更新，如下代码所示：

```js {7}
function patchComponent(prevVNode, nextVNode, container) {
  if (nextVNode.tag !== prevVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
  } else if (nextVNode.flags & VNodeFlags.COMPONENT_STATEFUL_NORMAL) {
    // 省略...
  } else {
    // 在这里编写函数式组件的更新逻辑
  }
}
```

如上高亮代码所示，我们只需要为其添加 `else` 语句块即可，我们将在这里编写函数式组件的更新逻辑。但问题是，应该如何更新呢？在本节的开头我们就说过了，无论是有状态组件还是函数式组件，它们的更新原理不变，所以我们可以效仿有状态组件的实现方式。

挂载函数式组件的核心步骤只有两步：1、调用组件的定义函数，拿到组件产出的 `VNode`，2、将 `VNode` 挂载到容器元素。与挂载有状态组件类似，我们可以把这些步骤封装到一个函数中，当组件更新时再次调用这个函数即可。但是，与有状态组件不同，函数式组件没有组件实例，所以我们没办法封装类似 `instance._update` 这样的函数，那应该怎么办呢？很简单，我们把 `update` 函数定义在函数式组件的 `VNode` 上就可以了，如下代码所示：

```js {11}
function mountFunctionalComponent(vnode, container, isSVG) {
  // 在函数式组件类型的 vnode 上添加 handle 属性，它是一个对象
  vnode.handle = {
    prev: null,
    next: vnode,
    container,
    update: () => {
      // 初始化 props
      const props = vnode.data
      // 获取 VNode
      const $vnode = (vnode.children = vnode.tag(props))
      // 挂载
      mount($vnode, container, isSVG)
      // el 元素引用该组件的根元素
      vnode.el = $vnode.el
    }
  }

  // 立即调用 vnode.handle.update 完成初次挂载
  vnode.handle.update()
}
```

这是我们修改后的 `mountFunctionalComponent` 函数，可以看到我们给函数式组件类型的 `VNode` 添加了 `handle` 属性，它是一个拥有四个属性的对象：

```js
vnode.handle = {
  prev: null,
  next: vnode,
  container,
  update() {/*...*/}
}
```

我们把之前用于挂载函数式组件的代码移动到了 `vnode.handle.update` 函数中，所以在 `mountFunctionalComponent` 函数的最后立即调用了 `vnode.handle.update` 函数，这样能够保证原始功能不变。`handle` 对象除了 `update` 方法之外还有其他三个属性，它们的作用分别是：

- `handle.prev`：存储旧的函数式组件 `VNode`，在初次挂载时，没有旧的 `VNode` 可言，所以初始值为 `null`。
- `handle.next`：存储新的函数式组件 `VNode`，在初次挂载时，被赋值为当前正在挂载的函数式组件 `VNode`。
- `handle.container`：存储的是挂载容器

现在已经有了 `handle.update` 函数，我们可以尝试在 `patchComponent` 函数内部通过调用 `handle.update` 函数完成函数式组件的更新，如下代码所示：

```js {7-16}
function patchComponent(prevVNode, nextVNode, container) {
  if (nextVNode.tag !== prevVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
  } else if (nextVNode.flags & VNodeFlags.COMPONENT_STATEFUL_NORMAL) {
    // 省略...
  } else {
    // 更新函数式组件
    // 通过 prevVNode.handle 拿到 handle 对象
    const handle = (nextVNode.handle = prevVNode.handle)
    // 更新 handle 对象
    handle.prev = prevVNode
    handle.next = nextVNode
    handle.container = container

    // 调用 update 函数完成更新
    handle.update()
  }
}
```

如上高亮代码所示，我们首先通过旧的 `VNode(prevVNode)` 拿到 `handle` 对象，接着我们更新了 `handle` 对象下各个属性的值：

- 1、将旧的函数式组件 `VNode(prevVNode)` 赋值给 `handle.prev`。
- 2、将新的函数式组件 `VNode(nextVNode)` 赋值给 `handle.next`。
- 3、更新 `container`（即使 `container` 未必会变，但仍要更新之）。

最后我们调用了 `handle.update` 函数完成更新操作。我们再详细地了解一下在这个过程中发生了什么，在函数式组件初次挂载完成后 `handle` 对象的值为：

```js
handle = {
  prev: null,
  next: prevVNode,
  container,
  update() {/* ... */}
}
```

在经过 `patchComponent` 函数对 `handle` 对象进行更新之后，`handle` 对象的值将变为：

```js
handle = {
  prev: prevVNode,
  next: nextVNode,
  container,
  update() {/* ... */}
}
```

可以看到此时的 `handle.prev` 属性已经非空了，`prev` 和 `next` 属性分别存储的是旧的和新的函数式组件类型的 `VNode`。这个更新的动作很关键。在更新完成之后，立即调用了 `handle.update` 函数进行重渲染，如下是目前我们所实现的 `handle.update` 函数：

```js {7-16}
function mountFunctionalComponent(vnode, container, isSVG) {
  // 在函数式组件类型的 vnode 上添加 handle 属性，它是一个对象
  vnode.handle = {
    prev: null,
    next: vnode,
    container,
    update: () => {
      // 初始化 props
      const props = vnode.data
      // 获取 VNode
      const $vnode = (vnode.children = vnode.tag(props))
      // 挂载
      mount($vnode, container, isSVG)
      // el 元素引用该组件的根元素
      vnode.el = $vnode.el
    }
  }

  // 立即调用 vnode.handle.update 完成初次挂载
  vnode.handle.update()
}
```

如上高亮代码所示，现在的 `update` 函数只能完成初次挂载的工作，当再次调用 `update` 函数进行更新时，我们是不能再次执行这段用于挂载的代码的，就像有状态组件的 `instance.update` 函数的实现一样，我们需要为 `handle.update` 函数添加更新逻辑，如下代码所示：

```js {7-18}
function mountFunctionalComponent(vnode, container, isSVG) {
  vnode.handle = {
    prev: null,
    next: vnode,
    container,
    update: () => {
      if (vnode.handle.prev) {
        // 更新的逻辑写在这里
      } else {
        // 获取 props
        const props = vnode.data
        // 获取 VNode
        const $vnode = (vnode.children = vnode.tag(props))
        // 挂载
        mount($vnode, container, isSVG)
        // el 元素引用该组件的根元素
        vnode.el = $vnode.el
      }
    }
  }

  // 立即调用 vnode.handle.update 完成初次挂载
  vnode.handle.update()
}
```

在上面的代码中，我们通过判断 `vnode.handle.prev` 是否存在来判断该函数式组件是初次挂载还是后续更新，由于在 `patchComponent` 函数内我们已经将 `vnode.handle.prev` 属性赋值为旧的组件 `VNode`，所以如果 `vnode.handle.prev` 存在则说明该函数式组件并非初次挂载，而是更新，所以我们会在 `if` 语句块内编写更新逻辑，而用于初次挂载的代码被我们放到了 `else` 语句块中。

那么更新的思路是什么呢？前面说过了，只要想办法分别拿到组件产出的新旧 `VNode` 即可，这样我们就可以通过 `patch` 函数更新之。如下代码所示：

```js {9-19}
function mountFunctionalComponent(vnode, container, isSVG) {
  vnode.handle = {
    prev: null,
    next: vnode,
    container,
    update: () => {
      if (vnode.handle.prev) {
        // 更新
        // prevVNode 是旧的组件VNode，nextVNode 是新的组件VNode
        const prevVNode = vnode.handle.prev
        const nextVNode = vnode.handle.next
        // prevTree 是组件产出的旧的 VNode
        const prevTree = prevVNode.children
        // 更新 props 数据
        const props = nextVNode.data
        // nextTree 是组件产出的新的 VNode
        const nextTree = (nextVNode.children = nextVNode.tag(props))
        // 调用 patch 函数更新
        patch(prevTree, nextTree, vnode.handle.container)
      } else {
        // 省略...
      }
    }
  }

  // 立即调用 vnode.handle.update 完成初次挂载
  vnode.handle.update()
}
```

如上高亮代码所示，由于我们在 `patchComponent` 函数内已经更新过了 `handle` 对象，所以此时我们可以通过 `vnode.handle.prev` 和 `vnode.handle.next` 分别拿到旧的组件 `VNode` 和新的组件 `VNode`，但大家不要搞混的是：`prevVNode` 和 `nextVNode` 是用来描述函数式组件的 `VNode`，并非函数式组件所产出的 `VNode`。因为函数式组件所产出的 `VNode` 存放在用来描述函数式组件的 `VNode` 的 `children` 属性中，所以在如上代码中我们通过 `prevVNode.children` 拿到了组件所产出的旧的 `VNode` 即 `prevTree`，接着使用新的 `props` 重新调用组件函数 `nextVNode.tag(props)` 得到新产出的 `VNode` 即 `nextTree`，有了 `prevTree` 和 `nextTree` 之后我们就可以调用 `patch` 函数执行更新操作了。

以上就是函数式组件的更新过程。

:::tip
完整代码&在线体验地址：[https://codesandbox.io/s/5yz63qqx7p](https://codesandbox.io/s/5yz63qqx7p)
:::
