# 句法分析 - 生成真正的AST

在上一章中，我们讲解了解析 `html` 字符串时词法分析的方式，本章我们将再进一步，讲解 `Vue` 是如何在词法分析的基础上构建抽象语法树(`AST`)的，即句法分析。

打开 `src/compiler/index.js` 文件，注意如下高亮的那句代码：

```js {5}
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

可以看到 `parse` 函数的返回值就是抽象语法树(`AST`)，根据文件头部的引用关系可知 `parse` 函数来自于 `src/compiler/parser/index.js` 文件，实际上该文件所有的内容都在做一件事，即创建 `AST`。

本章的讲解目标就是 `src/compiler/parser/index.js` 文件，不过具体到源码之前，我们有必要独立思考一下如何根据词法分析创建一个抽象语法树。

## 根据令牌生成AST的思路

在上一节的末尾我们讲解了 `parseHTML` 函数的使用，该函数接收一些选项参数，其中包括几个重要的钩子函数，如每当遇到一个开始标签时会调用的 `options.start` 钩子函数，每当遇到一个结束标签时会调用的 `options.end` 钩子函数等等。实际上一颗抽象语法树的构建最关键的就是这两个钩子函数，接下来我们简单讲解一下构建抽象语法树的思路。

假设我们有一段 `html` 字符串，如下：

```html
<ul>
  <li>
    <span>文本</span>
  </li>
</ul>
```

那么最终生成的这颗树应该是与如上 `html` 字符串的结构一一对应的：

```sh
├── ul
│   ├── li
│   │   ├── span
│   │   │   ├── 文本
```

如果每一个节点我们都用一个 `javascript` 对象来表示的话，那么 `ul` 标签可以表示为如下对象：

```js
{
  type: 1,
  tag: 'ul'
}
```

由于每个节点都存在一个父节点和若干子节点，所以我们为如上对象添加两个属性：`parent` 和 `children`，分别用来表示当前节点的父节点和它所包含的子节点：

```js
{
  type: 1,
  tag: 'ul',
  parent: null,
  children: []
}
```

同时每个元素节点还可能包含很多属性(`attributes`)，所以我们可以为每个节点添加 `attrsList` 属性，用来存储当前节点所拥有的属性：

```js
{
  type: 1,
  tag: 'ul',
  parent: null,
  children: [],
  attrsList: []
}
```

按照以上思路，实际上你可以为节点的描述对象添加任何你需要的属性，从而进一步描述该节点的特征。如果使用如上这个对象描述之前定义的 `html` 字符串，那么这颗抽象语法树应该长成如下这个样子：

```js
{
  type: 1,
  tag: 'ul',
  parent: null,
  attrsList: [],
  children: [
    {
      type: 1,
      tag: 'li',
      parent: ul,
      attrsList: [],
      children: [
        {
          type: 1,
          tag: 'span',
          parent: li,
          attrsList: [],
          children: [
            {
              type: 2,
              tag: '',
              parent: span,
              attrsList: [],
              text: '文本'
            }
          ]
        }
      ]
    }
  ]
}
```

实际上构建抽象语法树的工作就是创建一个类似如上所示的一个能够描述节点关系的对象树，节点与节点之间通过 `parent` 和 `children` 建立联系，每个节点的 `type` 属性用来标识该节点的类别，比如 `type` 为 `1` 代表该节点为元素节点，`type` 为 `2` 代表该节点为文本节点，这只是人为的一个规定，你可以用任何方便的方式加以区分。

明白了我们的目标，下面我们在回到 `parseHTML` 函数，因为目前为止我们所拥有的只有这一个函数，我们需要使用该函数构建出一颗如上所述的描述对象。

首先我们需要定义一个 `parse` 函数，假设该函数就是用来把 `html` 字符串生成 `AST` 的，如下：

```js
function parse (html) {
  let root
  //...
  return root
}
```

如上代码所示，我们在 `parse` 函数内定义了变量 `root` 并将其返回，其中 `root` 所代表的就是整个 `AST`，`parse` 函数体中间的所有代码都是为了充实 `root` 变量。怎么充实呢？这是我们需要借助 `parseHTML` 函数帮助我们解析 `html` 字符串，如下：

```js
function parse (html) {
  let root
  
  parseHTML(html, {
    start (tag, attrs, unary) {
      // 省略...
    },
    end () {
      // 省略...
    }
  })
  
  return root
}
```

我们从简出发，假设我们要解析的 `html` 字符串如下：

```html
<div></div>
```

这段 `html` 字符串仅仅是一个简单的 `div` 标签，甚至没有任何子节点。若要解析如上标签我们可以编写如下代码：

```js {6-14}
function parse (html) {
  let root
  
  parseHTML(html, {
    start (tag, attrs, unary) {
      const element = {
        type: 1,
        tag: tag,
        parent: null,
        attrsList: attrs,
        children: []
      }

      if (!root) root = element
    },
    end () {
      // 省略...
    }
  })
  
  return root
}
```

如上高亮代码所示，在 `start` 钩子函数中首先定义了 `element` 常量，它就是元素节点的描述对象，接着判断 `root` 是否存在，如果不存在则直接将 `element` 赋值给 `root`。这段代码对于解析 `'<div></div>'` 这段 `html` 字符串来说已经足够了，当解析这段 `html` 字符串时首先会遇到 `div` 元素的开始标签，此时 `start` 钩子函数将被调用，最终 `root` 变量将被设置为：

```js
root = {
  type: 1,
  tag: 'div',
  parent: null,
  attrsList: [],
  children: []
}
```

但是当解析的 `html` 字符串稍微复杂一点的时候，这段用来解析的代码就不能正常使用了，比如对于如下这段 `html` 字符串：

```html
<div>
  <span></span>
