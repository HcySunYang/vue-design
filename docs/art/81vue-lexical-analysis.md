# 词法分析 - 为生成AST做准备

在 [Vue的编译器初探](./80vue-compiler-start.md) 这一章节中，我们对 `Vue` 如何创建编译器，以及在这个过程中经历过的几个重要的函数做了分析，比如 `compileToFunctions` 函数以及 `compile` 函数，并且我们知道真正对模板进行编译工作的实际是 `baseCompile` 函数，而接下来我们的任务就是搞清楚 `baseCompile` 函数的内容。

`baseCompile` 函数是在 `src/compiler/index.js` 中作为 `createCompilerCreator` 函数的参数使用的，代码如下：

```js
// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options)
  optimize(ast, options)
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

可以看到 `baseCompile` 函数接收两个参数，分别是字符串模板(`template`)和选项参数(`options`)，其中选项参数 `options` 我们已经分析过了，并且我们有对应的附录专门整理编译器的选项参数，可以在 [编译器选项整理](../appendix/compiler-options.md) 中查看。

`baseCompile` 函数很简短，由三句代码和一个 `return` 语句组成，这三句代码的作用如下：

```js
// 调用 parse 函数将字符串模板解析成抽象语法树(AST)
const ast = parse(template.trim(), options)
// 调用 optimize 函数优化 ast
optimize(ast, options)
// 调用 generate 函数将 ast 编译成渲染函数
const code = generate(ast, options)
```

最终 `baseCompile` 的返回值如下：

```js
return {
  ast,
  render: code.render,
  staticRenderFns: code.staticRenderFns
}
```

可以看到，其最终返回了抽象语法树(`ast`)，渲染函数(`render`)，静态渲染函数(`staticRenderFns`)，且 `render` 的值为 `code.render`，`staticRenderFns` 的值为 `code.staticRenderFns`，也就是说通过 `generate` 处理 `ast` 之后得到的返回值 `code` 是一个对象，该对象的属性中包含了渲染函数（**注意以上提到的渲染函数，都以字符串的形式存在，因为真正变成函数的过程是在 `compileToFunctions` 中使用 `new Function()` 来完成的**）。

而接下来我们将会花费很大的篇幅来聚焦在一句代码上，即下面这句代码：

```js
const ast = parse(template.trim(), options)
```

也就是 `Vue` 的 `parser`，它是如何将字符串模板解析为抽象语法树(`AST`)的。

## 对 parser 的简单介绍

在说 `parser` 之前，我们先了解一下编译器的概念，简单的讲编译器就是将 `源代码` 转换成 `目标代码` 的工具。详细一点如下(引用自维基百科)：

> 它主要的目的是将便于人编写、阅读、维护的高级计算机语言所写作的 `源代码` 程序，翻译为计算机能解读、运行的低阶机器语言的程序。`源代码` 一般为高阶语言（High-level language），如Pascal、C、C++、C# 、Java等，而目标语言则是汇编语言或目标机器的目标代码（Object code）。

编译器所包含的概念很多，比如 词法分析(`lexical analysis`)，句法分析(`parsing`)，类型检查/推导，代码优化，代码生成...等等，且大学中已有专门的课程，而我们这里要讲的 `parser` 就是编译器中的一部分，准确的说，`parser` 是编译器对源代码处理的第一步。

`parser` 是把某种特定格式的文本转换成某种数据结构的程序，其中“特定格式的文本”可以理解为普通的字符串，而 `parser` 的作用就是将这个字符串转换成一种数据结构(通常是一个对象)，并且这个数据结构是编译器能够理解的，因为编译器的后续步骤，比如上面提到的 句法分析，类型检查/推导，代码优化，代码生成 等等都依赖于该数据结构，正因如此我们才说 `parser` 是编译器处理源代码的第一步，并且这种数据结构是抽象的，我们常称其为抽象语法树，即 `AST`。

`Vue` 的编译器也不例外，大致也分为三个阶段，即：词法分析 -> 句法分析 -> 代码生成。在词法分析阶段 `Vue` 会把字符串模板解析成一个个的令牌(`token`)，该令牌将用于句法分析阶段，在句法分析阶段会根据令牌生成一棵 `AST`，最后再根据该 `AST` 生成最终的渲染函数，这样就完成了代码的生成。按照顺序我们需要先了解的是词法分析阶段，看一看 `Vue` 是如何对字符串模板进行拆解的。

## Vue 中的 html-parser

本节中大量出现 `parse` 以及 `parser` 这两个单词，不要混淆这两个单词，`parse` 是动词，代表“解析”的过程，`parser` 是名词，代表“解析器”。

回到 `baseCompile` 函数中的这句代码：

```js
const ast = parse(template.trim(), options)
```

由这句代码可知 `parse` 函数就是用来解析模板字符串的，最终生成 `AST`，根据文件头部的引用关系可知 `parse` 函数位于 `src/compiler/parser/index.js` 文件，打开该文件可以发现其的确导出了一个名字为 `parse` 的函数，如下：

```js
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  // 省略...

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
  return root
}
```

同时我们注意到在 `parse` 函数内部主要通过调用 `parseHTML` 函数对模板字符串进行解析，实际上 `parseHTML` 函数的作用就是用来做词法分析的，而 `parse` 函数的作用则是在词法分析的基础上做句法分析从而生成一棵 `AST`。本节我们主要分析一下 `Vue` 是如何对模板字符串进行词法分析的，也就是 `parseHTML` 函数的实现。

根据文件头部的引用关系可知 `parseHTML` 函数来自 `src/compiler/parser/html-parser.js` 文件，实际上整个 `html-parser.js` 文件所做的事情都是在做词法分析，接下来我们就研究一下它是如何实现的。打开该文件，其开头是一段注释：

```js
/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */
```

通过这段注释我们可以了解到，`Vue` 的 `html parser` 是 `fork` 自 [John Resig 所写的一个开源项目：http://erik.eae.net/simplehtmlparser/simplehtmlparser.js](http://erik.eae.net/simplehtmlparser/simplehtmlparser.js)，`Vue` 在此基础上做了很多完善的工作，下面我们就探究一下 `Vue` 中的 `html parser` 都做了哪些事情。

## 正则分析

代码正文的一开始，是两句 `import` 语句，以及定义的一些正则常量：

```js
import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'

// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
const ncname = '[a-zA-Z_][\\w\\-\\.]*'
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being pased as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/
```

下面我们依次来看一下这些正则：

### attribute

首先是 `attribute` 正则常量：

```js
// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
```

`attribute` 顾名思义，这个正则的作用是用来匹配标签的属性(`attributes`)的，如下图所示：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-12-04-111.jpg)

我们在观察一个复杂的正则表达式时，主要就是要观察它有几个分组(准确地说应该是有几个捕获的分组)，通过上图我们能够清晰地看到，这个表达式有五个捕获组，第一个捕获组用来匹配属性名，第二个捕获组用来匹配等于号，第三、第四、第五个捕获组都是用来匹配属性值的，同时 `?` 表明第三、四、五个分组是可选的。 这是因为在 `html` 标签中有4种写属性值的方式：

* 1、使用双引号把值引起来：`class="some-class"`
* 2、使用单引号把值引起来：`class='some-class'`
* 3、不使用引号：`class=some-class`
* 4、单独的属性名：`disabled`

正因如此，需要三个正则分组并配合可选属性来分别匹配四种情况，我们可以对这个正则做一个测试，如下：

```js
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
console.log('class="some-class"'.match(attribute))  // 测试双引号
console.log("class='some-class'".match(attribute))  // 测试单引号
console.log('class=some-class'.match(attribute))  // 测试无引号
console.log('disabled'.match(attribute))  // 测试无属性值
```

对于双引号的情况，我们将得到以下结果：

```js
[
    'class="some-class"',
    'class',
    '=',
    'some-class',
    undefined,
    undefined
]
```

数组共有从 `0` 到 `5` 六个元素，第 `0` 个元素是被整个正则所匹配的结果，从第 `1` 至第 `5` 个元素分别对应五个捕获组的匹配结果，我们可以看到，第 `1` 个元素对应第一个捕获组，匹配到了属性名(`class`)；第 `2` 个元素对应第二个捕获组，匹配到了等号(`=`)；第 `3` 个元素对应第三个捕获组，匹配到了带双引号的属性值；而第 `4` 和第 `5` 个元素分别对应第四和第五个捕获组，由于没有匹配到所以都是 `undefined`。

所以通过以上结果我们很容易想到当属性值被单引号引起来和不使用引号的情况下所得到的匹配结果是什么，变化主要就在匹配结果数组的第 `3`、`4`、`5` 个元素，匹配到哪种情况，那么对应的位置就是属性值，其他位置则是 `undefined`，如下：

```js
// 对于单引号的情况
[
    "class='some-class'",
    'class',
    '=',
    undefined,
    'some-class',
    undefined
]
// 对于没有引号
[
    'class=some-class',
    'class',
    '=',
    undefined,
    undefined,
    'some-class'
]
// 对于单独的属性名
[
    'disabled',
    'disabled',
    undefined,
    undefined,
    undefined,
    undefined
]
```

### ncname

接下来一句代码如下：

```js
// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
const ncname = '[a-zA-Z_][\\w\\-\\.]*'
```

首先给大家解释几个概念并说明一些问题：

* 一、合法的 XML 名称是什么样的？

首先在 XML 中，标签是用户自己定义的，比如：`<bug></bug>`。

正因为这样，所以不同的文档中如果定义了相同的元素(标签)，就会产生冲突，为此，XML 允许用户为标签指定前缀：`<k:bug></k:bug>`，前缀是字母 `k`。

除了前缀还可以使用命名空间，即使用标签的 `xmlns` 属性，为前缀赋予与指定命名空间相关联的限定名称：

```html
<k:bug xmlns:k="http://www.xxx.com/xxx"></k:bug>
```

综上所述，一个合法的XML标签名应该是由 `前缀`、`冒号(:)` 以及 `标签名称` 组成的：`<前缀:标签名称>`

* 二、什么是 `ncname`？

`ncname` 的全称是 `An XML name that does not contain a colon (:)` 即：不包含冒号(`:`)的 XML 名称。也就是说 `ncname` 就是不包含前缀的XML标签名称。大家可以在这里找到关于 [ncname](https://msdn.microsoft.com/zh-cn/library/ms256452.aspx) 的概念。

* 三、什么是 `qname`？

我们可以在 `Vue` 的源码中看到其给出了一个链接：[https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName](https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName)，其实 `qname` 就是：`<前缀:标签名称>`，也就是合法的XML标签。

了解了这些，我们再来看 `ncname` 的正则表达式，它定义了 `ncname` 的合法组成，这个正则所匹配的内容很简单：*字母或下划线开头，后面可以跟任意数量的字符、中横线和 `.`*。

### qnameCapture

下一个正则是 `qnameCapture`，`qnameCapture` 同样是普通字符串，只不过将来会用在 `new RegExp()` 中：

```js
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
```

我们知道 `qname` 实际上就是合法的标签名称，它是由可选项的 `前缀`、`冒号` 以及 `名称` 组成，观察 `qnameCapture` 可知它有一个捕获分组，捕获的内容就是整个 `qname` 名称，即整个标签的名称。

### startTagOpen

`startTagOpen` 是一个真正使用 `new RegExp()` 创建出来的正则表达式：

```js
const startTagOpen = new RegExp(`^<${qnameCapture}`)
```

用来匹配开始标签的一部分，这部分包括：`<` 以及后面的 `标签名称`，这个表达式的创建用到了上面定义的 `qnameCapture` 字符串，所以 `qnameCapture` 这个字符串中所设置的捕获分组，在这里同样适用，也就是说 `startTagOpen` 这个正则表达式也会有一个捕获的分组，用来捕获匹配的标签名称。

### startTagClose

```js
const startTagClose = /^\s*(\/?)>/
```

`startTagOpen` 用来匹配开始标签的 `<` 以及标签的名字，但是并不包括开始标签的闭合部分，即：`>` 或者 `/>`，由于标签可能是一元标签，所以开始标签的闭合部分有可能是 `/>`，比如：`<br />`，如果不是一元标签，此时就应该是：`>`

观察 `startTagClose` 可知，这个正则拥有一个捕获分组，用来捕获开始标签结束部分的斜杠：`/`。

### endTag

```js
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
```

`endTag` 这个正则用来匹配结束标签，由于该正则同样使用了字符串 `qnameCapture`，所以这个正则也拥有了一个捕获组，用来捕获标签名称。

### doctype

```js
const doctype = /^<!DOCTYPE [^>]+>/i
```

这个正则用来匹配文档的 `DOCTYPE` 标签，没有捕获组。

### comment

```js
// #7298: escape - to avoid being pased as HTML comment when inlined in page
const comment = /^<!\--/
```

这个正则用来匹配注释节点，没有捕获组。大家注意这句代码上方的注释，索引是：`#7298`。有兴趣的同学可以去 `Vue` 的 `issue` 中搜索一下相关问题。在这之前实际上 `comment` 常量的值是 `<!--` 而并不是 `<!\--`，之所以改成 `<!\--` 是为了允许把 `Vue` 代码内联到 `html` 中，否则 `<!--` 会被认为是注释节点。

