## Vue 中的 html-parser

打开 `src/compiler/parser/html-parser.js` 文件，该文件的开头是一段注释：

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

通过这段注释我们可以了解到，`Vue` 的 `html parser` 的灵感来自于 [John Resig 所写的一个开源项目：http://erik.eae.net/simplehtmlparser/simplehtmlparser.js](http://erik.eae.net/simplehtmlparser/simplehtmlparser.js)，实际上，我们上一小节所讲的小例子就是在这个项目的基础上所做的修改。`Vue` 在此基础上做了很多完善的工作，下面我们就探究一下 `Vue` 中的 `html parser` 都做了哪些事情。

#### 正则分析

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
const comment = /^<!--/
const conditionalComment = /^<!\[/
```

下面我们依次来看一下这些正则：

##### attribute

这与上之前我们讲解的小例子中所定义的正则的作用基本是一致的，只不过 `Vue` 所定义的正则更加严谨和完善，我们一起看一下这些正则的作用。首先是 `attribute` 常量：

```js
// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
```

`attribute` 顾名思义，这个正则的作用是用来匹配标签的属性(`attributes`)的，如下图所示：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-12-04-111.jpg)

我们在观察一个复杂表达式的时候，主要就是要观察它有几个分组(准确的说应该是有几个捕获的分组)，通过上图我们能够清晰的看到，这个表达式有五个捕获组，第一个捕获组用来匹配属性名，第二个捕获组用来匹配等于号，第三、第四、第五个捕获组都是用来匹配属性值的，这是因为在 `html` 标签中有三种写属性值的方式：

* 1、使用双引号把值引起来：`class="some-class"`
* 2、使用单引号把值引起来：`class='some-class'`
* 3、不适用引号：`class=some-class`

正因如此，需要三个正则分组分别匹配三种情况，我们可以对这个正则做一个测试，如下：

```js
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
console.log('class="some-class"'.match(attribute))  // 测试双引号
console.log("class='some-class'".match(attribute))  // 测试单引号
console.log('class=some-class'.match(attribute))  // 测试无引号
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

所以通过以上结果我们很容易想到当属性值被单引号起来和不使用引号的情况，所得到的匹配结果是什么，变化主要就在匹配结果数组的第 `3`、`4`、`5` 个元素，匹配到哪种情况，那么对应的位置就是属性值，其他位置则是 `undefined`，如下：

```js
// 对于单引号的情况
[
    'class="some-class"',
    'class',
    '=',
    undefined,
    'some-class',
    undefined
]
// 对于没有引号
[
    'class="some-class"',
    'class',
    '=',
    undefined,
    undefined,
    'some-class'
]
```

##### ncname

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

我们可以在 `Vue` 的源码中看到其给出了一个连接：[https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName](https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName)，其实 `qname` 就是：`<前缀:标签名称>`，也就是合法的XML标签。

了解了这些，我们再来看 `ncname` 的正则表达式，它定了 `ncname` 的合法组成，这个正则所匹配的内容很简单：*字母、数字或下划线开头，后面可以跟任意数量的字符、中横线和 `.`*。

##### qnameCapture

下一个正则是 `qnameCapture`，`qnameCapture` 同样是普通字符串，只不过将来会用在 `new RegExp()` 中：

```js
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
```

我们知道 `qname` 实际上就是合法的标签名称，它是有可选项的 `前缀`、`冒号` 以及 `名称` 组成，观察 `qnameCapture` 可知它有一个捕获分组，捕获的内容就是整个 `qname` 名称，即整个标签的名称。

##### startTagOpen

`startTagOpen` 是一个真正使用 `new RegExp()` 创建出来的正则表达式：

```js
const startTagOpen = new RegExp(`^<${qnameCapture}`)
```

用来匹配开始标签的一部分，这部分包括：`<` 以及后面的 `标签名称`，这个表达式的创建用到了上面定义的 `qnameCapture` 字符串，所以 `qnameCapture` 这个字符串中所设置的捕获分组，在这里同样适用，也就是说 `startTagOpen` 这个正则表达式也会有一个捕获的分组，用来捕获匹配的标签名称。

##### startTagClose

```js
const startTagClose = /^\s*(\/?)>/
```

`startTagOpen` 用来匹配开始标签的 `<` 以及标签的名字，但是并不包过开始标签的闭合部分，即：`>` 或者 `/>`，由于标签可能是一元标签，所以开始标签的闭合部分有可能是 `/>`，比如：`<br />`，如果不是一元标签，此时就应该是：`>`

观察 `startTagClose` 可知，这个正则拥有一个捕获分组，用来捕获开始标签结束部分的斜杠：`/`。

##### endTag

```js
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
```

`endTag` 这个正则用来匹配结束标签，由于该正则同样使用了字符串 `qnameCapture`，所以这个正则也拥有了一个捕获组，用来捕获标签名称。

##### doctype

```js
const doctype = /^<!DOCTYPE [^>]+>/i
```

这个正则用来匹配文档的 `DOCTYPE` 标签，没有捕获组。

##### comment

```js
const comment = /^<!--/
```

这个正则用来匹配注释节点，没有捕获组。

##### conditionalComment

```js
const conditionalComment = /^<!\[/
```

这个正则用来匹配条件注释节点，没有捕获组。

最后很重要的地点是，大家主要，这些正则表达式有一个共同的特点，即：*他们都是从一个字符串的开头位置开始匹配的，因为有 `^` 的存在*。

在这些正则常量的下面，有着这样一段代码：

```js
let IS_REGEX_CAPTURING_BROKEN = false
'x'.replace(/x(.)?/g, function (m, g) {
  IS_REGEX_CAPTURING_BROKEN = g === ''
})
```

首先定义了变量 `IS_REGEX_CAPTURING_BROKEN` 且初始值为 `false`，接着使用一个字符串 `'x'` 的 `replace` 函数用一个正则去获取捕获组的值，即：变量 `g`。我们观察字符串 `'x'` 和正则 `/x(.)?/` 可以发现，该正则中的捕获组应该捕获不到任何内容，所以此时 `g` 的值应该是 `undefined`，但是在老版本的火狐浏览器中存在一个问题，此时的 `g` 是一个空字符串 `''`，并不是 `undefined`。所以变量 `IS_REGEX_CAPTURING_BROKEN` 的作用就是用来标识当前宿主环境是否存在该问题。这个变量我们后面会用到，其作用到时候再说。

#### 常量分析

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

首先是 `isPlainTextElement` 常量是一个函数，它是通过 `makeMap` 函数生成的，用来检测给定的标签名字是不是纯文本标签（包括：`script`、`style`、`textarea`）。

然后定义了 `reCache` 常量，它被初始化为一个空的 `JSON` 对象字面量。

再往下定义了 `decodingMap` 常量，它也是一个 `JOSN` 对象字面量，其中 `key` 是一些特殊的 `html` 实体，值则是这些实体对应的字符。在 `decodingMap` 常量下面的是两个正则常量：`encodedAttr` 和 `encodedAttrWithNewLines`。可以发现正则 `encodedAttrWithNewLines` 会比 `encodedAttr` 多匹配两个 `html` 实体字符，分别是 `&#10;` 和 `&#9;`。对于 `decodingMap` 以及下面两个正则的作用不知道大家能不能猜得到，其实我们 [创建编译器](http://localhost:8080/#/note/7Vue%E7%9A%84%E7%BC%96%E8%AF%91%E5%99%A8%E5%88%9D%E6%8E%A2) 一节中有讲到 `shouldDecodeNewlines` 和 `shouldDecodeNewlinesForHref` 这两个编译器选项，当时我们就有针对这两个选项作用的讲解，可以再附录 [platforms/web/util 目录下的工具方法全解](http://localhost:8080/#/note/%E9%99%84%E5%BD%95/web-util?id=compat-js-%E6%96%87%E4%BB%B6) 中查看。

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

#### parseHTML

接下来，将进入真正的 `parse` 阶段，这个阶段我们将看到如何将 `html` 字符串作为字符输入流，并且按照一定的规则将其逐步消化分解。这也是我们本节的重点，同时接下来我们要分析的函数也是 `compiler/parser/html-parser.js` 文件所导出的函数，即 `parseHTML` 函数，这个函数的内容非常多，但其实它还是很有条理的，下面就是对 `parseHTML` 函数的简化和注释，这能够让你更好的把握 `parseHTML` 函数的意图：

```js
export function parseHTML (html, options) {
  const stack = []  // 在处理 html 字符流的时候每当遇到一个非一元标签，都会将该标签 push 到该数组
  const expectHTML = options.expectHTML // options 选项，一个布尔值
  const isUnaryTag = options.isUnaryTag || no // options 选项，用来判断给定标签是否是一元标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no // options 选项，用来检查标签是否是一个：可以省略结束标签的非一元标签
  let index = 0 // index 变量存储着当前字符流的读入位置
  let last, lastTag // last 变量存储剩余未 parse 的 html 字符； // lastTag: 每当遇到一个非一元标签时，就将 lastTag 设置为该标签名

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

总体上说，我们可以把 `parseHTML` 函数分为三个部分，第一部分即函数开头定义的一些常量和变量，第二部分是一个 `while` 循环，第三部分则是 `while` 循环之后定义的一些函数。我们分别来看，首先是第一部分，也就是 `parseHTML` 函数开头所定义的常量和变量，如下：

```js
const stack = []
const expectHTML = options.expectHTML
const isUnaryTag = options.isUnaryTag || no
const canBeLeftOpenTag = options.canBeLeftOpenTag || no
let index = 0
let last, lastTag
```

第一个常量是 `stack`，它被初始化为一个空数组，在 `while` 循环中处理 `html` 字符流的时候每当遇到一个**非一元标签**，都会将该开始标签 `push` 到该数组。那么它的作用是什么呢？大家思考一个问题：在一个 `html` 字符串中，如何判断一个非一元标签是否缺少结束标签？

假设我们有如下 `html` 字符串：

```html
<article><section><div></section></article>
```

在 `parse` 这个字符串的时候，首先会遇到 `article` 开始标签，并将该标签入栈(`push` 到 `stack` 数组)，然后会遇到 `section` 开始标签，并将该标签 `push` 到栈顶，接下来会遇到 `div` 开始标签，同样被压入栈顶，注意此时 `stack` 数组内包含三个元素，如下：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-12-25-070202.jpg)

再然后便会遇到 `section` 结束标签，我们知道：**最先遇到的结束标签，应该最后被压入 stack 栈**，也就是说此时 `stack` 栈顶的元素应该是 `section`，但是我们发现事实上 `stack` 栈顶并不是 `section` 而是 `div`，这说明 `div` 元素缺少闭合标签。这就是检测 `html` 字符串中是否缺少闭合标签的原理。