</div>
```

这段 `html` 字符串比之前的 `html` 字符串的不同之处在于 `div` 标签多了一个子节点，即多了一个 `span` 标签。如果继续沿用之前的解析代码，当解析如上 `html` 字符串时首先会遇到 `div` 元素的开始标签，此时 `start` 钩子函数被调用，`root` 变量被设置为：

```js
root = {
  type: 1,
  tag: 'div',
  parent: null,
  attrsList: [],
  children: []
}
```

接着会遇到 `span` 元素的开始标签，会再次调用 `start` 钩子函数，由于此时 `root` 变量已经存在，所以不会再次设置 `root` 变量。为了能够更好的解析 `span` 标签，我们需要对之前的解析代码做一些改变，如下：

```js {3,10,15-20}
function parse (html) {
  let root
  let currentParent
  
  parseHTML(html, {
    start (tag, attrs, unary) {
      const element = {
        type: 1,
        tag: tag,
        parent: currentParent,
        attrsList: attrs,
        children: []
      }

      if (!root) {
        root = element
      } else if (currentParent) {
        currentParent.children.push(element)
      }
      if (!unary) currentParent = element
    },
    end () {
      // 省略...
    }
  })
  
  return root
}
```

如上代码所示，首先我们需要定义 `currentParent` 变量，它的作用是每遇到一个非一元标签，都会将该标签的描述对象作为 `currentParent` 的值，这样当解析该非一元标签的子节点时，子节点的父级就是 `currentParent` 变量。另外在 `start` 钩子函数内部我们在创建 `element` 描述对象时我们使用 `currentParent` 的值作为每个元素描述对象的 `parent` 属性的值。

如果用以上代码解析如下 `html` 字符串：

```html
<div>
  <span></span>
</div>
```

那么其过程大概是这样的：首先会遇到 `div` 元素的开始标签，此时由于 `root` 不存在，并且 `currentParent` 也不存在，所以会创建一个用于描述该 `div` 元素的对象，并设置 `root` 的值如下：

```js
root = {
  type: 1,
  tag: 'div',
  parent: undefined,
  attrsList: [],
  children: []
}
```

还没完，由于 `div` 元素是非一元标签，我们可以看到在 `start` 钩子函数的末尾有一个 `if` 条件语句，当一个元素为非一元标签时，会设置 `currentParent` 为该元素的描述对象，所以此时 `currentParent` 也是：

```js
currentParent = {
  type: 1,
  tag: 'div',
  parent: undefined,
  attrsList: [],
  children: []
}
```

接着解析这段 `html` 字符串，会遇到 `span` 元素开始的开始标签，由于此时 `root` 已经存在，所以 `start` 钩子函数会执行 `else...if` 条件的判断，检查 `currentParent` 是否存在，由于 `currentParent` 存在，所以会将 `span` 元素的描述对象添加到 `currentParent` 的 `children` 数组中作为子节点，所以最终生成的 `root` 描述对象为：

```js
root = {
  type: 1,
  tag: 'div',
  parent: undefined,
  attrsList: [],
  children: [{
    {
      type: 1,
      tag: 'span',
      parent: div,
      attrsList: [],
      children: []
    }
  }]
}
```

到现在为了，我们解析逻辑看上去可以用了，但实际上还是存在问题的，假设我们要解析 `html` 字符串再稍微复杂一点，如下：

```html
<div>
  <span></span>
  <p></p>