### conditionalComment

```js
const conditionalComment = /^<!\[/
```

这个正则用来匹配条件注释节点，没有捕获组。

最后很重要的一点是，大家注意，这些正则表达式有一个共同的特点，即：*他们都是从一个字符串的开头位置开始匹配的，因为有 `^` 的存在*。

在这些正则常量的下面，有着这样一段代码：

```js
let IS_REGEX_CAPTURING_BROKEN = false
'x'.replace(/x(.)?/g, function (m, g) {
  IS_REGEX_CAPTURING_BROKEN = g === ''
})
```

首先定义了变量 `IS_REGEX_CAPTURING_BROKEN` 且初始值为 `false`，接着使用一个字符串 `'x'` 的 `replace` 函数用一个带有捕获组的正则进行匹配，并将捕获组捕获到的值赋值给变量 `g`。我们观察字符串 `'x'` 和正则 `/x(.)?/` 可以发现，该正则中的捕获组应该捕获不到任何内容，所以此时 `g` 的值应该是 `undefined`，但是在老版本的火狐浏览器中存在一个问题，此时的 `g` 是一个空字符串 `''`，并不是 `undefined`。所以变量 `IS_REGEX_CAPTURING_BROKEN` 的作用就是用来标识当前宿主环境是否存在该问题。这个变量我们后面会用到，其作用到时候再说。

## 常量分析

在这些正则的下面，定义了一些常量，如下：

```js
// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t'
}
const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10|#9);/g
```

上面这段代码中，包含 `5` 个常量，我们逐个来看。

首先 `isPlainTextElement` 常量是一个函数，它是通过 `makeMap` 函数生成的，用来检测给定的标签名字是不是纯文本标签（包括：`script`、`style`、`textarea`）。

然后定义了 `reCache` 常量，它被初始化为一个空的 `JSON` 对象字面量。

再往下定义了 `decodingMap` 常量，它也是一个 `JSON` 对象字面量，其中 `key` 是一些特殊的 `html` 实体，值则是这些实体对应的字符。在 `decodingMap` 常量下面的是两个正则常量：`encodedAttr` 和 `encodedAttrWithNewLines`。可以发现正则 `encodedAttrWithNewLines` 会比 `encodedAttr` 多匹配两个 `html` 实体字符，分别是 `&#10;` 和 `&#9;`。对于 `decodingMap` 以及下面两个正则的作用不知道大家能不能猜得到，其实我们讲解编译器的创建时有讲到 `shouldDecodeNewlines` 和 `shouldDecodeNewlinesForHref` 这两个编译器选项，当时我们就有针对这两个选项的作用做讲解，可以在附录 [platforms/web/util 目录下的工具方法全解](../appendix/web-util.md) 中查看。

所以这里的常量 `decodingMap` 以及两个正则 `encodedAttr` 和 `encodedAttrWithNewLines` 的作用就是用来完成对 `html` 实体进行解码的。

再往下是这样一段代码：

```js
// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'
```

定义了两个常量，其中 `isIgnoreNewlineTag` 是一个通过 `makeMap` 函数生成的函数，用来检测给定的标签是否是 `<pre>` 标签或者 `<textarea>` 标签。这个函数被用在了 `shouldIgnoreFirstNewline` 函数里，`shouldIgnoreFirstNewline` 函数的作用是用来检测是否应该忽略元素内容的第一个换行符。什么意思呢？大家注意这两段代码上方的注释：`// #5992`，感兴趣的同学可以去 `vue` 的 `issue` 中搜一下，大家就会发现，这两句代码的作用是用来解决一个问题，该问题是由于历史原因造成的，即一些元素会受到额外的限制，比如 `<pre>` 标签和 `<textarea>` 会忽略其内容的第一个换行符，所以下面这段代码是等价的：

```html
<pre>内容</pre>
```

等价于：

```html
<pre>
内容</pre>
```

以上是浏览器的行为，所以 `Vue` 的编译器也要实现这个行为，否则就会出现 `issue #5992` 或者其他不可预期的问题。明白了这些我们再看 `shouldIgnoreFirstNewline` 函数就很容易理解，这个函数就是用来判断是否应该忽略标签内容的第一个换行符的，如果满足：*标签是 `pre` 或者 `textarea`* 且 *标签内容的第一个字符是换行符*，则返回 `true`，否则为 `false`。

`isIgnoreNewlineTag` 函数将被用于后面的 `parse` 过程，所以我们到时候再看，接着往下看代码，接下来定义了一个函数 `decodeAttr`，其源码如下：

```js
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}
```

`decodeAttr` 函数是用来解码 `html` 实体的。它的原理是利用前面我们讲过的正则 `encodedAttrWithNewLines` 和 `encodedAttr` 以及 `html` 实体与字符一一对应的 `decodingMap` 对象来实现将 `html` 实体转为对应的字符。该函数将会在后面 `parse` 的过程中使用到。

## parseHTML

接下来，将进入真正的 `parse` 阶段，这个阶段我们将看到如何将 `html` 字符串作为字符输入流，并且按照一定的规则将其逐步消化分解。这也是我们本节的重点，同时接下来我们要分析的函数也是 `compiler/parser/html-parser.js` 文件所导出的函数，即 `parseHTML` 函数，这个函数的内容非常多，但其实它还是很有条理的，下面就是对 `parseHTML` 函数的简化和注释，这能够让你更好的把握 `parseHTML` 函数的意图：

```js
export function parseHTML (html, options) {
  // 定义一些常量和变量
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0
  let last, lastTag

  // 开启一个 while 循环，循环结束的条件是 html 为空，即 html 被 parse 完毕
  while (html) {
    last = html
    
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // 确保即将 parse 的内容不是在纯文本标签里 (script,style,textarea)
    } else {
      // 即将 parse 的内容是在纯文本标签里 (script,style,textarea)
    }

    // 将整个字符串作为文本对待
    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }

  // 调用 parseEndTag 函数
  parseEndTag()

  // advance 函数
  function advance (n) {
    // ...
  }

  // parseStartTag 函数用来 parse 开始标签
  function parseStartTag () {
    // ...
  }
  // handleStartTag 函数用来处理 parseStartTag 的结果
  function handleStartTag (match) {
    // ...
  }
  // parseEndTag 函数用来 parse 结束标签
  function parseEndTag (tagName, start, end) {
    // ...
  }
}
```

首先我们注意到 `parseHTML` 函数接收两个参数：`html` 和 `options`，其中 `html` 是要被 `parse` 的字符串，而 `options` 则是 `parser` 选项。

总体上说，我们可以把 `parseHTML` 函数分为三个部分，第一部分即函数开头定义的一些常量和变量，第二部分是一个 `while` 循环，第三部分则是 `while` 循环之后定义的一些函数。我们分别来看，首先是第一部分，也就是 `parseHTML` 函数开头所定义的常量和变量，如下：

```js
const stack = []
const expectHTML = options.expectHTML
const isUnaryTag = options.isUnaryTag || no
const canBeLeftOpenTag = options.canBeLeftOpenTag || no
let index = 0
let last, lastTag
```

第一个常量是 `stack`，它被初始化为一个空数组，在 `while` 循环中处理 `html` 字符流的时候每当遇到一个 **非一元标签**，都会将该开始标签 `push` 到该数组。那么它的作用是什么呢？大家思考一个问题：在一个 `html` 字符串中，如何判断一个非一元标签是否缺少结束标签？

假设我们有如下 `html` 字符串：

```html
<article><section><div></section></article>
```

在 `parse` 这个字符串的时候，首先会遇到 `article` 开始标签，并将该标签入栈(`push` 到 `stack` 数组)，然后会遇到 `section` 开始标签，并将该标签 `push` 到栈顶，接下来会遇到 `div` 开始标签，同样被压入栈顶，注意此时 `stack` 数组内包含三个元素，如下：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-12-25-070202.jpg)

再然后便会遇到 `section` 结束标签，我们知道：**最先遇到的结束标签，其对应的开始标签应该最后被压入 stack 栈**，也就是说此时 `stack` 栈顶的元素应该是 `section`，但是我们发现事实上 `stack` 栈顶并不是 `section` 而是 `div`，这说明 `div` 元素缺少闭合标签。这就是检测 `html` 字符串中是否缺少闭合标签的原理。

