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

到现在为止，我们解析逻辑看上去可以用了，但实际上还是存在问题的，假设我们要解析 `html` 字符串再稍微复杂一点，如下：

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

当遇到 `div` 的开始标签时 `parseHTML` 函数的 `start` 钩子函数的前两个参数分别是：

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

首先定义的是 `stack` 常量，它的初始值是一个空数组。我们在讲解创建 `AST` 思路的时候也使用到了 `stack` 数组，当时讲到了它的作用是用来修正当前正在解析元素的父级的。在 `stack` 常量之后定义了 `preserveWhitespace` 常量，它是一个布尔值并且它的值与编译器选项中的 `options.preserveWhitespace` 选项有关，只要 `options.preserveWhitespace` 的值不为 `false`，那么 `preserveWhitespace` 的值就为真。其中 `options.preserveWhitespace` 选项用来告诉编译器在编译 `html` 字符串时是否放弃标签之间的空格，如果为 `true` 则代表放弃。

接着定义了 `root` 变量，我们知道 `parse` 函数的返回值就是 `root` 变量，所以 `root` 变量就是最终的 `AST`。在 `root` 变量之后定义了 `currentParent` 变量，我们在讲解创建 `AST` 思路时也定义了一个 `currentParent`，我们知道元素描述对象之间的父子关系就是靠该变量进行联系的。

接着又定义了三个变量，分别是 `inVPre`、`inPre` 以及 `warned`，并且它们的初始值都为 `false`。其中 `inVPre` 变量用来标识当前解析的标签是否在拥有 `v-pre` 标签之内，`inPre` 变量用来标识当前正在解析的标签是否在 `<pre></pre>` 标签之内。而 `warned` 变量则用于接下来定义的 `warnOnce` 函数：

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

经过了一些列准备，我们终于到了最关键的一步，即调用 `parseHTML` 函数解析模板字符串并借助它来构建一棵 `AST`，如下是调用 `parseHTML` 函数时所传递的选项参数：

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

接下来我们就从 `start` 钩子函数开始，研究一下解析一个开始标签都需要做哪些事情，如下是在 `parse` 函数中调用 `parseHTML` 函数时传递的 `start` 钩子函数：

```js
start (tag, attrs, unary) {
  // 省略...
}
```

我们知道 `start` 钩子函数是接收五个参数的，但是如上代码中只使用到了 `start` 钩子函数的前三个参数，也就是说只需要这个三个参数就足够完成任务了。这三个参数分别是标签名字 `tag`，该标签的属性数组 `attrs`，以及代表着该标签是否是一元标签的标识 `unary`。

在 `start` 钩子函数的内部首先执行的是如下这句代码：

```js
const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)
```

为了让大家更好的理解，我们这里规定一些事情，比如既然我们讲解的是 `start` 钩子函数，那么当前的解析必然处于遇到一个开始标签的阶段，我们把当前解析所遇到的开始标签称为：**当前元素**，另外我们把**当前元素**的父标签称为：**父级元素**。

如上这句代码定义了 `ns` 常量，它的值为标签的命名空间，如何获取当前元素的命名空间呢？首先检测 `currentParent` 变量是否存在，我们知道 `currentParent` 变量为当前元素的父级元素描述对象，如果当前元素存在父级并且父级元素存在命名空间，则使用父级的命名空间作为当前元素的命名空间。如果父级元素不存在或父级元素没有命名空间，那么会通过调用 `platformGetTagNamespace(tag)` 函数获取当前元素的命名空间。举个例子，假设我们解析的模板字符串为：

```html
<svg width="100%" height="100%" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="20" width="250" height="250" style="fill:blue;"/>
</svg>
```

如上是用来画一个蓝色矩形的 `svg` 代码，其中我们使用了两个标签：`svg` 标签和 `rect` 标签，当解析如上代码时首先会遇到 `svg` 标签的开始标签，由于 `svg` 标签没有父级元素，所以会通过 `platformGetTagNamespace(tag)` 获取 `svg` 标签的命名空间，最终得到 `svg` 字符串：

```js
platformGetTagNamespace('svg')  // 'svg'
```

下一个遇到的开始标签则是 `rect` 标签的开始标签，由于 `rect` 标签存在父级元素(`svg` 标签)，所以此时 `rect` 标签会使用它父级元素的命名空间作为自己的命名空间。

`platformGetTagNamespace` 函数只会获取 `svg` 和 `math` 这两个标签的命名空间，但这两个标签的所有子标签都会继承它们两个的命名空间。对于其他标签则不存在命名空间。

总之在 `start` 钩子函数内部首先会尝获取一个元素的命名空间，并将获取到的命名空间的名字赋值给 `ns` 常量，这个常量在后面会用到。

再获取命名空间之后，执行的是如下这段 `if` 条件语句块：

```js
if (isIE && ns === 'svg') {
  attrs = guardIESVGBug(attrs)
}
```