</div>
```

在之前的基础上 `div` 元素的子节点多了一个 `p` 标签，按照现有的解析逻辑在解析这段 `html` 字符串时，首先会遇到 `div` 元素的开始标签，此时 `root` 和 `currentParent` 将被设置为 `div` 标签的描述对象。接着会遇到 `span` 元素的开始标签，此时 `span` 标签的描述对象将被添加到 `div` 标签描述对象的 `children` 数组中，同时别忘了 `span` 元素也是非一元标签，所以 `currentParent` 变量会被设置为 `span` 标签的描述对象。接着继续解析，会遇到 `span` 元素的结束标签，由于 `end` 钩子函数什么都没做，直接跳过。再继续解析将遇到 `p` 元素的开始标签，大家注意，**在解析 `p` 元素的开始标签时，由于 `currentParent` 变量引用的是 `span` 元素的描述对象，所以 `p` 元素的描述对象将被添加到 `span` 元素描述对象的 `children` 数组中，被误认为是 `span` 元素的子节点**。而事实上 `p` 标签是 `div` 元素的字节点，这就是问题所在。

为了解决这个问题，我们需要每当遇到一个非一元标签的结束标签时，都将 `currentParent` 变量的值回退到之前的元素描述对象，这样就能够保证当前正在解析的标签拥有正确的父级。当时如何回退呢？若要回退之前的值，那么必然需要一个变量保存之前的值，所以我们需要一个数组 `stack`，如下代码所示：

```js {4,23,26-29}
function parse (html) {
  let root
  let currentParent
  const stack = []
  
  parseHTML(html, {
    start (tag, attrs, unary) {
      const element = {
        type: 1,
        tag: tag,
        parent: currentParent,
        attrsList: attrs,
        children: []
      }

      if (!root) {
        root = element
      } else if (currentParent) {
        currentParent.children.push(element)
      }
      if (!unary) {
        currentParent = element
        stack.push(currentParent)
      }
    },
    end () {
      stack.pop()
      currentParent = stack[stack.length - 1]
    }
  })
  
  return root
}
```

如上高亮代码所示，首先我们定义了 `stack` 常量，它是一个数组，接着我们做了一些修改，每次遇到非一元开始标签的时候，除了设置 `currentParent` 的值之外，还会将 `currentParent` 添加到 `stack` 数组。接着我们在 `end` 钩子函数中添加了一句代码，也就是说每当遇到一个非一元标签的结束标签时，都会回退 `currentParent` 变量的值为之前的值，这样我们就修正了当前正在解析的元素的父级元素。

以上就是根据 `parseHTML` 函数生成 `AST` 的基本方式，实际上我们还考虑的还不够周全，比如上面的讲解中我们没有处理一元标签，另外我们还需要处理文本节点和注释节点等等。不过上面的讲解很好的为我们后续对源码的解析做了铺垫，更详细的内容我们将在接下来的源码分析阶段为大家仔细说明。

## 解析前的准备工作

前面说过，整个 `src/compiler/parser/index.js` 文件的所做的工作都是在创建 `AST`，所以我们应该先了解一下这个文件的结构，以方便后续的理解。在该文件的开头定义了一些常量和变量，其中包括一些正则常量，我们后续会详细讲解。

接着定义了 `createASTElement` 函数，如下：

```js
export function createASTElement (
  tag: string,
  attrs: Array<Attr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    parent,
    children: []
  }
}
```

`createASTElement` 函数用来创建一个元素的描述对象，这样我们在创建元素描述对象时就不需要手动编写对象字面量了，方便的同时还能提高代码整洁性。

再往下定义了整个文件最重要的一个函数，即 `parse` 函数，它的结构如下：

```js
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  /*
   * 省略...
   * 省略的代码用来初始化一些变量的值，以及创建一些新的变量，其中包括 root 变量，该变量为 parse 函数的返回值，即 AST
   */
  
  function warnOnce (msg) {
    // 省略...
  }

  function closeElement (element) {
    // 省略...
  }

  parseHTML(template, {
    // 其他选项...
    start (tag, attrs, unary, start, end) {
      // 省略...
    },

    end (tag, start, end) {
      // 省略...
    },

    chars (text: string) {
      // 省略...
    },
    comment (text: string) {
      // 省略...
    }
  })
  return root
}
```

通过如上代码的简化，我们可以清晰的看到 `parse` 函数的结构，在 `parse` 函数开头代码用来初始化一些变量的值，以及创建一些新的变量，其中包括 `root` 变量，该变量为 `parse` 函数的返回值，即最终的 `AST`。然后定义了两个函数 `warnOnce` 和 `closeElement`。接着调用了 `parseHTML` 函数，通过上一小节的铺垫，相信大家看到这里已经大概知道了 `parse` 函数是如何创建 `AST` 的了。另外我们能够注意到在调用 `parseHTML` 函数时传递了很多选项，其中包括四个重要的钩子函数选项：`start`、`end`、`chars` 以及 `comment`。最后 `parse` 函数将 `root` 变量返回，也就是最终生成的 `AST`。

在 `parse` 函数的后面，定义了非常多的函数，如下：

```js
function processPre (el) {/* 省略...*/}
function processRawAttrs (el) {/* 省略...*/}
export function processElement (element: ASTElement, options: CompilerOptions) {/* 省略...*/}
function processKey (el) {/* 省略...*/}
function processRef (el) {/* 省略...*/}
export function processFor (el: ASTElement) {/* 省略...*/}
export function parseFor (exp: string): ?ForParseResult {/* 省略...*/}
function processIf (el) {/* 省略...*/}
function processIfConditions (el, parent) {/* 省略...*/}
function findPrevElement (children: Array<any>): ASTElement | void {/* 省略...*/}
export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {/* 省略...*/}
function processOnce (el) {/* 省略...*/}
function processSlot (el) {/* 省略...*/}
function processComponent (el) {/* 省略...*/}
function processAttrs (el) {/* 省略...*/}
function checkInFor (el: ASTElement): boolean {/* 省略...*/}
function parseModifiers (name: string): Object | void {/* 省略...*/}
function makeAttrsMap (attrs: Array<Object>): Object {/* 省略...*/}
function isTextTag (el): boolean {/* 省略...*/}
function isForbiddenTag (el): boolean {/* 省略...*/}
function guardIESVGBug (attrs) {/* 省略...*/}
function checkForAliasModel (el, value) {/* 省略...*/}
```

我们能够发现这些函数的名字大部分都以 `process` 开头，并且接收的参数中基本都包含 `el`，那么 `el` 是什么呢？实际上 `el` 就是元素的描述对象，如下：

```js
el = {
  type: 1,
  tag,
  attrsList: attrs,
  attrsMap: makeAttrsMap(attrs),
  parent,
  children: []
}
```

那么 `process*` 类的函数接收 `el` 参数后都做了什么呢？实际上 `process*` 类函数的作用就是对元素描述对象的进一步处理，比如其中一个函数叫做 `processPre`，这个函数的作用就是用来检测 `el` 元素是否拥有 `v-pre` 属性，如果有 `v-pre` 属性则会在 `el` 描述对象上添加一个 `pre` 属性，如下：

```js {8}
el = {
  type: 1,
  tag,
  attrsList: attrs,
  attrsMap: makeAttrsMap(attrs),
  parent,
  children: [],
  pre: true
}
```

类似的，所有 `process*` 类函数的作用都是为了让一个元素的描述对象更加充实，使这个对象能更加详细地描述一个元素，并且这些函数都会用在 `parseHTML` 函数的钩子选项函数中。

另外我们也能看到很多非 `process*` 类的函数，例如 `findPrevElement`、`makeAttrsMap` 等等，这些函数实际上就是工具函数。

以上就是 `src/compiler/parser/index.js` 文件的整体结构。接下来我们将重新回到该文件的开头部分，来看看都定义了哪些常量或变量。

### 正则常量分析

#### 正则常量 onRE

接下来我们将讲解定义在该文件中的一系列常量，首先要讲解的 `onRE` 正则常量，其源码如下：

```js
export const onRE = /^@|^v-on:/
```

这个常量用来匹配以字符 `@` 或 `v-on:` 开头的字符串，主要作用是检测标签属性名是否是监听事件的指令。

#### 正则常量 dirRE

正则常量 `dirRE` 源码如下：

```js
export const dirRE = /^v-|^@|^:/
```

它用来匹配以字符 `v-` 或 `@` 或 `:` 开头的字符串，主要作用是检测标签属性名是否是指令。所以通过这个正则我们可以知道，在 `vue` 中所以 `v-` 开头的属性都被认为是指令，另外 `@` 字符是 `v-on` 的缩写，`:` 字符是 `v-bind` 的缩写。

#### 正则常量 forAliasRE

其源码如下：

```js
export const forAliasRE = /([^]*?)\s+(?:in|of)\s+([^]*)/
```

该正则包含三个分组，第一个分组为 `([^]*?)`，该分组是一个惰性匹配的分组，它匹配的内容为任何字符，包括换行符等。第二个分组为 `(?:in|of)`，该分组用来匹配字符串 `in` 或者 `of`，并且该分组是非捕获的分组。第三个分组为 `([^]*)`，与第一个分组类似，不同的是第三个分组是非惰性匹配。同时每个分组之间都会匹配至少一个空白符 `\s+`。通过以上说明可知，正则 `forAliasRE` 用来匹配 `v-for` 属性的值，并捕获 `in` 或 `of` 前后的字符串。假设我们像如下这样使用 `v-for`：

```html
<div v-for="obj of list"></div>
```

那么正则 `forAliasRE` 用来匹配字符串 `'obj of list'`，并捕获到两个字符串 `'obj'` 和 `'list'`。

#### 正则常量 forIteratorRE

源码如下：

```js
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
```

该正则用来匹配 `forAliasRE` 第一个捕获组所捕获到的字符串，可以看到如上正则中拥有三个分组，有两个捕获的分组，第一个捕获组用来捕获一个不包含字符 `}` 和 `]` 的字符串，且该字符串前面有一个字符 `,`，如：`', index'`。第二个分组为非捕获的分组，第三个分组为捕获的分组，其捕获的内容与第一个捕获组相同。

举几个例子，我们知道 `v-for` 有几种不同的写法，其中一种使用 `v-for` 的方式是：

```js
<div v-for="obj of list"></div>
```

如果像如上这样使用 `v-for`，那么 `forAliasRE` 正则的第一个捕获组的内容为字符串 `'obj'`，此时使用 `forIteratorRE` 正则去匹配字符串 `'obj'` 将得不到任何内容。

第二种使用 `v-for` 的方式为：

```js
<div v-for="(obj, index) of list"></div>
```

此时 `forAliasRE` 正则的第一个捕获组的内容为字符串 `'(obj, index)'`，如果去掉左右括号则该字符串为 `'obj, index'`，如果使用 `forIteratorRE` 正则去匹配字符串 `'obj, index'` 则会匹配成功，并且 `forIteratorRE` 正则的第一个捕获组将捕获到字符串 `'index'`，但第二个捕获组捕获不到任何内容。

第三种使用 `v-for` 的方式为：

```js
<div v-for="(value, key, index) in object"></div>
```

以上方式主要用于遍历对象而非数组，此时 `forAliasRE` 正则的第一个捕获组的内容为字符串 `'(value, key, index)'`，如果去掉左右括号则该字符串为 `'value, key, index'`，如果使用 `forIteratorRE` 正则去匹配字符串 `'value, key, index'` 则会匹配成功，并且 `forIteratorRE` 正则的第一个捕获组将捕获到字符串 `'key'`，但第二个捕获组将捕获到字符串 `'index'`。

#### 正则常量 stripParensRE

源码如下：

```js
const stripParensRE = /^\(|\)$/g
```

这个捕获组用来捕获要么以字符 `(` 开头，要么以字符 `)` 结尾的字符串，或者两者都满足。那么这个正则的作用是什么呢？我们在讲解正则 `forIteratorRE` 时有个细节不知道大家注意到了没有，就是 `forIteratorRE` 正则所匹配的字符串是 `'obj, index'`，而不是 `'(obj, index)'`，这两个字符串的区别就在于第二个字符串拥有左右括号，所以在使用 `forIteratorRE` 正则之前，需要使用 `stripParensRE` 正则去掉字符串 `'(obj, index)'` 中的左右括号，实现方式很简单：

```js
'(obj, index)'.replace(stripParensRE, '')
```

#### 正则常量 argRE

源码如下：

```js
const argRE = /:(.*)$/
```

正则 `argRE` 用来匹配指令中的参数，如下：

```html
<div v-on:click.stop="handleClick"></div>
```

其中 `v-on` 为指令，`click` 为传递给 `v-on` 指令的参数，`stop` 为修饰符。所以 `argRE` 正则用来匹配指令编写中的参数，并且拥有一个捕获组，用来捕获参数的名字。

#### 正则常量 bindRE

源码如下：

```js
export const bindRE = /^:|^v-bind:/
```

该正则用来匹配以字符 `:` 或字符串 `v-bind:` 开头的字符串，主要用来检测一个标签的属性是否是绑定(`v-bind`)。

#### 正则常量 modifierRE

源码如下：

```js
const modifierRE = /\.[^.]+/g
```

该正则用来匹配修饰符的，但是并没有捕获任何东西，举例如下：

```js
const matchs = 'v-on:click.stop'.match(modifierRE)
```

那么 `matchs` 数组第一个元素为字符串 `'.stop'`，所以指令修饰符应该是：

```js
matchs[0].slice(1)  // 'stop'
```

### HTML 实体解码函数 decodeHTMLCached

源码如下：

```js
const decodeHTMLCached = cached(he.decode)
```

`cached` 函数我们前面遇到过，它的作用是接收一个函数作为参数并返回一个新的函数，新函数的功能与作为参数传递的函数功能相同，唯一不同的是多了新函数将会缓存值，如果一个函数在接收相同参数的情况下所返回的值总是相同的，那么 `cached` 函数将会为该函数提供性能提升的优势。

可以看到传递给 `cached` 函数的参数是 `he.decode` 函数，其中 `he` 为第三方的库，`he.decode` 函数用于 `HTML` 字符实体的解码工作，如：

```js
console.log(he.decode('&#x26;'))  // &#x26; -> '&'
```

由于字符实体 `&#x26;` 代表的字符为 `&`。所以字符串 `&#x26;` 经过解码后将变为字符 `&`。`decodeHTMLCached` 函数在后面将被用于对纯文本的解码，如果不进行解码，那么用户将无法使用字符实体编写字符。