讲完了 `stack` 常量，接下来第二个常量是 `expectHTML`，它的值被初始化为 `options.expectHTML`，也就是 `parser` 选项中的 `expectHTML`。它是一个布尔值，后面遇到的时候再讲解其作用。

第三个常量是 `isUnaryTag`，如果 `options.isUnaryTag` 存在则它的值被初始化为 `options.isUnaryTag` ，否则初始化为 `no`，即一个始终返回 `false` 的函数。其中 `options.isUnaryTag` 也是一个 `parser` 选项，用来检测一个标签是否是一元标签。

第四个常量是 `canBeLeftOpenTag`，它的值被初始化为 `options.canBeLeftOpenTag`(如果存在的话，否则初始化为 `no`)。其中 `options.canBeLeftOpenTag` 也是 `parser` 选项，用来检测一个标签是否是可以省略闭合标签的非一元标签。

<p class="tip">上面提到的一些常量的值，初始化的时候其实是使用 parser 选项进行初始化的，这里的 parser 选项其实大部分与编译器选项相同，在前面的章节中我们是有讲过的。</p>

除了常量，还定义了三个变量，分别是 `index = 0`，`last` 以及 `lastTag`。其中 `index` 被初始化为 `0`，它标识着当前字符流的读入位置。变量 `last` 存储剩余还未 `parse` 的 `html` 字符串，变量 `lastTag` 则始终存储着位于 `stack` 栈顶的元素。

接下来将进入第二部分，即开启一个 `while` 循环，循环的终止条件是 `html` 字符串为空，即 `html` 字符串全部 `parse` 完毕。`while` 循环的结构如下：

```js
while (html) {
  last = html
  
  if (!lastTag || !isPlainTextElement(lastTag)) {
    // 确保即将 parse 的内容不是在纯文本标签里 (script,style,textarea)
  } else {
    // 即将 parse 的内容是在纯文本标签里 (script,style,textarea)
  }

  // 将整个字符串作为文本对待
  if (html === last) {
    options.chars && options.chars(html)
    if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
      options.warn(`Mal-formatted tag at end of template: "${html}"`)
    }
    break
  }
}
```

首先将在每次循环开始时将 `html` 的值赋给变量 `last`：

```js
last = html
```

我们可以发现，在 `while` 循环即将结束的时候，有一个对 `last` 和 `html` 这两个变量的比较：

```js
if (html === last)
```

如果两者相等，则说明字符串 `html` 在经历循环体的代码之后没有任何改变，此时会把 `html` 字符串作为纯文本对待。接下来我们就着重讲解循环体中间的代码是如何 `parse` html 字符串的。循环体中间的代码都被包含在一个 `if...else` 语句块中：

```js
if (!lastTag || !isPlainTextElement(lastTag)) {
  // 确保即将 parse 的内容不是在纯文本标签里 (script,style,textarea)
} else {
  // 即将 parse 的内容是在纯文本标签里 (script,style,textarea)
}
```

我们观察 `if` 语句块的判断条件：

```js
!lastTag || !isPlainTextElement(lastTag)
```

如果上面的条件为真，则走 `if` 分支，否则将执行 `else` 分支。不过这句判断条件看上去有些难懂，没关系我们换一个角度，如果对该条件进行取反的话，则是：

```js
lastTag && isPlainTextElement(lastTag)
```

取反后的条件就好理解多了，我们知道 `lastTag` 存储着 `stack` 栈顶的元素，而 `stack` 栈顶的元素应该就是 **最近一次遇到的非一元标签的开始标签**，所以以上条件为真等价于：**最近一次遇到的非一元标签是纯文本标签(即：script,style,textarea 标签)**。也就是说：**当前我们正在处理的是纯文本标签里面的内容**。那么现在就清晰多了，当处理纯文本标签里面的内容时，就会执行 `else` 分支，其他情况将执行 `if` 分支。

接下来我们就先从 `if` 分支开始说起，下面的代码是对 `if` 语句块的简化：

```js
if (!lastTag || !isPlainTextElement(lastTag)) {
  let textEnd = html.indexOf('<')

  if (textEnd === 0) {
    // textEnd === 0 的情况
  }

  let text, rest, next
  if (textEnd >= 0) {
    // textEnd >= 0 的情况
  }

  if (textEnd < 0) {
    // textEnd < 0 的情况
  }

  if (options.chars && text) {
    options.chars(text)
  }
} else {
  // 省略 ...
}
```

简化后的代码看上去结构非常清晰，在 `if` 语句块的一开始定义了 `textEnd` 变量，它的值是 **html 字符串中左尖括号(<)第一次出现的位置**，接着开始了对 `textEnd` 变量的一系列判断：

```js
if (textEnd === 0) {
  // textEnd === 0 的情况
}

let text, rest, next
if (textEnd >= 0) {
  // textEnd >= 0 的情况
}

if (textEnd < 0) {
  // textEnd < 0 的情况
}
```

## textEnd 为 0 的情况

当 `textEnd === 0` 时，说明 `html` 字符串的第一个字符就是左尖括号，比如 `html` 字符串为：`<div>asdf</div>`，那么这个字符串的第一个字符就是左尖括号(`<`)。现在我们采用深度优先的方式去分析，所以我们暂时不关心 `textEnd >= 0` 以及 `textEnd < 0` 的情况，我们查看一下当 `textEnd === 0` 时的 `if` 语句块内的代码，如下：

```js
if (textEnd === 0) {
  // Comment:
  if (comment.test(html)) {
    // 有可能是注释节点
  }

  if (conditionalComment.test(html)) {
    // 有可能是条件注释节点
  }

  // Doctype:
  const doctypeMatch = html.match(doctype)
  if (doctypeMatch) {
    // doctype 节点
  }

  // End tag:
  const endTagMatch = html.match(endTag)
  if (endTagMatch) {
    // 结束标签
  }

  // Start tag:
  const startTagMatch = parseStartTag()
  if (startTagMatch) {
    // 开始标签
  }
}
```

以上同样是对源码的简化，这样看上去更加清晰，我们知道当 `textEnd === 0` 时说明 `html` 字符串的第一个字符就是左尖括号(`<`)，那么大家思考一下左尖括号开头的字符串，它可能是什么？其实通过上面代码中的一系列 `if` 判断分支大家应该能猜到：

* 1、可能是注释节点：`<!-- -->`
* 2、可能是条件注释节点：`<![ ]>`
* 3、可能是 `doctype`：`<!DOCTYPE >`
* 4、可能是结束标签：`</xxx>`
* 5、可能是开始标签：`<xxx>`
* 6、可能只是一个单纯的字符串：`<abcdefg`

### parse 注释节点

针对以上六种情况我们逐个来看，首先判断是否是注释节点：

```js
// Comment:
if (comment.test(html)) {
  const commentEnd = html.indexOf('-->')

  if (commentEnd >= 0) {
    if (options.shouldKeepComment) {
      options.comment(html.substring(4, commentEnd))
    }
    advance(commentEnd + 3)
    continue
  }
}
```

对于注释节点的判断方法是使用正则常量 `comment` 进行判断，即：`comment.test(html)`，对于 `comment` 正则常量我们在前面分析正则的部分已经讲过了，当时我提醒过大家一件事情，即这些正则常量有一个共同的特点：**都是从字符串的开头位置开始匹配的**，也就是说只有当 `html` 字符串的第一个字符是左尖括号(`<`)时才有意义。而现在我们分析的情况恰好是当 `textEnd === 0`，也就是说 `html` 字符串的第一个字符确实是左尖括号(`<`)。

所以如果 `comment.test(html)` 条件为真，则说明 **可能是** 注释节点，大家要注意关键字：**可能是**，为什么这么说呢？大家知道完整的注释节点不仅仅要以 `<!--` 开头，还要以 `-->` 结尾，如果只以 `<!--` 开头而没有 `-->` 结尾，那显然不是一个注释节点，所以首先要检查 `html` 字符串中 `-->` 的位置：

```js
const commentEnd = html.indexOf('-->')
```

如果找到了 `-->`，则说明这确实是一个注释节点，那么就处理之，否则什么事情都不做。处理的代码如下：

```js
if (options.shouldKeepComment) {
  options.comment(html.substring(4, commentEnd))
}
advance(commentEnd + 3)
continue
```

首先判断 `parser` 选项 `options.shouldKeepComment` 是否为真，如果为真则调用同为 `parser` 选项的 `options.comment` 函数，并将注释节点的内容作为参数传递。在 `Vue` 官方文档中可以找到一个叫做 `comments` 的选项，实际上这里的 `options.shouldKeepComment` 的值就是 `Vue` 选项 `comments` 的值，这一点当我们讲到生成抽象语法树(`AST`)的时候即可看到。

回过头来我们再次查看以上代码，我们看看这里是如何获取注释内容的：

```js
html.substring(4, commentEnd)
```

通过调用字符串的 `substring` 方法截取注释内容，其中起始位置是 `4`，结束位置是 `commentEnd` 的值，用一张图表示将会更加清晰：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-12-26-115232.jpg)

可以看到，最终获取到的内容是不包含注释节点的起始(`<!--`)和结束(`-->`)的。

这样一个注释节点就 `parse` 完毕了，那么完毕之后应该做什么呢？要做的很关键的一件事就是：**将已经 `parse` 完毕的字符串剔除**，也就是接下来调用的 `advance` 函数：

```js
advance(commentEnd + 3)
```

该函数定义在 `while` 循环的下方，源码如下：

```js
function advance (n) {
  index += n
  html = html.substring(n)
}
```

`advance` 函数接收一个 `Number` 类型的参数 `n`，我们刚刚说到：已经 `parse` 完毕的部分要从 `html` 字符串中剔除，而剔除的方式很简单，就是找到已经 `parse` 完毕的字符串的结束位置，然后执行 `html = html.substring(n)` 即可，这里的 `n` 就是所谓的结束位置。除此之外，我们发现 `advance` 函数还对 `index` 变量做了赋值：`index += n`，前面我们介绍变量的时候说到过，`index` 变量存储着字符流的读入位置，该位置是相对于原始 `html` 字符串的，所以每次都要更新。

那么对于注释节点，其执行的代码为：

```js
advance(commentEnd + 3)
```

`n` 的值是 `commentEnd + 3`，还是用一张图来表示：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-12-26-121606.jpg)

可以很容易的看到，经过 `advance` 函数后，新的 `html` 字符串将从 `commentEnd + 3` 的位置开始，而不再包含已经 `parse` 过的注释节点了。