[isIE](../appendix/core-util.md#isie) 函数用来判断当前宿主环境是否是 `IE` 浏览器，如果是 `IE` 浏览器并且当前元素的命名空间为 `svg`，则会调用 `guardIESVGBug` 函数处理当前元素的属性数组 `attrs`，并使用处理后的结果重新赋值给 `attrs` 变量。这看上去像是在处理 `IE` 浏览器中关于 `svg` 标签的 `bug`，实际上确实是这样的，大家可以访问 [IE 11 bug](http://osgeo-org.1560.x6.nabble.com/WFS-and-IE-11-td5090636.html) 了解这个问题的详情，该问题是 `svg` 标签中渲染多余的属性，如下 `svg` 标签：

```html
<svg xmlns:feature="http://www.openplans.org/topp"></svg>
```

被渲染为：

```html
<svg xmlns:NS1="" NS1:xmlns:feature="http://www.openplans.org/topp"></svg>
```

标签中多了 `'xmlns:NS1="" NS1:'` 这段字符串，解决办法也很简单，将整个多余的字符串去掉即可。而 `guardIESVGBug` 函数就是用来修改 `NS1:xmlns:feature` 属性并移除 `xmlns:NS1=""` 属性的，如下是 `guardIESVGBug` 函数的源码以及它需要的两个正则：

```js
const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug (attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}
```

在 `guardIESVGBug` 函数之前定义了两个正则常量，其中 `ieNSBug` 正则用来匹配那些以字符串 `xmlns:NS` 再加一个或多个数字组成的字符串开头的属性名，如：

```html
<svg xmlns:NS1=""></svg>
```

如上标签的 `xmlns:NS1` 属性将会被 `ieNSBug` 正则匹配成功。另外一个正则常量是 `ieNSPrefix`，它用来匹配那些以字符串 `NS` 再加一个或多个数字以及字符 `:` 所组成的字符串开头的属性名，如：

```html
<svg NS1:xmlns:feature="http://www.openplans.org/topp"></svg>
```

如上标签的 `NS1:xmlns:feature` 属性将被 `ieNSPrefix` 正则匹配成功。

`guardIESVGBug` 函数接收元素的属性数组作为参数，并返回一个新的数组，新数组与原数组结构相同。可以看到 `guardIESVGBug` 函数内部通过 `for` 循环遍历了元素的属性数组，接着使用正则 `ieNSBug` 去匹配属性名字，可以发现只要不满足 `ieNSBug` 正则的属性名，都会尝试使用 `ieNSPrefix` 正则去匹配该属性名并将匹配到的字符替换为空字符串。如下是渲染产生 `bug` 后的代码：

```html
<svg xmlns:NS1="" NS1:xmlns:feature="http://www.openplans.org/topp"></svg>
```

在解析如上标签时，传递给 `start` 钩子函数的标签属性数组 `attrs` 为：

```js
attrs = [
  {
    name: 'xmlns:NS1',
    value: ''
  },
  {
    name: 'NS1:xmlns:feature',
    value: 'http://www.openplans.org/topp'
  }
]
```

在经过 `guardIESVGBug` 函数处理之后，属性数组中的第一项因为属性名满足 `ieNSBug` 正则被剔除，第二项属性名字 `NS1:xmlns:feature` 将被变为 `xmlns:feature`，所以 `guardIESVGBug` 返回的属性数组为：

```js
attrs = [
  {
    name: 'xmlns:feature',
    value: 'http://www.openplans.org/topp'
  }
]
```

以上就是 `guardIESVGBug` 函数的作用。

处理完 `IE` 的 `SVG` 问题之后，执行的是如下代码：

```js {1}
let element: ASTElement = createASTElement(tag, attrs, currentParent)
if (ns) {
  element.ns = ns
}
```

这段代码是很关键的一段代码，如上高亮的那句代码所示，这句代码的执行为当前元素创建了描述对象，并且元素描述对象的创建是通过我们前面讲过的 `createASTElement` 完成的，并将当前标签的元素描述对象赋值类 `element` 变量。紧接着检查当前元素是否存在命名空间 `ns`，如果存在则在元素对象上添加 `ns` 属性，其值为名称空间的值。

通过如上代码可知，如果当前解析的开始标签为 `svg` 标签或者 `math` 标签或者它们两个的子节点标签，都将会比其他 `html` 标签的元素描述对象多出一个 `ns` 属性，且该属性标识了该标签的命名空间。

在往下是这样一段代码：

```js
if (isForbiddenTag(element) && !isServerRendering()) {
  element.forbidden = true
  process.env.NODE_ENV !== 'production' && warn(
    'Templates should only be responsible for mapping the state to the ' +
    'UI. Avoid placing tags with side-effects in your templates, such as ' +
    `<${tag}>` + ', as they will not be parsed.'
  )
}
```

这段代码是一段 `if` 条件语句块，根据判断条件可知，该 `if` 语句用来判断非服务端渲染情况下，当前元素是否是禁止在模板中使用的标签。其中使用 `isForbiddenTag(element)` 函数检查当前元素是否为被禁止的标签，什么是被禁止的标签呢？`<style>` 标签和 `<script>` 都被认为是禁止的标签，因为 `Vue` 认为模板应该只负责做数据状态到 `UI` 的映射，而不应该存在引起副作用的代码，如果你的模板中存在 `<script>` 标签，那么该标签内的代码很容易引起副作用。但有一种情况例外，比如其中一种定义模板的方式为：

```js
<script type="text/x-template" id="hello-world-template">
  <p>Hello hello hello</p>
</script>
```

把模板放到 `<script>` 元素中，并在 `<script>` 元素上条件 `type="text/x-template"` 属性。可以看到 `Vue` 并非禁止了所有的 `<script>` 元素，这在 `isForbiddenTag` 函数中是有体现的，如下是 `isForbiddenTag` 函数的代码：

```js
function isForbiddenTag (el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}
```

`isForbiddenTag` 函数接收一个元素描述对象作为参数，并返回布尔值，如果返回值为 `true` 则代表该标签是被禁止的，否则为非禁止的。根据源码可知以下标签为被禁止的标签：

* 1、`<style>` 标签为被禁止的标签
* 2、没有指定 `type` 属性或虽然指定了 `type` 属性但其值为 `text/javascript` 的 `<script>` 标签被认为是被禁止的

如果当前标签是被禁止的，并且在非服务端渲染的情况下，会打印警告信息，同时还会在当前元素的描述对象上添加 `el.forbidden` 属性，并将其值设置为 `true`。

我们继续往下看代码，接下来要执行的是如下这段代码：

```js
for (let i = 0; i < preTransforms.length; i++) {
  element = preTransforms[i](element, options) || element
}
```

如上代码中使用 `for` 循环遍历了 `preTransforms` 数组，我们知道 `preTransforms` 是通过 `pluckModuleFunction` 函数从 `options.modules` 选项中筛选出名字为 `preTransformNode` 函数所组成的数组。该数组中每个元素都是一个函数，所以如上代的 `for` 循环内部直接调用了 `preTransforms` 数组中的每一个函数并为这些函数传递了两个参数，分别是当前元素描述对象(`element`)以及编译器选项(`options`)。

这里我们简单的说一下 `preTransforms` 数组中的函数的作用，其实本质上这些函数的作用与我们之前见到过的 `process*` 系列的函数没什么区别，都是用来对当前元素描述对象做进一步处理。不仅仅是 `preTransforms` 数组，对于 `transforms` 数组和 `postTransforms` 数组也是一样的，它们之间的却别就像它们的名字一样，根据不同的调用时机为它们定义了相应的名字。那么为什么把这三个数组中的处理函数与当前文件中 `process*` 系列函数区分开呢？这是出于平台化的考虑，通过前面的分析我们知道 `preTransforms` 数组中的那些 `preTransformNode` 函数来由 `src/platforms/web/compiler/modules` 目录下定义的一些文件定义的，根据目录路径可知这些代码应该是用来处理 `web` 平台相关逻辑的，除了 `web` 平台之外我们也可以看到 `weex` 平台下相应的代码，你在源码中是能够找到这个目录的：`src/platforms/weex/compiler/modules`。

总之你只需要知道 `preTransforms` 数组中的那些函数与 `process*` 系列函数唯一的区别就是平台化的区分即可了。

根据我们前面的分析，实际上 `preTransforms` 数组中只有一个函数，这个函数就是由 `src/platforms/web/compiler/modules/model.js` 文件导出的 `preTransformNode` 函数。大家可以打开该文件查看一下 `preTransformNode` 函数，可以发现该函数内部大量使用了 `process*` 系列的函数，并且该函数只用来处理 `input` 标签，正是由于这一点，所以我们决定暂时不对其进行讲解，因为这会让我们脱离主线。在接下来的讲解中我们会逐个击破 `process*` 系列函数的作用，等大家了解了 `process*` 系列函数所做的事情之后再回头来看 `preTransformNode` 函数的代码会更加容易理解。

那么我们回过头来继续看后面的代码，接下来执行的将是如下这段代码：

```js
if (!inVPre) {
  processPre(element)
  if (element.pre) {
    inVPre = true
  }
}
if (platformIsPreTag(element.tag)) {
  inPre = true
}
if (inVPre) {
  processRawAttrs(element)
} else if (!element.processed) {
  // structural directives
  processFor(element)
  processIf(element)
  processOnce(element)
  // element-scope stuff
  processElement(element, options)
}
```

可以看到这段代码开始大量调用 `process*` 系列的函数，前面说过了，这其实就是在对当前元素描述对象做额外的处理，使得该元素描述对象能更好的描述一个标签。简单点说就是在元素描述对象上添加各种各样的具有标识作用的属性，就比如之前遇到的 `ns` 属性和 `forbidden` 属性，它们都能够对标签起到描述作用。

不过我们本节主要总结**解析一个开始标签需要做的事情**，所以暂时不具体去看上面这些代码的实现。我们继续往下走，接下来定义了一个叫做 `checkRootConstraints` 的函数：

```js
function checkRootConstraints (el) {
  if (process.env.NODE_ENV !== 'production') {
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
        'contain multiple nodes.'
      )
    }
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
        'it renders multiple elements.'
      )
    }
  }
}
```

该函数的作用是什么呢？它的作用是用来检测模板根元素是否符合要求，我们知道在编写 `Vue` 模板的时候会受到两种约束，首先模板必须有且仅有一个被渲染的根元素，第二不能使用 `slot` 标签和 `template` 标签作为模板的根元素，对于第一点为什么模板必须有且仅有一个被渲染的根元素，我们会在代码生成的部分为大家讲解，对于第二点为什么不能使用 `slot` 和 `template` 标签作为模板根元素，这是因为 `slot` 作为插槽，它的内容是由外界决定的，而插槽的内容很有可能渲染多个节点，`template` 元素的内容虽然不是由外界决定的，但它本身作为抽象组件是不会渲染任何内容到页面的，而其又可能包含多个子节点，所以也不允许使用 `template` 标签作为根节点。总之这些限制都是出于**必须有且仅有一个根元素**考虑的。

可以看到在 `checkRootConstraints` 函数内部首先通过判断 `el.tag === 'slot' || el.tag === 'template'` 来判断根元素是否是 `slot` 标签或 `template` 标签，如果是则打印警告信息。接着又判断当前元素是否是使用了 `v-for` 标签，因为 `v-for` 标签会渲染多个节点所以根元素是不允许使用 `v-for` 标签的。另外大家注意在 `checkRootConstraints` 函数内部打印警告信息时使用的是 `warnOnce` 函数而非 `warn` 函数，也就是说如果第一个 `warnOnce` 函数执行并打印了警告信息那么第二个 `warnOnce` 函数就不会再次打印警告信息，这么做的目的是每次只提示一个编译错误给用户，避免多次打印不同错误给用户造成迷惑，这是出于对开发者解决问题友好的考虑。

在 `checkRootConstraints` 函数的下面是一段 `if...elseif` 语句块，我们首先查看 `if` 语句块：

```js
if (!root) {
  root = element
  checkRootConstraints(root)
} else if (!stack.length) {
  // 省略...
}
```

`if` 语句块的判断条件是如果 `root` 不存在则执行语句块内的代码，我们知道 `root` 变量在一开始是不存在的，如果 `root` 不存在那说明当前元素应该就是根元素，所以在 `if` 语句块内直接将当前元素的描述对象 `element` 赋值给 `root` 变量，同时会调用上面刚刚讲过的 `checkRootConstraints` 函数检查根元素是否符合要求。

我们再来看 `elseif` 语句的条件，它检测了 `stack.length` 是否为 `0`，也就是说 `stack` 数组为空的情况下会执行 `elseif` 语句块内的代码。我们想一下如果 `stack` 数组为空并且当前正在解析开始标签，这说明什么问题？要想知道这个问题我们首先要知道 `stack` 数组的作用，前面已经多次提到每当遇到一个非一元标签时就会将该标签的描述对象放进数组，并且每当遇到一个结束标签时都会将该标签的描述对象从 `stack` 数组中拿掉，那也就是说在只有一个根元素的情况下，正常解析完成一段 `html` 代码后 `stack` 数组应该为空，或者换个说法，即当 `stack` 数组被清空后则说明整个模板字符串已经解析完毕了，但此时 `start` 钩子函数仍然被调用了，这说明模板中存在多个根元素，这时 `elseif` 语句块内的代码将被执行，如下：

```js
if (root.if && (element.elseif || element.else)) {
  // 省略...
} else if (process.env.NODE_ENV !== 'production') {
  warnOnce(
    `Component template should contain exactly one root element. ` +
    `If you are using v-if on multiple elements, ` +
    `use v-else-if to chain them instead.`
  )
}
```

上面这段代码的作用是什么呢？我们知道在编写 `Vue` 模板时的约束是必须有且仅有一个被渲染的根元素，但你可以定义多个根元素，只要能够保证最终只渲染其中一个元素即可，能够达到这个目的的方式只有一种，那就是在多个根元素之间使用 `v-if` 或 `v-else-if` 或 `v-else`。我们来看如上代码的实现，首先观察如上代码中 `if` 条件语句的判断条件：

```js
if (root.if && (element.elseif || element.else))
```

这里解释一下元素对象中的 `.if` 属性、`.elseif` 属性以及 `.else` 属性都是哪里来的，它们是在通过 `processIf` 函数处理元素描述对象时，如果发现元素的属性中有 `v-if` 或 `v-else-if` 或 `v-else`，则会在元素描述对象上添加相应的属性作为标识。

回到上面的 `if` 判断条件，首先 `root.if` 必须为真，要知道一点，即无论定义多少个根元素，`root` 变量始终存储的是第一个根元素的描述对象，所以 `root.if` 为真就保证了第一个定义的根元素是使用了 `v-if` 指令的。同时条件 `(element.elseif || element.else)` 也必须为真，注意这里是 `element.elseif` 或 `element.else`，而不是 `root.elseif` 或 `root.else`。`root` 为第一个根元素的描述对象，`element` 为当前元素描述对象，即非第一个根元素的描述对象。如果以上条件成立就能够保证所有根元素都是由 `v-if`、`v-else-if`、`v-else` 等指令控制的，这就间接保证了被渲染的根元素只有一个，此时 `if` 语句块内的代码将被执行，如下：

```js
if (root.if && (element.elseif || element.else)) {
  checkRootConstraints(element)
  addIfCondition(root, {
    exp: element.elseif,
    block: element
  })
} else if (process.env.NODE_ENV !== 'production') {
  // 省略...
}
```

在 `if` 语句块内首先使用 `checkRootConstraints` 函数检查当前元素是否符合作为根元素的要求，接着调用了 `addIfCondition` 函数，该函数源码如下：

```js
export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}
```

`addIfCondition` 函数接收两个参数，第一个参数为元素的描述对象，第二个参数的类型为 `ASTIfCondition`，说白了也是一个对象，该对象包含两个属性：

```js
declare type ASTIfCondition = { exp: ?string; block: ASTElement };
```

分别是 `exp` 属性和 `block` 属性，我们根据调用 `addIfCondition` 函数时传递的参数：

```js {4-5}
if (root.if && (element.elseif || element.else)) {
  checkRootConstraints(element)
  addIfCondition(root, {
    exp: element.elseif,
    block: element
  })
} else if (process.env.NODE_ENV !== 'production') {
  // 省略...
}
```

可知 `exp` 为当前元素描述对象的 `element.elseif` 的值，而 `block` 就是当前元素描述对象。并且第一个参数为 `root`，就是第一个根元素描述对象。此时再看 `addIfCondition` 函数的代码：

```js
export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}
```

在 `addIfCondition` 函数内首先检查根元素描述对象是否有 `el.ifConditions` 属性，如果没有则创建该属性同时初始化为空数组，接着将 `ASTIfCondition` 类型的对象条件到该数组中，实际上该函数是一个通用的函数，不仅仅用在根元素中，它用在任何由 `v-if`、`v-else-if` 以及 `v-else` 组成的条件渲染的模板中。

通过如上分析我们可以发现，具有 `v-else-if` 或 `v-else` 属性的元素的描述对象会被添加到具有 `v-if` 属性的元素描述对象的 `.ifConnditions` 数组中。

举个例子，如下模板：

```html
<div v-if="a"></div>
<p v-else-if="b"></p>
<span v-else></span>
```

解析后生成的 `AST` 如下(简化版)：

```js
{
  type: 1,
  tag: 'div',
  ifConditions: [
    {
      exp: 'b',
      block: { type: 1, tag: 'p' /* 省略其他属性 */ }
    },
    {
      exp: undefined,
      block: { type: 1, tag: 'span' /* 省略其他属性 */ }
    }
  ]
  // 省略其他属性...
}
```

可以看到代码 `v-else-if` 和 `v-else` 属性的元素描述对象都被条件到了带有 `v-if` 属性的元素描述对象的 `.ifConditions` 数组中，其实如上描述是不准确的，后面我们会发现带有 `v-if` 属性的元素也会将自身的元素描述对象条件到自身的 `.ifConditions` 数组中，即：

```js {5-8}
{
  type: 1,
  tag: 'div',
  ifConditions: [
    {
      exp: 'a',
      block: { type: 1, tag: 'div' /* 省略其他属性 */ }
    },
    {
      exp: 'b',
      block: { type: 1, tag: 'p' /* 省略其他属性 */ }
    },
    {
      exp: undefined,
      block: { type: 1, tag: 'span' /* 省略其他属性 */ }
    }
  ]
  // 省略其他属性...
}
```

以上就是实现允许使用 `v-if`、`v-else-if` 和 `v-else` 定义多个根元素的方式，我们顺带着讲解了一个重要的函数 `addIfCondition` 的实现和使用。

话说回来，假如当前元素不满足条件：`root.if && (element.elseif || element.else)`，那么在非生产环境下 `elseif` 语句块的代码将会被执行：

```js {3}
if (root.if && (element.elseif || element.else)) {
  // 省略...
} else if (process.env.NODE_ENV !== 'production') {
  warnOnce(
    `Component template should contain exactly one root element. ` +
    `If you are using v-if on multiple elements, ` +
    `use v-else-if to chain them instead.`
  )
}
```

可以看到，在 `elseif` 语句块内通过 `warnOnce` 函数打印了警告信息给开发者友好的提示。

再往下是如下这段 `if` 条件语句块：

```js
if (currentParent && !element.forbidden) {
  // 省略...
}
```

不过我们暂时跳过它，我们优先看一下 `start` 钩子函数的最后的一段代码，如下：

```js
if (!unary) {
  currentParent = element
  stack.push(element)
} else {
  closeElement(element)
}
```

如上这段代码是一个 `if...else` 条件分支语句块，我们首先看 `if` 语句的条件，它检测了当前元素是否是非一元标签，前面我们说过了如果一个元素是非一元的，那么应该将该元素的描述对象添加到 `stack` 栈中，并且将 `currentParent` 变量的值更新为当前元素的描述对象，如上代码中 `if` 语句块内的代码说明了一切。

反之，如果一个元素是一元标签，那么应该调用 `closeElement` 函数闭合该元素。对于 `closeElement` 函数我们后面再详细说，现在我们需要重点关注 `if` 语句块内的两句代码，通过这两句代码我们至少能得到一个总结：**每当遇到一个非一元标签都会将该元素的描述对象添加到 `stack` 数组，并且 `currentParent` 始终存储的是 `stack` 栈顶的元素，即当前解析元素的父级**。

知道了这些我们在回头来看如下代码：

```js
if (currentParent && !element.forbidden) {
  // 省略...
}
```

首先观察该 `if` 条件语句的判断条件：

```js
currentParent && !element.forbidden
```

如果这个条件成立，则说明当前元素存在父级(`currentParent`)，并且当前元素不是被禁止的元素。只有在这种情况下才会执行该 `if` 条件语句块内的代码。在 `if` 语句块内是如下代码：

```js
if (element.elseif || element.else) {
  processIfConditions(element, currentParent)
} else if (element.slotScope) { // scoped slot
  currentParent.plain = false
  const name = element.slotTarget || '"default"'
  ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
} else {
  currentParent.children.push(element)
  element.parent = currentParent
}
```

在如上这段代码中，最关键的代码应该是 `else` 语句块内的代码：

```js {6-7}
if (element.elseif || element.else) {
  // 省略...
} else if (element.slotScope) { // scoped slot
  // 省略...
} else {
  currentParent.children.push(element)
  element.parent = currentParent
}
```

在 `else` 语句块内，会把当前元素描述对象添加到父级元素描述对象(`currentParent`)的 `children` 数组中，同时将当前元素对象的 `parent` 属性指向父级元素对象，这样就建立了元素描述对象间的父子级关系。

但是就像我们前面讲过的，如果一个标签使用 `v-else-if` 或 `v-else` 指令，那么该元素的描述对象实际上会被添加到对应的 `v-if` 元素描述对象的 `ifConditions` 数组中，而非作为一个独立的子节点，这个工作就是由如上代码中 `if` 语句块的代码完成的：

```js {2}
if (element.elseif || element.else) {
  processIfConditions(element, currentParent)
} else if (element.slotScope) { // scoped slot
  // 省略...
} else {
  // 省略...
}
```

如上代码所示的 `if` 语句的条件可知，如果当前元素使用了 `v-else-if` 或 `v-else` 指令，则会调用 `processIfConditions` 函数，同时将当前元素描述对象 `element` 和父级元素的描述对象 `currentParent` 作为参数传递，我们来看看 `processIfConditions` 函数做了什么，如下是 `processIfConditions` 函数的源码：

```js
function processIfConditions (el, parent) {
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`
    )
  }
}
```

在 `processIfConditions` 函数内部，首先通过 `findPrevElement` 函数找到当前元素的前一个元素描述对象，并将其赋值给 `prev` 常量，接着进入 `if` 条件语句，判断当前元素的前一个元素是否使用了 `v-if` 指令，我们知道对于使用了 `v-else-if` 或 `v-else` 指令的元素来讲，他们的前一个元素必然需要使用相符的 `v-if` 指令才行。如果前一个元素确实使用 `v-if` 指令，那么则会调用 `addIfCondition` 函数将当前元素描述对象添加到前一个元素的的 `ifConditions` 数组中。如果前一个元素没有使用 `v-if` 指令，那么此时将会进入 `else...if` 条件语句的判断，即如果是非生产环境下，会打印警告信息提示开发者没有相符的使用了 `v-if` 指令的元素。

以上是当前元素使用了 `v-else-if` 或 `v-else` 指令时的特殊处理，由此可知**当一个元素使用了 `v-else-if` 或 `v-else` 指令时，它们是不会作为父级元素字节点的**，而是会被添加到相符的使用了 `v-if` 指令的元素描述对象的 `ifConditions` 数组中。

如果当前元素没有使用 `v-else-if` 或 `v-else` 指令，那么还会判断当前元素是否使用了 `slot-scope` 特性，如下：

```js {6}
if (element.elseif || element.else) {
  // 省略...
} else if (element.slotScope) { // scoped slot
  currentParent.plain = false
  const name = element.slotTarget || '"default"'
  ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
} else {
  // 省略...
}
```

如上代码高亮代码所示，如果一个元素使用了 `slot-scope` 特性，那么该元素的描述对象会被添加到父级元素的 `scopedSlots` 对象下，也就是说使用了 `slot-scope` 特性的元素与使用了 `v-else-if` 或 `v-else` 指令的元素一样，他们都不会作为父级元素的子节点，对于使用了 `slot-scope` 特性的元素来讲它们将被添加到父级元素描述的 `scopedSlots` 对象下。另外由于如上代码中 `elseif` 语句块涉及 `slot-scope` 相关的处理，我们打算放到后面统一讲解。

到目前为止，我们大概粗略的过了一遍 `start` 钩子函数的内容，接下来我们做一些总结，以使得我们的思路更加清晰：

* 1、`start` 钩子函数是当解析 `html` 字符串遇到开始标签时被调用的。
* 2、模板中禁止使用 `<style>` 标签和那些没有指定 `type` 属性或 `type` 属性值为 `text/javascript` 的 `<script>` 标签。
* 3、在 `start` 钩子函数中会调用前置处理函数，这些前置处理函数都放在 `preTransforms` 数组中，这么做的目的是为不同平台提供对应平台下的解析工作。
* 4、前置处理函数执行完后会调用一些列 `process*` 类函数继续对元素描述对象进行加工。
* 5、通过判断 `root` 是否存在来判断当前解析的元素是否为根元素。
* 6、`slot` 标签和 `template` 标签不能作为根元素，并且根元素不能使用 `v-for` 指令。
* 7、可以定义多个根元素，但必须使用 `v-if`、`v-else-if` 以及 `v-else` 保证有且仅有一个根元素被渲染。
* 8、构建 `AST` 并建立父子级关系是在 `start` 钩子函数中完成的，每当遇到非一元标签，会把它存到 `currentParent` 变量中，当解析该标签的子节点时通过访问 `currentParent` 变量获取父级元素。
* 9、如果一个元素使用了 `v-else-if` 或 `v-else` 指令，则该元素不会作为子节点，而是会被添加到相符的使用了 `v-if` 指令的元素描述对象的 `ifConditions` 数组中。
* 10、如果以元素使用了 `slot-scope` 特性，则该元素也不会作为子节点，它会被添加到父级元素描述对象的 `scopedSlots` 属性中。
* 11、对于没有使用条件指令或 `slot-scope` 特性的元素，会正常建立父子级关系。

以上的总结就是 `start` 钩子函数在处理开始标签时所做的事情，实际上由于开始标签中包含了大量指令信息(如 `v-if` 等)或特性信息(如 `slot-scope` 等)，所以在生产 `AST` 过程中，大部分工作都是由 `start` 函数来完成的，接下来我们将更加细致的去讲解解析过程中的每一个细节。

### 处理使用了 v-pre 指令的元素及其子元素

回到 `start` 钩子函数中，我们开始对 `start` 钩子函数内的代码做细致的分析，首先找到如下这段代码：

```js
if (!inVPre) {
  processPre(element)
  if (element.pre) {
    inVPre = true
  }
}
```

为了讲解的流畅性，同时也为了大家更容易理解，想要看明白如上代码的作用，我们首先需要了解一下 `processPre` 函数的作用，如下是 `processPre` 函数的源码：

```js
function processPre (el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}
```

`processPre` 函数接收元素描述对象作为参数，在 `processPre` 函数内部首先通过 `getAndRemoveAttr` 函数并使用其返回值与 `null` 做比较，如果 `getAndRemoveAttr` 函数的返回值不等于 `null` 则执行 `if` 语句块内的代码，即在元素描述对象上添加 `.pre` 属性并将其值设置为 `true`。

大家猜测一下 `getAndRemoveAttr` 函数的作用是什么？根据传递给该函数的两个参数：第一个参数是元素描述对象，第二个参数是一个字符串 `'v-pre'`。我们大概可以猜测到 `getAndRemoveAttr` 函数应该能够获取给定元素的某个属性的值，那么如上代码就应该是获取给定元素的 `v-pre` 属性的值。实际上我们的猜测是正确的，不过只正确了一部分，实际 `getAndRemoveAttr` 函数还会做更多事情，`getAndRemoveAttr` 函数来自于 `src/compiler/helpers.js` 文件，如下是 其代码：

```js
export function getAndRemoveAttr (
  el: ASTElement,
  name: string,
  removeFromMap?: boolean
): ?string {
  let val
  if ((val = el.attrsMap[name]) != null) {
    const list = el.attrsList
    for (let i = 0, l = list.length; i < l; i++) {
      if (list[i].name === name) {
        list.splice(i, 1)
        break
      }
    }
  }
  if (removeFromMap) {
    delete el.attrsMap[name]
  }
  return val
}
```

`getAndRemoveAttr` 接收三个参数，其中第三个参数 `removeFromMap` 是一个可选参数，并且它应该是一个布尔值，第一个参数 `el` 为元素描述对象，第二个参数为要获取属性的名字。在 `getAndRemoveAttr` 函数内部首先定义了 `val` 变量，紧接着是一个 `if` 条件语句块，其判断条件为：

```js
if ((val = el.attrsMap[name]) != null)
```

由此可知变量 `val` 保存的是要获取属性的值，并且获取属性的值的方式是通过读取元素描述对象的 `.attrsMap` 属性对象中与给定属性名字(`name`)同名的属性值来实现的，我们知道元素描述对象的 `.attrsMap` 对象是该元素所有属性的名值对应表。获取到属性值并赋值给 `val` 变量后，会使用该属性值与 `null` 做比较，如果不相等则说明属性值存在，此时会执行 `if` 语句块的代码，如下：

```js
const list = el.attrsList
for (let i = 0, l = list.length; i < l; i++) {
  if (list[i].name === name) {
    list.splice(i, 1)
    break
  }
}
```

在 `if` 语句块内遍历了元素描述对象的 `el.attrsList` 数组，并通过属性名(`name`)找到相应的数组元素，目的是使用数组的 `splice` 方法将该数组元素从元素描述对象的 `attrsList` 数组中移除。

接着 `getAndRemoveAttr` 函数还会做一件事情，如下：

```js
if (removeFromMap) {
  delete el.attrsMap[name]
}
```

如果第三个参数为真，那么还会将该属性从属性名值表(`attrsMap`)中移除。最后 `getAndRemoveAttr` 函数会将属性值 `val` 返回，当然啦如果属性不存在的话，则 `val` 变量的值为 `undefined`。

举个例子直观感受一下 `getAndRemoveAttr` 的作用，假设我们有如下模板：

```html
<div v-if="display" ></div>
```

如上 `div` 标签对象的元素描述对象为：

```js
element = {
  // 省略其他属性
  type: 1,
  tag: 'div',
  attrsList: [
    {
      name: 'v-if',
      value: 'display'
    }
  ],
  attrsMap: {
    'v-if': 'display'
  }
}
```

假设我们现在使用 `getAndRemoveAttr` 函数获取该元素的 `v-if` 属性的值：

```js
getAndRemoveAttr(element, 'v-if')
```

则该函数的返回值为字符串 `'display'`，同时会将 `v-if` 属性从 `attrsList` 数组中移除，所以经过 `getAndRemoveAttr` 函数处理之后元素的描述对象将变为：

```js {5}
element = {
  // 省略其他属性
  type: 1,
  tag: 'div',
  attrsList: [],
  attrsMap: {
    'v-if': 'display'
  }
}
```

可以看到 `attrsList` 属性变为一个空数组，如果传递给 `getAndRemoveAttr` 函数的第三个参数为真：

```js
getAndRemoveAttr(element, 'v-if', true)
```

那么除了将 `v-if` 属性从 `attrsList` 数组中移除之外，也会将其从 `attrsMap` 中移除，此时元素描述对象将变为：

```js {6}
element = {
  // 省略其他属性
  type: 1,
  tag: 'div',
  attrsList: [],
  attrsMap: {}
}
```

以上就是 `getAndRemoveAttr` 函数的作用，除了获取给定属性的值之外，还会将该属性从 `attrsList` 数组中移除，并可以选择性将该属性从 `attrsMap` 对象中移除。

我们回到 `processPre` 函数中：

```js
function processPre (el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}
```

现在来看 `processPre` 函数的逻辑就很容易理解了，可知 `processPre` 函数或去取给定元素 `v-pre` 属性的值，如果 `v-pre` 属性的值不等于 `null` 则会在元素描述对象上添加 `.pre` 属性，并将其值设置为 `true`。这里简单提一下，由于使用 `v-pre` 指令时不需要指定属性值，所以使用 `getAndRemoveAttr` 函数获取到的属性值为空字符串，由于 `'' != null` 成立，所以以上判断条件成立。

了解了 `precessPre` 函数的作用之后，我们再回到 `start` 钩子函数中，如下高亮的代码：

```js {3-5}
if (!inVPre) {
  processPre(element)
  if (element.pre) {
    inVPre = true
  }
}
```

高亮的代码判断了元素对象的 `.pre` 属性是否为真，我们知道假如一个标签使用 `v-pre` 指令，那么经过 `processPre` 函数处理之后，则该元素描述对象的 `.pre` 属性值为 `true`，这时会将 `inVPre` 变量的值也设置为 `true`。当 `inVPre` 变量为真时，意味着**后续的所有解析工作都处于 `v-pre` 环境下**，编译器会跳过拥有 `v-pre` 指令元素以及其子元素的编译过程，所以后续的编译逻辑需要 `inVPre` 变量作为标识才行。

另外如上代码中我们要注意判断条件：`if (!inVPre)`，该条件保证了如果当前解析工作已经处于 `v-pre` 环境下了，则不需要再次执行该 `if` 语句块内的代码。

再往下我们要将的是 `start` 钩子函数中的如下这段代码：

```js
if (platformIsPreTag(element.tag)) {
  inPre = true
}
```

这段代码相对来说要简单一些，使用 `platformIsPreTag` 函数判断当前元素是否是 `<pre>` 标签，如果是 `<pre>` 标签则将 `inPre` 变量设置为 `true`。实际上 `inPre` 变量与 `inVPre` 变量的作用相同，都是用来作为一个标识，只不过 `inPre` 变量标识着当前解析环境是否在 `<pre>` 标签内，因为 `<pre>` 标签内的解析行为与其他 `html` 标签是不同。具体不同体现在：

* 1、`<pre>` 标签会对其所包含的 `html` 字符实体进行解码
* 2、`<pre>` 标签会保留 `html` 字符串编写时的空白

更具体的实现我们会在后面的分析中讲到。




### 增强的 class
### 增强的 style
### 特殊的 model

## 生成抽象语法树(AST)

## 静态优化