### 定义平台化选项变量

再往下，定义了一些平台化的选项变量，如下：

```js
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
```

上面的代码中定义了 `8` 个平台化的变量，为什么说上面这些变量为平台化的选项变量呢？后面当我们讲解 `parse` 函数时，我们能够看到这些变量将被初始化一个值，这些值都是平台化的编译器选项参数，不同平台这些变量将被初始化的值是不同的。我们可以找到 `parse` 函数看一下：

```js
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no

  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  // 省略...
}
```

如上代码所示，可以清晰的看到在 `parse` 函数的一开始为这 `8` 个平台化的变量进行了初始化，初始化的值都是我们曾经讲过的编译器的选项参数，由于我们前面所讲解的都是 `web` 平台下的编译器选项，所以这里初始化的值都只用于 `web` 平台。

### createASTElement 函数

在平台化变量的后面，定义了 `createASTElement` 函数，这个函数的作用就是方便我们创建一个节点，或者说方便我们创建一个元素的描述对象，如下：

```js
export function createASTElement (
  tag: string,
  attrs: Array<Attr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    parent,
    children: []
  }
}
```

它接收三个参数，分别是标签名字 `tag`，该标签拥有的属性数组 `attrs` 以及该标签的父标签描述对象的引用。比如我们使用 `parseHTML` 解析如下标签时：