最后还有一个很重要的步骤，即调用完 `advance` 函数之后，要执行 `continue` 跳过此次循环，由于此时 `html` 字符串已经是去掉了 `parse` 过的部分的新字符串了，所以开启下一次循环，重新开始 `parse` 过程。

### parse 条件注释节点

如果没有命中注释节点，则什么都不会做，继续判断是否命中条件注释节点：

```js
// http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
if (conditionalComment.test(html)) {
  const conditionalEnd = html.indexOf(']>')

  if (conditionalEnd >= 0) {
    advance(conditionalEnd + 2)
    continue
  }
}
```

类似对注释节点的判断一样，对于条件注释节点使用 `conditionalComment` 正则常量。但是如果条件 `conditionalComment.test(html)` 为真，只能说明 **可能是** 条件注释节点，因为条件注释节点除了要以 `<![` 开头还必须以 `]>` 结尾，所以在 `if` 语句块内第一句代码就是查找字符串 `]>` 的位置：

```js
const conditionalEnd = html.indexOf(']>')
```

如果没有找到，说明这不是一个条件注释节点，什么都不做。否则会作为条件注释节点对待，不过与注释节点不同，注释节点拥有 `parser` 选项 `options.comment`，在调用 `advance` 函数之前，会先将注释节点的内容传递给 `options.comment` 函数。而对于条件注释节点则没有相应的 `parser` 钩子，也就是说 `Vue` 模板永远都不会保留条件注释节点的内容，所以直接调用 `advance` 函数以及执行 `continue` 语句结束此次循环。

其中传递给 `advance` 函数的参数是 `conditionalEnd + 2`，它保存着条件注释结束部分在字符串中的位置，道理与 `parse` 注释节点时相同。

### parse Doctype节点

如果既没有命中注释节点，也没有命中条件注释节点，那么将判断是否命中 `Doctype` 节点：

```js
// Doctype:
const doctypeMatch = html.match(doctype)
if (doctypeMatch) {
  advance(doctypeMatch[0].length)
  continue
}
```

判断的方法是使用字符串的 `match` 方法去匹配正则 `doctype`，如果匹配成功 `doctypeMatch` 的值是一个数组，数组的第一项保存着整个匹配项的字符串，即整个 `Doctype` 标签的字符串，否则 `doctypeMatch` 的值为 `null`。

如果匹配成功 `if` 语句块将被执行，同样的，对于 `Doctype` 也没有提供相应的 `parser` 钩子，即 `Vue` 不会保留 `Doctype` 节点的内容。不过大家不用担心，因为在原则上 `Vue` 在编译的时候根本不会遇到 `Doctype` 标签。

### parse 开始标签

实际上接下来的代码是解析结束标签的(`End tag`)，解析开始标签(`Start tag`)的代码被放到了最后面，但是这里把解析开始标签的代码提前来讲，是因为在顺序读取 `html` 字符流的过程中，总会先遇到开始标签，再遇到结束标签，除非你的 `html` 代码中没有开始标签，直接写结束标签。

解析开始标签的代码如下：

```js
// Start tag:
const startTagMatch = parseStartTag()
if (startTagMatch) {
  handleStartTag(startTagMatch)
  if (shouldIgnoreFirstNewline(lastTag, html)) {
    advance(1)
  }
  continue
}
```

### parseStartTag 函数解析开始标签

首先调用 `parseStartTag` 函数，并获取其返回值，如果存在返回值则说明开始标签解析成功，这的的确确是一个开始标签，然后才会执行 `if` 语句块内的代码。也就是说判断是否解析到一个开始标签的工作，是由 `parseStartTag` 函数完成的，这个函数定义在 `advance` 函数的下面，我们看看它的代码：

```js
function parseStartTag () {
  const start = html.match(startTagOpen)
  if (start) {
    const match = {
      tagName: start[1],
      attrs: [],
      start: index
    }
    advance(start[0].length)
    let end, attr
    while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
      advance(attr[0].length)
      match.attrs.push(attr)
    }
    if (end) {
      match.unarySlash = end[1]
      advance(end[0].length)
      match.end = index
      return match
    }
  }
}
```

`parseStartTag` 函数首先会调用 `html` 字符串的 `match` 函数匹配 `startTagOpen` 正则，前面我们讲到过 `startTagOpen` 正则用来匹配开始标签的一部分，这部分包括：`<` 以及后面的 `标签名称`，并且拥有一个捕获组，即捕获标签的名称。然后将匹配的结果赋值给 `start` 常量，如果 `start` 常量为 `null` 则说明匹配失败，则 `parseStartTag` 函数执行完毕，其返回值为 `undefined`。

如果匹配成功，那么 `start` 常量将是一个包含两个元素的数组：第一个元素是标签的开始部分(包含 `<` 和 `标签名称`)；第二个元素是捕获组捕获到的标签名称。比如有如下 `html`：

```html
<div></div>
```

那么此时 `start` 数组为：

```js
start = ['<div', 'div']
```

由于匹配成功，所以 `if` 语句块将被执行，首先是下面这段代码：

```js
if (start) {
  const match = {
    tagName: start[1],
    attrs: [],
    start: index
  }
  advance(start[0].length)
  // 省略 ...
}
```

定义了 `match` 常量，它是一个对象，初始状态下拥有三个属性：

* 1、`tagName`：它的值为 `start[1]` 即标签的名称。
* 2、`attrs`：它的初始值是一个空数组，我们知道，开始标签是可能拥有属性的，而这个数组就是用来存储将来被匹配到的属性。
* 3、`start`：它的值被设置为 `index`，也就是当前字符流读入位置在整个 `html` 字符串中的相对位置。

接着开始标签的开始部分就匹配完成了，所以要调用 `advance` 函数，参数为 `start[0].length`，即匹配到的字符串的长度。

代码继续执行，来到了这里：

```js
if (start) {
  // 省略 ...
  let end, attr
  while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
    advance(attr[0].length)
    match.attrs.push(attr)
  }
  // 省略 ...
}
```

首先定义两个变量 `end` 以及 `attr`，接着开启了一个 `while` 循环，那么这个 `while` 循环的作用是什么呢？我们看一下循环的条件就知道了：

```js
!(end = html.match(startTagClose)) && (attr = html.match(attribute))
```

循环的条件有两个，第一个条件是：**没有匹配到开始标签的结束部分**，这个条件的实现方式是使用 `html` 字符串的 `match` 方法去匹配 `startTagClose` 正则，并将结果保存到 `end` 变量中。第二个条件是：**匹配到了属性**，实现方式是使用  `html` 字符串的 `match` 方法去匹配 `attribute`正则。简单一句话总结这个条件的成立要素：**没有匹配到开始标签的结束部分，并且匹配到了开始标签中的属性**，这个时候循环体将被执行，直到遇到开始标签的结束部分为止。

在循环体内，由于此时匹配到了开始标签的属性，所以 `attr` 变量将保存着匹配结果，匹配的结果与 `attribute` 正则及其捕获组有关，详细内容我们在前面分析正则的时候讲到过，比如有如下 `html` 字符串：

```html
<div v-for="v in map"></div>
```

那么 `attr` 变量的值将为：

```js
attr = [
  ' v-for="v in map"',
  'v-for',
  '=',
  'v in map',
  undefined,
  undefined
]
```

接下来在循环体内做了两件事，首先调用 `advance` 函数，参数为 `attr[0].length` 即整个属性的长度。然后会将此次循环匹配到的结果 `push` 到前面定义的 `match` 对象的 `attrs` 数组中，即：

```js
advance(attr[0].length)
match.attrs.push(attr)
```

这样一次循环就结束了，将会开始下一次循环，直到 **匹配到开始标签的结束部分** 或者 **匹配不到属性** 的时候循环才会停止。`parseStartTag` 函数 `if` 语句块内的最后一段代码如下：

```js
if (start) {
  // 省略 ...
  if (end) {
    match.unarySlash = end[1]
    advance(end[0].length)
    match.end = index
    return match
  }
}
```

这里首先判断了变量 `end` 是否为真，我们知道，即使匹配到了开始标签的 `开始部分` 以及 `属性部分` 但是却没有匹配到开始标签的 `结束部分`，则说明这根本就不是一个开始标签。所以只有当变量 `end` 存在，即匹配到了开始标签的 `结束部分` 时，才能说明这是一个完整的开始标签。

如果变量 `end` 的确存在，那么将会执行 `if` 语句块内的代码，不过我们需要先了解一下变量 `end` 的值是什么？变量 `end` 的值是正则 `startTagClose` 的匹配结果，前面我们讲到过该正则用来匹配开始标签的结束部分即 `>` 或者 `/>`(当标签为一元标签时)，并且拥有一个捕获组用来捕获 `/`，比如当 `html` 字符串如下时：

```html
<br />
```

那么匹配到的 `end` 的值为：

```js
end = ['/>', '/']
```

如果 `html` 字符串如下：

```js
<div>
```

那么 `end` 的值将是：

```js
end = ['>', undefined]
```

所以，如果 `end[1]` 不为 `undefined`，那么说明该标签是一个一元标签。那么现在再看 `if` 语句块内的代码，将很容易理解，首先在 `match` 对象上添加 `unarySlash` 属性，其值为 `end[1]`：

```js
match.unarySlash = end[1]
```

然后调用 `advance` 函数，参数为 `end[0].length`，接着在 `match` 对象上添加了一个 `end` 属性，它的值为 `index`，注意由于先调用的 `advance` 函数，所以此时的 `index` 已经被更新了。最后将 `match` 对象作为 `parseStartTag` 函数的返回值返回。

我们发现只有当变量 `end` 存在时，即能够确定确实解析到了一个开始标签的时候 `parseStartTag` 函数才会有返回值，并且返回值是 `match` 对象，其他情况下 `parseStartTag` 全部返回 `undefined`。

下面我们整理一下 `parseStartTag` 函数的返回值，即 `match` 对象。当成功地匹配到一个开始标签时，假设有如下 `html` 字符串：

```html
<div v-if="isSucceed" v-for="v in map"></div>
```

则 `parseStartTag` 函数的返回值如下：

```js
match = {
  tagName: 'div',
  attrs: [
    [
      ' v-if="isSucceed"',
      'v-if',
      '=',
      'isSucceed',
      undefined,
      undefined
    ],
    [
      ' v-for="v in map"',
      'v-for',
      '=',
      'v in map',
      undefined,
      undefined
    ]
  ],
  start: index,
  unarySlash: undefined,
  end: index
}
```

注意 `match.start` 和 `match.end` 是不同的，如下图：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-12-28-080651.jpg)

### handleStartTag 函数处理解析结果

我们讲解完了 `parseStartTag` 函数及其返回值，现在我们回到对开始标签的 `parse` 部分：

