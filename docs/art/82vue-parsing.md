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

实际上构建抽象语法树的工作就是创建一个类似如上所示的一个能够描述节点关系的对象树，节点与节点之间通过 `parent` 和 `children` 建立联系，每个节点的 `type` 属性用来标识该节点的类别，比如 `type` 为 `1` 代表该节点为元素节点，`type` 为 `2` 代表该节点为文本节点，这只是认为的一个规定，你可以用任何方便的方式加以区分。

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

接着会遇到 `span` 元素的开始标签，会再次调用 `start` 钩子函数，由于此时 `root` 变量已经存在，所以不会再次设置 `root` 变量。为了能够更好的解析 `span` 标签，我们需要多值钱的解析代码做一些改变，如下：

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

如上代码所示，首先我们需要定义 `currentParent` 变量，它的作用是没遇到一个非一元标签，都会将该标签的描述对象作为 `currentParent` 的值，这样当解析该非一元标签的子节点时，子节点的父级就是 `currentParent` 变量。另外在 `start` 钩子函数内部我们在创建 `element` 描述对象时我们使用 `currentParent` 的值作为每个元素描述对象的 `parent` 属性的值。

如果用以上代码解析如下 `html` 字符串：

```html
<div>
  <span></span>
</div>
```

那么其过程大概是这样的：手下会遇到 `div` 元素的开始标签，此时由于 `root` 不存在，并且 `currentParent` 也不存在，所以会创建一个用于描述该 `div` 元素的对象，并设置 `root` 的值如下：

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

前面说过，整个 `src/compiler/parser/index.js` 文件的所做的工作都是在创建 `AST`，所以我们应该先了解一下这个文件的结构，以方便后续的理解。在改文件的开头定义了一些常量和变量，其中包括一些正则常量，我们后续会详细讲解。

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

类似的，所有 `process*` 类函数的作用都是为了让一个元素的描述对象更叫充实，使这个对象能更加详情的描述一个元素，并且这些函数都会用在 `parseHTML` 函数的钩子选项函数中。

另外我们也能看到很多非 `process*` 类的函数，例如 `findPrevElement`、`makeAttrsMap` 等等，这些函数实际上就是工具函数。

以上就是 `src/compiler/parser/index.js` 文件的整体结构。接下来我们将重新回到该文件的开头部分，来看看都定义了哪些常量或变量。

### 正则常量 onRE

接下来我们将讲解定义在该文件中的一系列常量，首先要讲解的 `onRE` 正则常量，其源码如下：

```js
export const onRE = /^@|^v-on:/
```

这个常量用来匹配以字符 `@` 或 `v-on:` 开头的字符串，主要作用是检测标签属性名是否是监听事件的指令。

### 正则常量 dirRE

正则常量 `dirRE` 源码如下：

```js
export const dirRE = /^v-|^@|^:/
```

它用来匹配以字符 `v-` 或 `@` 或 `:` 开头的字符串，主要作用是检测标签属性名是否是指令。所以通过这个正则我们可以知道，在 `vue` 中所以 `v-` 开头的属性都被认为是指令，另外 `@` 字符是 `v-on` 的缩写，`:` 字符是 `v-bind` 的缩写。

### 正则常量 forAliasRE

其源码如下：

```js
export const forAliasRE = /([^]*?)\s+(?:in|of)\s+([^]*)/
```

该正则包含三个分组，第一个分组为 `([^]*?)`，该分组是一个惰性匹配的分组，它匹配的内容为任何字符，包括换行符等。第二个分组为 `(?:in|of)`，该分组用来匹配字符串 `in` 或者 `of`，并且该分组是非捕获的分组。第三个分组为 `([^]*)`，与第一个分组类似，不同的是第三个分组是非惰性匹配。同时每个分组之间都会匹配至少一个空白符 `\s+`。通过以上说明可知，正则 `forAliasRE` 用来匹配 `v-for` 属性的值，并捕获 `in` 或 `of` 前后的字符串。假设我们像如下这样使用 `v-for`：

```html
<div v-for="obj of list"></div>
```

那么正则 `forAliasRE` 用来匹配字符串 `'obj of list'`，并捕获到两个字符串 `'obj'` 和 `'list'`。

### 正则常量 forIteratorRE

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

### 正则常量 stripParensRE

源码如下：

```js
const stripParensRE = /^\(|\)$/g
```

这个捕获组用来捕获要么以字符 `(` 开头，要么以字符 `)` 结尾的字符串，或者两者都满足。那么这个正则的作用是什么呢？我们在讲解正则 `forIteratorRE` 时有个细节不知道大家注意到了没有，就是 `forIteratorRE` 正则所匹配的字符串是 `'obj, index'`，而不是 `'(obj, index)'`，这两个字符串的区别就在于第二个字符串拥有左右括号，所以在使用 `forIteratorRE` 正则之前，需要使用 `stripParensRE` 正则去掉字符串 `'(obj, index)'` 中的左右括号，实现方式很简单：

```js
'(obj, index)'.replace(stripParensRE, '')
```

### 正则常量 argRE

源码如下：

```js
const argRE = /:(.*)$/
```

正则 `argRE` 用来匹配指令中的参数，如下：

```html
<div v-on:click.stop="handleClick"></div>
```

其中 `v-on` 为指令，`click` 为传递给 `v-on` 指令的参数，`stop` 为修饰符。所以 `argRE` 正则用来匹配指令编写中的参数，并且拥有一个捕获组，用来捕获参数的名字。

### 正则常量 bindRE

源码如下：

```js
export const bindRE = /^:|^v-bind:/
```

该正则用来匹配以字符 `:` 或字符串 `v-bind:` 开头的字符串，主要用来检测一个标签的属性是否是绑定(`v-bind`)。

### 正则常量 modifierRE

源码如下：

```js
const modifierRE = /\.[^.]+/g
```

该正则用来匹配修饰符的，但是并没有捕获任何东西，举例如下：

```js
const matchs = 'v-on.click.stop'.match(modifierRE)
```

那么 `matchs` 数组第一个元素为字符串 `'.stop'`，所以指令名字应该是：

```js
matchs[0].slice(1)  // 'stop'
```

## 对令牌的加工

### 增强的 class
### 增强的 style
### 特殊的 model

## 生成抽象语法树(AST)

## 静态优化