```html
<div v-for="obj of list" class="box"></div>
```

当遇 `div` 的开始标签时 `parseHTML` 函数的 `start` 钩子函数的前两个参数分别是：

```js
const html = '<div v-for="obj of list" class="box"></div>'
parseHTML(html, {
  start (tag, attrs) {
    console.log(tag)    // 'div'
    console.log(attrs)  // [ { name: 'v-for', value: 'obj of list' }, { name: 'class', value: 'box' } ]
  }
})
```

此时我们只需要调用 `createASTElement` 函数并将这两个参数传递过去，即可创建该 `div` 标签的描述对象：

```js {6}
const html = '<div v-for="obj of list" class="box"></div>'
parseHTML(html, {
  start (tag, attrs) {
    console.log(tag)    // 'div'
    console.log(attrs)  // [ { name: 'v-for', value: 'obj of list' }, { name: 'class', value: 'box' } ]
    const element = createASTElement(tag, attrs)
  }
})
```

最终创建出来的元素描述对象如下：

```js
element = {
  type: 1,
  tag: 'div',
  attrsList: [
    {
      name: 'v-for',
      value: 'obj of list'
    },
    {
      name: 'class',
      value: 'box'
    }
  ],
  attrsMap: makeAttrsMap(attrs),
  parent,
  children: []
}
```