```js
// Start tag:
const startTagMatch = parseStartTag()
if (startTagMatch) {
  handleStartTag(startTagMatch)
  if (shouldIgnoreFirstNewline(lastTag, html)) {
    advance(1)
  }
  continue
}
```

`startTagMatch` 常量存储着 `parseStartTag` 函数的返回值，在前面的分析中我们得知，只有在成功匹配到开始标签的情况下 `parseStartTag` 才会返回解析结果(一个对象)，否则返回 `undefined`。也就是说如果匹配失败则不会执行 `if` 语句块，现在我们假设匹配成功，那么 `if` 语句块中的代码将会被执行，此时会将解析结果作为参数传递给 `handleStartTag` 函数，`handleStartTag` 函数定义在 `parseStartTag` 函数的下方，源码如下：

```js
function handleStartTag (match) {
  const tagName = match.tagName
  const unarySlash = match.unarySlash

  if (expectHTML) {
    if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
      parseEndTag(lastTag)
    }
    if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
      parseEndTag(tagName)
    }
  }

  const unary = isUnaryTag(tagName) || !!unarySlash

  const l = match.attrs.length
  const attrs = new Array(l)
  for (let i = 0; i < l; i++) {
    const args = match.attrs[i]
    // hackish work around FF bug https://bugzilla.mozilla.org/show_bug.cgi?id=369778
    if (IS_REGEX_CAPTURING_BROKEN && args[0].indexOf('""') === -1) {
      if (args[3] === '') { delete args[3] }
      if (args[4] === '') { delete args[4] }
      if (args[5] === '') { delete args[5] }
    }
    const value = args[3] || args[4] || args[5] || ''
    const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
      ? options.shouldDecodeNewlinesForHref
      : options.shouldDecodeNewlines
    attrs[i] = {
      name: args[1],
      value: decodeAttr(value, shouldDecodeNewlines)
    }
  }

  if (!unary) {
    stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
    lastTag = tagName
  }

  if (options.start) {
    options.start(tagName, attrs, unary, match.start, match.end)
  }
}
```

`handleStartTag` 函数用来处理开始标签的解析结果，所以它接收 `parseStartTag` 函数的返回值作为参数。`handleStartTag` 函数的一开始定义两个常量：`tagName` 以及 `unarySlash`：

```js
const tagName = match.tagName
const unarySlash = match.unarySlash
```

这两个常量的值都来自于开始标签的匹配结果，以下我们统一将开始标签的匹配结果称为 `match` 对象。其中常量 `tagName` 为开始标签的标签名，常量 `unarySlash` 的值为 `'/'` 或 `undefined` 。

接着是一个 `if` 语句块，`if` 语句的判断条件是 `if (expectHTML)`，前面说过 `expectHTML` 是 `parser` 选项，是一个布尔值，如果为真则该 `if` 语句块的代码将被执行。但是现在我们暂时不看这段代码，因为这段代码包含 `parseEndTag` 函数的调用，所以待我们讲解完 `parseEndTag` 函数之后，再回头来说这段代码。

再往下，定义了三个常量：

```js
const unary = isUnaryTag(tagName) || !!unarySlash

const l = match.attrs.length
const attrs = new Array(l)
```

其中常量 `unary` 是一个布尔值，当它为真时代表着标签是一元标签，否则是二元标签。对于一元标签判断的方法是首先调用 `isUnaryTag` 函数，并将标签名(`tagName`)作为参数传递，其中 `isUnaryTag` 函数前面提到过它是 `parser` 选项，实际上它是编译器选项透传过来的，我们在 [Vue的编译器初探](./80vue-compiler-start.md) 一节中对 `isUnaryTag` 函数有过讲解，简单的说 `isUnaryTag` 函数能够判断标准 `HTML` 中规定的那些一元标签，但是仅仅使用这一个判断条件是不够的，因为在 `Vue` 中我们免不了会写组件，而组件又是以自定义标签的形式存在的，比如：

```js
<my-component />
```

对于这个标签，它的 `tagName` 是 `my-component`，由于它并不存在于标准 `HTML` 所规定的一元标签之内，所以此时调用 `isUnaryTag('my-component')` 函数会返回假，但问题是 `<my-component />` 标签确实是一元标签，所以此时需要第二个判断条件，即：**开始标签的结束部分是否使用 '/'**，如果有反斜线 `'/'`，说明这是一个一元标签。

除了 `unary` 常量之外，还定义了两个常量：`l` 和 `attrs`，其中常量 `l` 的值存储着 `match.attrs` 数组的长度，而 `attrs` 常量则是一个与 `match.attrs` 数组长度相等的数组。这两个常量将被用于接下来的 `for` 循环中：

```js
for (let i = 0; i < l; i++) {
  const args = match.attrs[i]
  // hackish work around FF bug https://bugzilla.mozilla.org/show_bug.cgi?id=369778
  if (IS_REGEX_CAPTURING_BROKEN && args[0].indexOf('""') === -1) {
    if (args[3] === '') { delete args[3] }
    if (args[4] === '') { delete args[4] }
    if (args[5] === '') { delete args[5] }
  }
  const value = args[3] || args[4] || args[5] || ''
  const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
    ? options.shouldDecodeNewlinesForHref
    : options.shouldDecodeNewlines
  attrs[i] = {
    name: args[1],
    value: decodeAttr(value, shouldDecodeNewlines)
  }
}
```

这个 `for` 循环的作用是：**格式化 `match.attrs` 数组，并将格式化后的数据存储到常量 `attrs` 中**。格式化包括两部分，第一：格式化后的数据只包含 `name` 和 `value` 两个字段，其中 `name` 是属性名，`value` 是属性的值。第二：对属性值进行 `html` 实体的解码。

下面我们具体看一下循环体的代码，首先定义 `args` 常量，它的值就是每个属性的解析结果，即 `match.attrs` 数组中的元素对象。接着是一个 `if` 语句块，其第一个判断条件是 `IS_REGEX_CAPTURING_BROKEN` 为真，在本节的常量部分我们遇到过 `IS_REGEX_CAPTURING_BROKEN` 常量，它是一个布尔值，是用来判断老版本火狐浏览器的一个 `bug` 的，即当捕获组匹配不到值时那么捕获组对应变量的值应该是 `undefined` 而不是空字符串。所以 `if` 语句块对此做了变通方案，如果发现此时捕获到的属性值为空字符串那么就手动使用 `delete` 操作符将其删除。

在 `if` 语句块的下面定义了常量 `value`：

```js
const value = args[3] || args[4] || args[5] || ''
```

我们在分析开始标签的解析结果时知道，解析结果是一个数组，如下：

```js
[
  ' v-if="isSucceed"',
  'v-if',
  '=',
  'isSucceed',
  undefined,
  undefined
]
```

我们知道，数组的第 `4`、`5`、`6` 项其中之一可能会包含属性值，所以常量 `value` 中就保存着最终的属性值，如果第 `4`、`5`、`6` 项都没有获取到属性值，那么属性值将被设置为一个空字符串：`''`。

属性值获取到了之后，就可以拼装最终的 `attrs` 数组了，如下：

```js
const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
  ? options.shouldDecodeNewlinesForHref
  : options.shouldDecodeNewlines
attrs[i] = {
  name: args[1],
  value: decodeAttr(value, shouldDecodeNewlines)
}
```

与我们之前所说的一样，`attrs` 数组的每个元素对象只包含两个元素，即属性名 `name` 和属性值 `value`，对于属性名直接从 `args[1]` 中即可获取，但我们发现属性值却没有直接使用前面获取到的 `value`，而是将 `value` 传递给了 `decodeAttr` 函数，并使用该函数的返回值作为最终的属性值。

实际上 `decodeAttr` 函数的作用是对属性值中所包含的 `html` 实体进行解码，将其转换为实体对应的字符。更多关于 `shouldDecodeNewlinesForHref` 与 `shouldDecodeNewlines` 的内容我们曾经提到过，大家可以在附录 [platforms/web/util 目录下的工具方法全解](../appendix/web-util.md) 中找到详细讲解。

这样 `for` 循环语句块的代码我们就讲完了，在 `for` 循环语句块的下面是这样一段代码：

```js
if (!unary) {
  stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
  lastTag = tagName
}
```

判断条件是当开始标签是非一元标签时才会执行，其目的是：**如果开始标签是非一元标签，则将该开始标签的信息入栈，即 `push` 到 `stack` 数组中，并将 `lastTag` 的值设置为该标签名**。在讲解 `parseHTML` 函数开头定义的变量和常量的过程中，我们讲解过 `stack` 常量以及 `lastTage` 变量，其目的是将来判断是否缺少闭合标签，并且现在大家应该知道为什么 `lastTag` 所存储的标签名字始终保存着 `stack` 栈顶的元素了。

`handleStartTag` 函数的最后一段代码是调用 `parser` 钩子函数的：

```js
if (options.start) {
  options.start(tagName, attrs, unary, match.start, match.end)
}
```

如果 `parser` 选项中包含 `options.start` 函数，则调用之，并将开始标签的名字(`tagName`)，格式化后的属性数组(`attrs`)，是否为一元标签(`unary`)，以及开始标签在原 `html` 中的开始和结束位置(`match.start` 和 `match.end`) 作为参数传递。

### parse 结束标签

接下来我们将会讲解 `textEnd === 0` 时的最后一种情况，即可能是结束标签，`parse` 结束标签的代码如下：

```js
// End tag:
const endTagMatch = html.match(endTag)
if (endTagMatch) {
  const curIndex = index
  advance(endTagMatch[0].length)
  parseEndTag(endTagMatch[1], curIndex, index)
  continue
}
```

首先调用 `html` 字符串的 `match` 函数匹配正则 `endTag`，将结果保存在常量 `endTagMatch` 中。正则 `endTag` 用来匹配结束标签，并且拥有一个捕获组用来捕获标签名字，比如有如下 `html` 字符串：

```html
<div></div>
```

则匹配后 `endTagMatch` 如下：

```js
endTagMatch = [
  '</div>',
  'div'
]
```

第一个元素是整个匹配到的结束标签字符串，第二个元素是对应的标签名字。如果匹配成功 `if` 语句块的代码将被执行，首先使用 `curIndex` 常量存储当前 `index` 的值，然后调用 `advance` 函数，并以 `endTagMatch[0].length` 作为参数，接着调用了 `parseEndTag` 函数对结束标签进行解析，传递给 `parseEndTag` 函数的三个参数分别是：标签名以及结束标签在 `html` 字符串中起始和结束的位置，最后调用 `continue` 语句结束此次循环。

关键点在于 `parseEndTag` 函数，它定义在 `handleStartTag` 函数的下面：