上面的描述对象中的 `parent` 属性我们没有细说，其实在上一小节我们讲解思路的时候已经接触过 `currentParent` 变量的作用，实际上元素描述对象间的引用关系就是通过 `currentParent` 完成的，后面会仔细讲解。另外我们注意到描述对象中除了 `attrsList` 属性是原始的标签属性数组之后，还有一个叫做 `attrsMap` 属性：

```js {3}
{
  // 省略...
  attrsMap: makeAttrsMap(attrs),
  // 省略...
}
```

这个属性是什么呢？可以看到它的值是 `makeAttrsMap` 函数的返回值，并且 `makeAttrsMap` 函数接收一个参数，该参数恰好是标签的属性数组 `attrs`，此时我们需要查看一下 `makeAttrsMap` 的代码，如下：

```js
function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name)
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}
```

我们首先注意 `makeAttrsMap` 函数的第一句代码和最后一句代码，第一句代码定义了 `map` 常量并在最后一句代码中将其返回，在这两句代码中间是一个 `for` 循环，用于遍历 `attrs` 数组，注意 `for` 循环内有这样一句代码：

```js
map[attrs[i].name] = attrs[i].value
```

也就是说，如果标签的属性数组 `attrs` 为：

```js
attrs = [
  {
    name: 'v-for',
    value: 'obj of list'
  },
  {
    name: 'class',
    value: 'box'
  }
]
```

那么最终生成的 `map` 对象则是：

```js
map = {
  'v-for': 'obj of list',
  'class': 'box'
}
```

所以 `makeAttrsMap` 函数的作用就是将标签的属性数组转换成名值对一一对象的对象。这么做肯定是有目的的，我们后面遇到了再讲，总之最终生成的元素描述对象如下：

```js
element = {
  type: 1,
  tag: 'div',
  attrsList: [
    {
      name: 'v-for',
      value: 'obj of list'
    },
    {
      name: 'class',
      value: 'box'
    }
  ],
  attrsMap: {
    'v-for': 'obj of list',
    'class': 'box'
  },
  parent,
  children: []
}
```

以上就是 `parse` 函数之前定义的所有常量、变量以及函数的讲解，接下来我们将正式进入 `parse` 函数的实现讲解。

### parse 函数创建 AST 前的准备工作

本节我们主要讲解 `parse` 函数的结构以及真正开始解析之前的准备工作，我们知道 `parse` 函数中主要是通过调用 `parseHTML` 函数来辅助完成 `AST` 构建的，但是在调用 `parseHTML` 函数之前还需要做一些准备工作，比如前面提过的在 `parse` 函数的开头为平台化变量赋了值，如下是 `parse` 函数的整体结构：

```js
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no

  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false
  let root
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  function warnOnce (msg) {
    // 省略...
  }

  function closeElement (element) {
    // 省略...
  }

  parseHTML(template, {
    // 省略...
  })
  return root
}
```

我们从上至下一点点来看，首先是如下这段代码：

```js
warn = options.warn || baseWarn

platformIsPreTag = options.isPreTag || no
platformMustUseProp = options.mustUseProp || no
platformGetTagNamespace = options.getTagNamespace || no

transforms = pluckModuleFunction(options.modules, 'transformNode')
preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')
```

前面说过，这段代码为 `8` 个平台化的变量初始化了值，并且这些变量的值基本都来自编译器选项参数。我们在编译器初探一节中讲解 [compile 函数的作用](./80vue-compiler-start.md#compile-的作用) 时附带讲解了编译器各个选项参数都是什么，所以接下来不会深入说明，如果大家忘记了那么可以回头查看。

回过头来继续分析这些平台化的变量，首先是 `warn` 变量的值为 `options.warn` 函数，如果 `options.warn` 选项参数不存在，则会降级使用 `baseWarn` 函数，所以 `warn` 函数作用是用来打印警告信息的，另外 `baseWarn` 函数来自于 `src/compiler/helpers.js` 文件，该文件用来存放一些助手工具函数，我们后面分析 `parse` 函数源码时将会经常看到调用来自该文件的函数。其中 `baseWarn` 函数源码如下：

```js
export function baseWarn (msg: string) {
  console.error(`[Vue compiler]: ${msg}`)
}
```

可以看到 `baseWarn` 函数的作用无非就是通过 `console.error` 函数打印错误信息。

第二个赋值的是 `platformIsPreTag` 变量，如下是它的赋值语句：

```js
platformIsPreTag = options.isPreTag || no
```

可知 `platformIsPreTag` 变量的值为 `options.isPreTag` 函数，该函数是一个编译器选项，其作用是通过给定的标签名字判断该标签是否是 `pre` 标签。另外如上代码所示如果编译器选项中不包含 `options.isPreTag` 函数则会降级使用 `no` 函数，该函数是一个空函数，即什么都不做。

第三个赋值的是 `platformMustUseProp` 变量，如下是它的赋值语句：

```js
platformMustUseProp = options.mustUseProp || no
```

可知 `platformMustUseProp` 变量的值为 `options.mustUseProp` 函数，该函数也是一个编译器选项，其作用是用来检测一个属性在标签中是否要使用元素对象原生的 `prop` 进行绑定，注意：**这里的 `prop` 指的是元素对象的属性，而非 `Vue` 中的 `props` 概念**。同样的如果选项参数中不包含 `options.mustUseProp` 函数则会降级为 `no` 函数。

第四个赋值的是 `platformGetTagNamespace` 变量，如下是它的赋值语句：

```js
platformGetTagNamespace = options.getTagNamespace || no
```

可知 `platformGetTagNamespace` 变量的值为 `options.getTagNamespace` 函数，该函数是一个编译器选项，其作用是用来获取元素(标签)的命名空间。如果选项参数中不包含 `options.getTagNamespace` 函数则会降级为 `no` 函数。

第五个赋值的变量是 `transforms`，如下是它的赋值语句：

```js
transforms = pluckModuleFunction(options.modules, 'transformNode')
```

可以看到 `transforms` 变量的值与前面讲解的变量不同，它是值为 `pluckModuleFunction` 函数的返回值，并以 `options.modules` 选项以及一个字符串 `'transformNode'` 作为参数。

通过前面的分析我们知道 `options.modules` 的值，它是一个数组，如下：

```js
options.modules = [
  {
    staticKeys: ['staticClass'],
    transformNode,
    genData
  },
  {
    staticKeys: ['staticStyle'],
    transformNode,
    genData
  },
  {
    preTransformNode
  }
]
```

为了避免大家遗忘，这里再提一下 `options.modules` 既然是 `web` 平台下的编译器选项参数，它们必然来自 `src/platforms/web/compiler/options.js` 文件，其中 `options.modules` 选项参数的值为来自 `src/platforms/web/compiler/modules/` 目录下几个文件组合而成的。

知道了这些我们就可以具体查看一下 `pluckModuleFunction` 函数的代码，看看它的作用是什么，`pluckModuleFunction` 函数 来自 `src/compiler/helpers.js` 文件，如下是其源码：

```js
export function pluckModuleFunction<F: Function> (
  modules: ?Array<Object>,
  key: string
): Array<F> {
  return modules
    ? modules.map(m => m[key]).filter(_ => _)
    : []
}
```

`pluckModuleFunction` 函数的作用是从第一个参数中"采摘"出函数名字与第二个参数所指定字符串相同的函数，并将它们组成一个数组。拿如下这段代码说明：

```js
transforms = pluckModuleFunction(options.modules, 'transformNode')
```

可知传递给 `pluckModuleFunction` 函数的第二个参数的字符串为 `'transformNode'`，同时我们观察 `options.modules` 数组：

```js {4,9}
options.modules = [
  {
    staticKeys: ['staticClass'],
    transformNode,
    genData
  },
  {
    staticKeys: ['staticStyle'],
    transformNode,
    genData
  },
  {
    preTransformNode
  }
]
```

如上高亮代码所示 `options.modules` 数组的第一个元素与第二个元素都是一个对象，且这两个对象中都包含了 `transformNode` 函数，但是第三个元素对象中没有 `transformNode` 函数。此时按照 `pluckModuleFunction` 函数的逻辑：

```js
return modules
  ? modules.map(m => m[key]).filter(_ => _)
  : []
```

如上代码等价于：

```js
return options.modules
  ? options.modules.map(m => m['transformNode']).filter(_ => _)
  : []
```

我们先看这句代码：

```js
options.modules.map(m => m['transformNode'])
```

这句代码会创建一个新的数组：

```js
[
  transformNode,
  transformNode,
  undefined
]
```

由于 `options.modules` 数组第三个元素对象不包含 `transformNode` 函数，所以生成的数组中第三个元素的值为 `undefined`。这还没完，可以看到紧接着又在新生成的数组之上调用了 `filter` 函数，即：

```js
[
  transformNode,
  transformNode,
  undefined
].filter(_ => _)
```

这么做的结果就是把值为 `undefined` 的元素过滤掉，所以最终生成的数组如下：

```js
[
  transformNode,
  transformNode
]
```

而这个数组就是变量 `transforms` 的值。

第六个赋值的变量是 `preTransforms`，如下是它的赋值语句：

```js
preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
```

与 `transforms` 变量的赋值语句如出一辙，同样是使用 `pluckModuleFunction` 函数，第一个参数同样是 `options.modules`，不同的是第二个参数为字符串 `'preTransformNode'`。也就是此时“采摘”的应该是名字为 `preTransformNode` 的函数，并将它们组装成一个数组。由于 `options.modules` 数组中只有第三个元素对象包含 `preTransformNode` 函数，所以最终 `preTransforms` 变量的值为：

```js
preTransforms = [preTransformNode]
```

第七个赋值的变量是 `postTransforms`，如下是它的赋值语句：

```js
postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')
```

可知此时“采摘”的应该是名字为 `postTransformNode` 的函数，并将它们组装成一个数组。由于 `options.modules` 数组中的三个元素对象都不包含 `postTransformNode` 函数，所以最终 `postTransforms` 变量的值将是一个空数组：

```js
preTransforms = []
```

最后一个赋值的变量为 `delimiters`，如下：

```js
delimiters = options.delimiters
```

它的值为 `options.delimiters` 属性，它的值就是在创建 `Vue` 实例对象所传递的 `delimiters` 选项，它是一个数组。

在如上讲解的八个平台化变量的下面，又定义了一些常量和变量，如下：

```js
const stack = []
const preserveWhitespace = options.preserveWhitespace !== false
let root
let currentParent
let inVPre = false
let inPre = false
let warned = false
```

首先定义的是 `stack` 常量，它的初始值是一个空数组。我们将讲解创建 `AST` 思路的时候也使用到了 `stack` 数组，当时讲到了它的作用是用来修正当前正在解析元素的父级的。在 `stack` 常量之后定义了 `preserveWhitespace` 常量，它是一个布尔值并且它的值与编译器选项中的 `options.preserveWhitespace` 选项有关，只要 `options.preserveWhitespace` 的值不为 `false`，那么 `preserveWhitespace` 的值就为真。其中 `options.preserveWhitespace` 选项用来告诉编译器在编译 `html` 字符串时是否放弃标签之间的空格，如果为 `true` 则代表放弃。

接着定义了 `root` 变量，我们知道 `parse` 函数的返回值就是 `root` 变量，所以 `root` 变量就是最终的 `AST`。在 `root` 变量之后定义了 `currentParent` 变量，我们在讲解创建 `AST` 思路时也定义了一个 `currentParent`，我们知道元素描述对象之间的父子关系就是靠该变量进行联系的。

接着有定义了三个变量，分别是 `inVPre`、`inPre` 以及 `warned`，并且它们的初始值都为 `false`。其中 `inVPre` 变量用来标识当前解析的标签是否在拥有 `v-pre` 标签之内，`inPre` 变量用来标识当前正在解析的标签是否在 `<pre></pre>` 标签之内。而 `warned` 变量则用于接下来定义的 `warnOnce` 函数：

```js
function warnOnce (msg) {
  if (!warned) {
    warned = true
    warn(msg)
  }
}
```

`warned` 变量的初始值为 `false`，通过如上代码可以看到 `warnOnce` 函数同样是用来打印警告信息的函数，只不过 `warnOnce` 函数就如它的名字一样，只会打印一次警告信息，并且 `warnOnce` 函数也是通过调用 `warn` 函数来实现的。

在 `warnOnce` 函数的下面定义了 `closeElement` 函数，如下：

```js
function closeElement (element) {
  // check pre state
  if (element.pre) {
    inVPre = false
  }
  if (platformIsPreTag(element.tag)) {
    inPre = false
  }
  // apply post-transforms
  for (let i = 0; i < postTransforms.length; i++) {
    postTransforms[i](element, options)
  }
}
```

每当遇到一个标签的结束标签时，或遇到一元标签时都会调用该方法“闭合”标签，具体功能我们在后面的内容中详细讲解。

经过了一些列准备，我们终于到了最关键的异步，即调用 `parseHTML` 函数解析模板字符串并借助它来构建一棵 `AST`，如下是调用 `parseHTML` 函数时所传递的选项参数：

```js
parseHTML(template, {
  warn,
  expectHTML: options.expectHTML,
  isUnaryTag: options.isUnaryTag,
  canBeLeftOpenTag: options.canBeLeftOpenTag,
  shouldDecodeNewlines: options.shouldDecodeNewlines,
  shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
  shouldKeepComment: options.comments,
  start (tag, attrs, unary) {
    // 省略...
  },
  end () {
    // 省略...
  },
  chars (text: string) {
    // 省略...
  },
  comment (text: string) {
    // 省略...
  }
})
```

我们在 [词法分析 - 为生成AST做准备](./81vue-lexical-analysis.md) 一章中讲解 `parseHTML` 函数时已经顺带分析了所有选项的作用。其中对于构建 `AST` 来说最关键的选项就是四个钩子函数选项：

* 1、`start` 钩子函数，在解析 `html` 字符串时每次遇到**开始标签**时就会调用该函数
* 2、`end` 钩子函数，在解析 `html` 字符串时每次遇到**结束标签**时就会调用该函数
* 3、`chars` 钩子函数，在解析 `html` 字符串时每次遇到**纯文本**时就会调用该函数
* 4、`comment` 钩子函数，在解析 `html` 字符串时每次遇到**注释节点**时就会调用该函数

下面我们就从 `start` 钩子函数开始说起，为什么从 `start` 钩子函数开始呢？因为正常情况下，解析一段 `html` 字符串时必然最先遇到的就是开始标签。所以我们从 `start` 钩子函数开始讲解，在讲解的过程中为了说明某些问题我们会逐个举例。

### 解析一个开始标签需要做的事情

### 增强的 class
### 增强的 style
### 特殊的 model

## 生成抽象语法树(AST)

## 静态优化