```js
function parseEndTag (tagName, start, end) {
  let pos, lowerCasedTagName
  if (start == null) start = index
  if (end == null) end = index

  if (tagName) {
    lowerCasedTagName = tagName.toLowerCase()
  }

  // Find the closest opened tag of the same type
  if (tagName) {
    for (pos = stack.length - 1; pos >= 0; pos--) {
      if (stack[pos].lowerCasedTag === lowerCasedTagName) {
        break
      }
    }
  } else {
    // If no tag name is provided, clean shop
    pos = 0
  }

  if (pos >= 0) {
    // Close all the open elements, up the stack
    for (let i = stack.length - 1; i >= pos; i--) {
      if (process.env.NODE_ENV !== 'production' &&
        (i > pos || !tagName) &&
        options.warn
      ) {
        options.warn(
          `tag <${stack[i].tag}> has no matching end tag.`
        )
      }
      if (options.end) {
        options.end(stack[i].tag, start, end)
      }
    }

    // Remove the open elements from the stack
    stack.length = pos
    lastTag = pos && stack[pos - 1].tag
  } else if (lowerCasedTagName === 'br') {
    if (options.start) {
      options.start(tagName, [], true, start, end)
    }
  } else if (lowerCasedTagName === 'p') {
    if (options.start) {
      options.start(tagName, [], false, start, end)
    }
    if (options.end) {
      options.end(tagName, start, end)
    }
  }
}
```

`parseEndTag` 函数的代码看上去很长，但实际上它所做的事情并没有想象的那么复杂。按照通常的逻辑，在调用 `parseEndTag` 函数之前已经获得到了结束标签的名字以及结束标签在原始 `html` 字符串中的起始和结束位置，所以完全可以直接调用 `parser` 钩子 `options.end(tagName, start, end)`，并宣布大功告成。然而实际上 `Vue` 的 `html parser` 并没有这样做，而是又调用了 `parseEndTag` 函数，那说明必然有其他的事情需要处理，到底是什么事情呢？我们可以想象一下 `parseEndTag` 函数都会做什么事情，首先 `parseEndTag` 函数的执行说明此时正在 `parse` 结束标签，假设我们有如下 `html` 字符串：

```html
<article><section><div></section></article>
```

很明显，`<div>` 标签缺少结束标签：`</div>`，那么此时是不是应该给用户一个提示？而这就是 `parseEndTag` 函数所做的事情之一。除此之外我们再看如下 `html` 字符串：

```html
<article><section></section></article><div>
```

在解析这段 `html` 字符串的时候，首先会遇到两个非一元标签的开始标签，即 `<article>` 和 `<section>`，并将这两个标签 `push` 到 `stack` 栈中。然后会依次遇到与 `stack` 栈中起始标签相对应的结束标签 `</section>` 和 `</article>`，在解析完这两个结束标签之后 `stack` 栈应该是空栈。紧接着又遇到一个开始标签，也就是 `<div>` 标签，这是一个非一元标签的开始标签，所以会将该标签 `push` 到 `stack` 栈中。这样上面这段 `html` 字符串就解析完成了，大家发现什么问题没有？没错问题就是：**`stack` 栈非空**。`stack` 栈中还残留最后遇到的 `<div>` 开始标签没有被处理，所以 `parseEndTag` 函数的另外一个作用就是处理 `stack` 栈中剩余未被处理的标签。

除了这些功能之外，`parseEndTag` 函数还会做一件事儿，如果你感兴趣你可以在任何 `html` 文件中写下如下内容：

```html
<body>
  </br>
  </p>
</body>
```

上面的 `html` 片段中，我们分别写了 `</br>`、`</p>` 的结束标签，但注意我们并没有写起始标签，然后浏览器是能够正常解析他们的，其中 `</br>` 标签被正常解析为 `<br>` 标签，而 `</p>` 标签被正常解析为 `<p></p>`。除了 `br` 与 `p` 其他任何标签如果你只写了结束标签那么浏览器都将会忽略。所以为了与浏览器的行为相同，`parseEndTag` 函数也需要专门处理 `br` 与 `p` 的结束标签，即：`</br>` 和 `</p>`。

现在我们已经知道了 `parseEndTag` 函数主要有三个作用：

* 检测是否缺少闭合标签
* 处理 `stack` 栈中剩余的标签
* 解析 `</br>` 与 `</p>` 标签，与浏览器的行为相同

当一个函数拥有两个及以上功能的时候，最常用的技巧就是通过参数进行控制，所以 `parseEndTag` 函数也不例外。`parseEndTag` 函数接收三个参数，这三个参数其实都是可选的，根据传参的不同其功能也不同。

可以明确地告诉大家，在 `Vue` 的 `html-parser` 中 `parseEndTag` 函数的使用方式有三种：

* 第一种是处理普通的结束标签，此时 **三个参数都传递**
* 第二种是只传递第一个参数：

```js
parseEndTag(lastTag)
```

只传递一个参数的情况我们前面遇到过，就是在 `handleStartTag` 函数中

* 第三种是 **不传递参数**，当不传递参数的时候，就是我们讲过的，这是在处理 `stack` 栈剩余未处理的标签。

接下来我们就逐步分析 `parseEndTag` 函数的代码，从而明白 `parseEndTag` 函数是如何完成这些事情的。

在 `parseEndTag` 函数的开头是这样一段代码：

```js
let pos, lowerCasedTagName
if (start == null) start = index
if (end == null) end = index
```

定了两个变量：`pos` 和 `lowerCasedTagName`，其中变量 `pos` 会在后面用于判断 `html` 字符串是否缺少结束标签，`lowerCasedTagName` 变量用来存储 `tagName` 的小写版。接着是两句 `if` 语句，当 `start` 和 `end` 不存在时，将这两个变量的值设置为当前字符流的读入位置，即 `index`。所以当我们看到这两个 `if` 语句时，我们就应该能够想到：`parseEndTag` 函数的第二个参数和第三个参数都是可选的，即不传。其实这种使用 `parseEndTag` 函数的方式我们在 `handleStartTag` 函数中见过，当时我们没有对其进行讲解，现在我们可以看一下这段代码了，如下：

```js
if (expectHTML) {
  if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
    parseEndTag(lastTag)
  }
  if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
    parseEndTag(tagName)
  }
}
```

我们知道 `lastTag` 引用的是 `stack` 栈顶的元素，也就是最近(或者说上一次)遇到的开始标签，所以如下判断条件：

```js
lastTag === 'p' && isNonPhrasingTag(tagName)
```

的意思是最近一次遇到的开始标签是 `p` 标签，并且当前正在解析的开始标签必须不能是 **段落式内容(`Phrasing content`)** 模型，这时候 `if` 语句块的代码才会执行，即调用 `parseEndTag(lastTag)`。首先大家要知道每一个 `html` 元素都拥有一个或多个内容模型(`content model`)，其中 `p` 标签本身的内容模型是 **流式内容(`Flow content`)**，并且 `p` 标签的特性是只允许包含 **段落式内容(`Phrasing content`)**。所以条件成立的情况如下：

```html
<p><h2></h2></p>
```

在解析上面这段 `html` 字符串的时候，首先遇到 `p` 标签的开始标签，此时 `lastTag` 被设置为 `p`，紧接着会遇到 `h2` 标签的开始标签，由于 `h2` 标签的内容模型属于非 **段落式内容(`Phrasing content`)** 模型，所以会立即调用 `parseEndTag(lastTag)` 函数闭合 `p` 标签，此时由于强行插入了 `</p>` 标签，所以解析后的字符串将变为如下内容：

```html
<p></p><h2></h2></p>
```

接着，继续解析该字符串，会遇到 `<h2></h2>` 标签并正常解析之，最后解析器会遇到一个单独的 `p` 标签的结束标签，即：`</p>`。这个时候就回到了我们前面讲过的，当解析器遇到 `p` 标签或者 `br` 标签的结束标签时会补全他们，最终 `<p><h2></h2></p>` 这段 `html` 字符串将被解析为：

```html
<p></p><h2></h2><p></p>
```

而这也就是浏览器的行为，以上是第一个 `if` 分支的意义。还有第二个 `if` 分支，它的条件如下：

```js
canBeLeftOpenTag(tagName) && lastTag === tagName
```

以上条件成立的意思是：**当前正在解析的标签是一个可以省略结束标签的标签，并且与上一次解析到的开始标签相同**，如下：

```html
<p>one
<p>two
```

`p` 标签是可以省略结束标签的标签，所以当解析到一个 `p` 标签的开始标签并且下一次遇到的标签也是 `p` 标签的开始标签时，会立即关闭第二个 `p` 标签。即调用：`parseEndTag(tagName)` 函数，然后由于第一个 `p` 标签缺少闭合标签所以会 `Vue` 会给你一个警告。但其实这是不对的，我已经提了PR：[https://github.com/vuejs/vue/pull/7510](https://github.com/vuejs/vue/pull/7510)。

现在我们补充讲解了 `handleStartTag` 函数中遗留未讲解的内容，我们回过头来继续看 `parseEndTag` 函数的代码，接下来是这段代码：

```js
if (tagName) {
  lowerCasedTagName = tagName.toLowerCase()
}
```

这句代码很简单，如果存在 `tagName` 则将其转为小写并保存到之前定义的 `lowerCasedTagName` 变量中。

再往下是这段代码：

```js
// Find the closest opened tag of the same type
if (tagName) {
  for (pos = stack.length - 1; pos >= 0; pos--) {
    if (stack[pos].lowerCasedTag === lowerCasedTagName) {
      break
    }
  }
} else {
  // If no tag name is provided, clean shop
  pos = 0
}
```

用一句话描述上面这段代码的作用：寻找当前解析的结束标签所对应的开始标签在 `stack` 栈中的位置。实现方式是如果 `tagName` 存在，则开启一个 `for` 循环从后向前遍历 `stack` 栈，直到找到相应的位置，并且该位置索引会保存到 `pos` 变量中，如果 `tagName` 不存在，则直接将 `pos` 设置为 `0`。

那么 `pos` 变量是用来干什么的呢？实际上 `pos` 变量会被用来判断是否有元素缺少闭合标签。我们继续查看后面的代码就明白了，即：

```js
if (pos >= 0) {
  // Close all the open elements, up the stack
  for (let i = stack.length - 1; i >= pos; i--) {
    if (process.env.NODE_ENV !== 'production' &&
      (i > pos || !tagName) &&
      !(expectHTML && canBeLeftOpenTag(stack[i].tag)) &&
      options.warn
    ) {
      options.warn(
        `tag <${stack[i].tag}> has no matching end tag.`
      )
    }
    if (options.end) {
      options.end(stack[i].tag, start, end)
    }
  }

  // Remove the open elements from the stack
  stack.length = pos
  lastTag = pos && stack[pos - 1].tag
} else if (lowerCasedTagName === 'br') {
  // ... 省略
} else if (lowerCasedTagName === 'p') {
  // ... 省略
}
```

上面的代码是 `parseEndTag` 函数剩余的全部代码，由三部分组成，即 `if...else if...else if`。首先我们查看 `if` 语句块，当 `pos >= 0` 的时候就会走 `if` 语句块。在 `if` 语句块内开启一个 `for` 循环，同样是从后向前遍历 `stack` 数组，如果发现 `stack` 数组中存在索引大于 `pos` 的元素，那么该元素一定是缺少闭合标签的，这个时候如果是在非生产环境那么 `Vue` 便会打印一句警告，告诉你缺少闭合标签。除了打印一句警告之外，随后会调用 `options.end(stack[i].tag, start, end)` 立即将其闭合，这是为了保证解析结果的正确性。最后更新 `stack` 栈以及 `lastTag`：

```js
// Remove the open elements from the stack
stack.length = pos
lastTag = pos && stack[pos - 1].tag
```

接下来我们看一下后面两个 `else if` 语句块，即：

```js
if (pos >= 0) {
  // ... 省略
} else if (lowerCasedTagName === 'br') {
  if (options.start) {
    options.start(tagName, [], true, start, end)
  }
} else if (lowerCasedTagName === 'p') {
  if (options.start) {
    options.start(tagName, [], false, start, end)
  }
  if (options.end) {
    options.end(tagName, start, end)
  }
}
```

那么什么时候才会执行第二个语句块呢？需要两个条件，第一：`pos >= 0` 不能成立，否则程序将走 `if` 分支，那么什么时候 `pos < 0` 成立呢？我们再次观察下面这段代码：

```js
if (tagName) {
  for (pos = stack.length - 1; pos >= 0; pos--) {
    if (stack[pos].lowerCasedTag === lowerCasedTagName) {
      break
    }
  }
} else {
  // If no tag name is provided, clean shop
  pos = 0
}
```

可以发现，如果 `tagName` 不存在，那么 `pos` 将始终等于 `0`，这样 `pos >= 0` 将永远成立，所以要想使得 `pos < 0` 成立，那么 `tagName` 参数是必然存在的。也就是说 `pos` 要想小于 `0`，那么必须要执行 `for` 循环，可以发现：**当 `tagName` 没有在 `stack` 栈中找到对应的开始标签时，`pos` 为 `-1`**。这样 `pos >= 0` 的条件就不成立了，此时就会判断 `else if` 分支。

现在我们还需要思考一个问题，**当 `tagName` 没有在 `stack` 栈中找到对应的开始标签时** 说明什么问题？我们知道 `tagName` 是当前正在解析的结束标签，结束标签竟然没有找到对应的开始标签？那么也就是说，只写了结束标签而没写开始标签。并且我们可以发现这两个 `else if` 分支的判断条件分别是：

```js
else if (lowerCasedTagName === 'br')
else if (lowerCasedTagName === 'p')
```

也就是说，当你写了 `br` 标签的结束标签：`</br>` 或 `p` 标签的结束标签 `</p>` 时，解析器能够正常解析他们，其中对于 `</br>` 会将其解析为正常的 `<br>` 标签，而 `</p>` 标签也会正常解析为 `<p></p>`。有兴趣的同学可以在任何一个 `html` 文件中写下如下字符串：

```html
<body>
  </div>
  </br>
  </p>
</body>
```

可以发现对于 `</br>` 和 `</p>` 标签浏览器可以将其正常解析为 `<br>` 以及 `<p></p>`，而对于 `</div>` 浏览器会将其忽略。所以 `Vue` 的 `parser` 与浏览器的行为是一致的。

现在我们还剩一个问题没有讲解，即 `parseEndTag` 是如何处理 `stack` 栈中剩余未处理的标签的。其实就是调用 `parseEndTag()` 函数时不传递任何参数，也就是说此时 `tagName` 参数也不存在。这个时候我们再次查看下面的代码：

```js
if (tagName) {
  for (pos = stack.length - 1; pos >= 0; pos--) {
    if (stack[pos].lowerCasedTag === lowerCasedTagName) {
      break
    }
  }
} else {
  // If no tag name is provided, clean shop
  pos = 0
}
```

由于 `tagName` 不存在，所以此时 `pos` 为 `0`，我们知道在这段代码之后会遍历 `stack` 栈，并将 `stack` 栈中元素的索引与 `pos` 作对比。由于 `pos` 为 `0`，所以 `i >= pos` 始终成立，这个时候 `stack` 栈中如果有剩余未处理的标签，则会逐个警告缺少闭合标签，并调用 `options.end` 将其闭合。

## textEnd 大于等于 0 的情况

以上是 `textEnd` 等于 `0` 的情况，此时代表字符 `<` 为字符串的第一个字符，所以会优先作为 **注释标签**、**条件注释**、**开始标识** 以及 **结束标签** 处理，但是即使字符串的第一个字符是 `<` 也不能保证成功匹配以上四种情况，比如字符串 `'< 2'`，这个字符串虽然以 `<` 开头，但他什么标签都不是，这时将会进入另外一个 `if` 语句块的判断，即如下代码：

```js
let text, rest, next
if (textEnd >= 0) {
  rest = html.slice(textEnd)
  while (
    !endTag.test(rest) &&
    !startTagOpen.test(rest) &&
    !comment.test(rest) &&
    !conditionalComment.test(rest)
  ) {
    // < in plain text, be forgiving and treat it as text
    next = rest.indexOf('<', 1)
    if (next < 0) break
    textEnd += next
    rest = html.slice(textEnd)
  }
  text = html.substring(0, textEnd)
  advance(textEnd)
}
```

这段代码用来处理那些第一个字符是 `<` 但没有成功匹配标签，或第一个字符不是 `<` 的字符串。为了更好理解我们可以举个例子，假设 `html` 字符串如下：

```js
html = '0<1<2'
```

如果字符串长成这个样子，那么 `textEnd` 的值应该为 `1`，我们查看 `if` 条件语句内的第一句代码：

```js
rest = html.slice(textEnd)
```

这句代码使用 `textEnd` 截取了字符串 `html` 并将截取后的值赋值给 `rest` 变量，所以此时 `rest` 变量的值应该为 `<1<2`，接着开启一个 `while` 循环，如下：

```js {2-5}
while (
  !endTag.test(rest) &&
  !startTagOpen.test(rest) &&
  !comment.test(rest) &&
  !conditionalComment.test(rest)
) {
  // < in plain text, be forgiving and treat it as text
  next = rest.indexOf('<', 1)
  if (next < 0) break
  textEnd += next
  rest = html.slice(textEnd)
}
```

这个 `while` 循环共有四个条件，这四个条件的作用是什么呢？我们知道截取后的字符串是 `<1<2`，依然是一个以符号 `<` 开头的字符串，所以这个字符串很有可能匹配成标签，而 `while` 循环的条件保证了只有截取后的字符串不能匹配标签的情况下才会执行，这说明符号 `<` 存在于普通文本中。我们看循环内第一句执行的代码，如下：

```js
next = rest.indexOf('<', 1)
```

我们知道此时 `rest` 的值为 `<1<2`，所以上面代码的作用是寻找下一个符号 `<` 的位置，并将位置索引存储在 `next` 变量中。由于字符串 `rest` 的值为 `<1<2`，所以 `next` 值将会为 `2`，它指向字符串 `rest` 第二个 `<` 符号的位置。接着将会执行如下代码：

```js
if (next < 0) break
textEnd += next
rest = html.slice(textEnd)
```

由于 `next` 值为 `2` 不小于 `0`，所以代码会继续执行，可以看到这句代码：`textEnd += next`，更新了 `textEnd` 的值，更新后的 `textEnd` 的值将是第二个 `<` 符号的索引，之后又使用新的 `textEnd` 对原始字符串 `html` 进行截取，并将新截取的字符串赋值给 `rest` 变量，如此往复直到遇到一个能够成功匹配标签的 `<` 符号为止，或者当再也遇不到下一个 `<` 符号时，`while` 循环会 `break`，此时循环也会终止。

当循环终止后，代码会继续执行，来到最后两句：

```js
text = html.substring(0, textEnd)
advance(textEnd)
```

如果字符串 `html` 为 `0<1<2`，我们知道此时 `textEnd` 保存着字符串中第二个 `<` 符号的位置索引，所以当循环终止时变量 `text` 的值将是 `0<1`，接着调用 `advance` 函数。

另外我们可以发现如下高亮部分代码：

```js {9-11}
if (textEnd >= 0) {
  // 省略...
}

if (textEnd < 0) {
  // 省略...
}

if (options.chars && text) {
  options.chars(text)
}
```

根据上例，此时 `text` 的值为字符串 `0<1`，所以这部分字符串将被作为普通字符串处理，如果 `options.chars` 存在，则会调用该钩子函数并将字符串传递过去。

大家也许注意到了，原始的 `html` 被拆分为两部分，其中一部分为 `0<1`，这部分被作为普通文本对待，那么剩余的字符串 `<2` 呢？这部分字符串将会在下一次整体的 `while` 循环处理，此时由于 `html` 字符串的值将被更新为 `<2`，第一个字符为 `<`，所以该字符的索引为 `0`，这时既会匹配 `textEnd` 等于 `0` 的情况，也会匹配 `textEnd` 大于等于 `0` 的情况，但是由于字符串 `<2` 既不能匹配标签，也不会被 `textEnd` 大于等于 `0` 的 `if` 语句块处理，所以代码最终会来到这里：

```js
if (html === last) {
  options.chars && options.chars(html)
  if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
    options.warn(`Mal-formatted tag at end of template: "${html}"`)
  }
  break
}
```

这是整体的 `while` 循环的最后一段代码，由于字符串 `html` (它的值为 `<2`)没有被处理，所以当程序运行到如上这段代码时，条件 `html === last` 将会成立，所以如上这段 `if` 语句块的代码将被执行，可以看到在 `if` 语句块内，执行调用了 `options.chars` 并将整个 `html` 字符串作为普通字符串处理，换句话说最终字符串 `<2` 也会作为普通字符串处理。

另外大家可能注意到了如下这段代码：

```js
if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
  options.warn(`Mal-formatted tag at end of template: "${html}"`)
}
```

这段代码的作用是什么呢？我们想象一下什么情况下会使这段 `if` 语句的条件成立，关键在于第二个条件：`!stack.length`，`stack` 栈为空代表着标签被处理完毕了，但此时仍然有剩余的字符串未处理，举例子假设 `html` 字符串为：`<div></div><a`，在解析这个字符串时首先会成功解析 `div` 的开始标签，此时 `stack` 栈中将存有 `div` 的开始标签，接着会成功解析 `div` 的结束标签，此时 `stack` 栈会被清空，接着会解析剩余的字符串 `<a`，此时由于 `stack` 栈被清空了，所以将满足上面 `if` 语句的判断条件。这时会打印警告信息，提示你 `html` 字符串的结尾不符合标签格式，很显然字符串 `<div></div><a` 是不合法的。

## textEnd 小于 0 的情况

对于 `textEnd` 小于 `0` 的情况，处理方式很简单：

```js
if (textEnd < 0) {
  text = html
  html = ''
}
```

就将整个 `html` 字符串作为文本处理就好了。

## 对纯文本元素的处理

我们再来看一下整体的 `while` 循环，如下：

```js {3-7}
while (html) {
  last = html
  if (!lastTag || !isPlainTextElement(lastTag)) {
    // 省略...
  } else {
    // 省略...
  }

  // 省略...
}
```

在这个 `while` 循环内有一个 `if...else` 语句块，代码被该 `if...else` 语句块分为两部分处理，前面我们所讲的都是 `if` 语句块内的代码，我们知道 `else` 语句块的代码只有当 `lastTag` 存在并且 `lastTag` 为纯文本标签时才会被执行，所以可想而知 `else` 语句块的代码就是用来处理纯文本标签内的内容的，什么是纯文本标签呢？根据 `isPlainTextElement` 函数可知纯文本标签包括 `script` 标签、`style` 标签以及 `textarea` 标签。

下面我们就看一下它是如何处理纯文本标签的内容的，首先我们要明确的一点是 `else` 分支的代码处理的是纯文本标签的 **内容**，并不是纯文本标签。假设我们的 `html` 字符串如下：

```js
html = '<textarea>aaaabbbb</textarea>'
```

该字符串是一个 `textarea` 标签并包含了一些文本，在解析这段字符串的时候首先会遇到开始标签 `<textarea>`，该标签会被正常处理，并且我们知道此时 `lastTag` 变量的值将被设置为 `textarea`，之后 `html` 字符串将变为 `aaaabbbb</textarea>`，接着以新的 `html` 字符串重新执行 `while` 循环，此时当遇到如下 `if` 语句块时：

```js
if (!lastTag || !isPlainTextElement(lastTag)) {
  // 省略...
} else {
  // 省略...
}
```

由于 `lastTag` 的值为 `textarea`，并且 `textarea` 标签为纯文本标签，所以会执行 `else` 分支的代码。在 `else` 语句块内首先定义了一个变量和两个常量，如下：

```js
let endTagLength = 0
const stackedTag = lastTag.toLowerCase()
const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
```

变量 `endTagLength` 的初始值为 `0`，后面我们会看到 `endTagLength` 变量用来保存纯文本标签闭合标签的字符长度。`stackedTag` 常量的值为纯文本标签的小写版，`reStackedTag` 常量稍微复杂一些，它的值是一个正则表达式实例，并且使用 `reCache[stackedTag]` 做了缓存，我们看一下 `reStackedTag` 正则的作用是什么，如下：

```js
new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
```

该正则表达式中使用到了 `stackedTag` 常量，我们假设纯文本标签是 `textarea`，那么 `stackedTag` 常量的值也应该是 `textarea`，所以此时正则表达式应该为：

```js
new RegExp('([\\s\\S]*?)(</textarea[^>]*>)', 'i'))
```

该正则表达式由两个分组组成，我们先看第一个分组，`\s` 用来匹配空白符，而 `\S` 则用来匹配非空白符，由于二者同时存在于中括号(`[]`)中，所以它匹配的是二者的并集，也就是字符全集，大家注意中括号后面的 `*?`，其代表懒惰模式，也就是说只要第二个分组的内容匹配成功就立刻停止匹配。可以发现第一个分组的内容用来匹配纯文本标签的内容。第二个分组很简单它用来匹配纯文本标签的结束标签。总的来说正则 `reStackedTag` 的作用是用来匹配纯文本标签的内容以及结束标签的。

接着代码来到这里：

```js
const rest = html.replace(reStackedTag, function (all, text, endTag) {
  endTagLength = endTag.length
  if (shouldIgnoreFirstNewline(stackedTag, text)) {
    text = text.slice(1)
  }
  if (options.chars) {
    options.chars(text)
  }
  return ''
})
```

这段代码使用正则 `reStackedTag` 匹配字符串 `html` 并将其替换为空字符串，我们可以注意到 `replace` 函数的回调函数返回值为空字符串。还是拿前面的例子，此时 `html` 的值为字符串 `aaaabbbb</textarea>`，可以看到该字符串将被 `reStackedTag` 正则完全匹配，并将其替换为空字符串，所以最终 `rest` 常量的值就为空字符串。但是假如 `html` 字符串为 `aaaabbbb</textarea>ddd`，我们发现在 `</textarea>` 标签的后面还有三个字符 `ddd`，如果这个字符串使用 `reStackedTag` 进行匹配替换，可知常量 `rest` 的值将是字符串 `ddd`，总之常量 `rest` 将保存剩余的字符。

接下来我们看一下 `replace` 函数的回调函数内的代码，回调函数接收三个参数，其中参数 `all` 保存着整个匹配的字符串，即：`aaaabbbb</textarea>`。参数 `text` 为第一个捕获组的值，也就是纯文本标签的内容，即：`aaaabbbb`。参数 `endTag` 保存着结束标签，即：`</textarea>`。在回调函数内部，首先使用结束标签的字符长度更新了 `endTagLength` 的值，然后执行了一个 `if` 语句块，如下：

```js
if (shouldIgnoreFirstNewline(stackedTag, text)) {
  text = text.slice(1)
}
```

我们前面遇到过类似的 `if` 语句块，其作用是忽略 `<pre>` 标签和 `<textarea>` 标签的内容中的第一个换行符。在这段 `if` 语句块的下面是如下代码：

```js
if (options.chars) {
  options.chars(text)
}
```

这段代码的作用很明显，将纯文本标签的内容全部作为纯文本对待。

回过头来继续看 `else` 分支的代码，如下是 `else` 语句块最后的几句代码：

```js
index += html.length - rest.length
html = rest
parseEndTag(stackedTag, index - endTagLength, index)
```

上面的代码中，首先更新 `index` 的值，用 `html` 原始字符串的值减去 `rest` 字符串的长度，我们知道 `rest` 常量保存着剩余的字符串，所以二者的差就是被替换掉的那部分字符串的字符数。接着将 `rest` 常量的值赋值给 `html`，所以如果有剩余的字符串的话，它们将在下一次 `while` 循环被处理，最后调用 `parseEndTag` 函数解析纯文本标签的结束标签，这样就大功告成了。

可以发现对于纯文本标签的处理宗旨就是将其内容作为纯文本对待。

## parseHTML 的使用

以上对于整个词法分析的过程我们就讲解完毕了，我们发现其实现方式就是通过读取字符流配合正则一点一点的解析字符串，直到整个字符串都被解析完毕为止。并且每当遇到一个特定的 `token` 时都会调用相应的钩子函数，同时将有用的参数传递过去。比如每当遇到一个开始标签都会调用 `options.start` 钩子函数，并传递给该钩子五个参数，所以我们可以像如下这样使用 `html-parser.js` 文件中的 `parseHTML` 函数：

```js
import { parseHTML } from './html-parser'

parseHTML(templateString, {
  // ...其他选项参数
  start (tagName, attrs, unary, start, end) {
    console.log('tagName: ', tagName)
    console.log('attrs: ', attrs)
    console.log('unary: ', unary)
    console.log('start: ', start)
    console.log('end: ', end)
  }
})
```

上面的代码中我们调用了 `parseHTML` 函数，并传递了两个参数，分别是模板字符串 `templateString` 以及一些选项参数，并且这些选项参数中包含 `start` 钩子函数，假如我们的模板字符串如下：

```js
templateString = '<div v-for="item of list" @click="handleClick">普通文本</div>'
```

那么 `start` 钩子函数将被调用，其 `console.log` 语句将得到如下输出：

* tagName

它的值为开始标签的的名字：`'div'`。

* attrs

它是一个数组，包含所有属于该标签的属性：

```js
[
  {
    name: 'v-for',
    value: 'item of list'
  },
  {
    name: '@click',
    value: 'handleClick'
  }
]
```

* unary

它是一个布尔值，代表该标签是否是一元标签，由于 `div` 标签是非一元标签，所以 `unary` 的值将为 `false`。

* start

它的值为开始标签第一个字符在整个模板字符串中的位置，所以是 `0`。

* end

注意，`end` 的值为开始标签最后一个字符在整个模板字符串中的位置加 `1`，所以是 `47`。

同样的，如果我们在调用 `parseHTML` 函数时传递了 `end` 钩子函数，该函数同样会被调用：

```js {6-10}
parseHTML(templateString, {
  // ...其他选项参数
  start (tagName, attrs, unary, start, end) {
    // ...
  },
  end (tagName, start, end) {
    console.log('tagName: ', tagName)
    console.log('start: ', start)
    console.log('end: ', end)
  }
})
```

`end` 钩子函数会得到三个参数：

* tagName

它的值为结束标签的名字：`'div'`。

* start

它的值为结束标签在整个模板字符串中的位置，所以是：`51`。

* end

它的值同样是结束标签最后一个字符在整个模板字符串中的位置加 `1`，所以是：`57`

另外我们的 `templateString` 模板字符串中的 `div` 标签中包含一段普通文本，所以如果我们在调用 `parseHTML` 时传递了 `chars` 钩子函数，那么 `chars` 钩子函数也将会被调用：

```js {9-11}
parseHTML(templateString, {
  // ...其他选项参数
  start (tagName, attrs, unary, start, end) {
    // ...
  },
  end (tagName, start, end) {
    // ...
  },
  chars (text) {
    console.log('text: ', text)
  }
})
```

`chars` 钩子函数只接收一个参数，即文本内容：

* text

它的值为：`'普通文本'`

最后如果你的模板字符串中包含注释节点，那么在调用 `parseHTML` 函数时可以传递 `comment` 钩子函数：

```js {12-14}
parseHTML(templateString, {
  // ...其他选项参数
  start (tagName, attrs, unary, start, end) {
    // ...
  },
  end (tagName, start, end) {
    // ...
  },
  chars (text) {
    // ...
  },
  comment (text) {
    console.log('text: ', text)
  }
})
```

`comment` 钩子函数也接收一个参数，该参数的值为注释节点的内容。
