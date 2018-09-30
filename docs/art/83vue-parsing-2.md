# 句法分析 - 生成真正的AST(二)

鉴于篇幅的原因，本章将继承上一章的内容，继续讲解 `AST` 的生成。

## 彻底理解解析属性值的方式

接下来我们要讲解的就是 `processElement` 函数中调用的最后一个 `process*` 函数，它就是 `processAttrs` 函数，这个函数是用来处理元素描述对象的 `el.attrsList` 数组中剩余的所有属性的。到目前为止我们已经讲解过的属性有：

* `v-pre`
* `v-for`
* `v-if`、`v-else-if`、`v-else`
* `v-once`
* `key`
* `ref`
* `slot`、`slot-scope`、`scope`、`name`
* `is`、`inline-template`

以上这些属性的解析我们已经全部讲解过了，我们能够发现一些规律，比如在获取这些属性的值的时候，要么使用 `getAndRemoveAttr` 函数，要么就使用 `getBindingAttr` 函数，但是无论使用哪个函数，其共同的行为是：**在获取到特定属性值的同时，还会将该属性从 `el.attrsList` 数组中移除**。所以在调用 `processAttrs` 函数的时候，以上列出来的属性都已经从 `el.attrsList` 数组中移除了。但是 `el.attrsList` 数组中仍然可能存在其他属性，所以这个时候就需要使用 `processAttrs` 函数处理 `el.attrsList` 数组中剩余的属性。

在讲解 `processAttrs` 函数之前，我们来回顾一下现在我们掌握的知识。以如上列出的属性为例，下表中总结了特定的属性与获取该属性值的方式：

| 属性  | 获取属性值的方式 |
| ------------- | ------------- |
| `v-pre`  | `getAndRemoveAttr`  |
| `v-for`  | `getAndRemoveAttr`  |
| `v-if`、`v-else-if`、`v-else`  | `getAndRemoveAttr`  |
| `v-once`  | `getAndRemoveAttr`  |
| `key`  | `getBindingAttr`  |
| `ref`  | `getBindingAttr`  |
| `name`  | `getBindingAttr`  |
| `slot-scope`、`scope`  | `getAndRemoveAttr`  |
| `slot`  | `getBindingAttr`  |
| `is`  | `getBindingAttr`  |
| `inline-template`  | `getAndRemoveAttr`  |

我们发现凡是以 `v-` 开头的属性，在获取属性值的时候都是通过 `getAndRemoveAttr` 函数获取的。而对于没有 `v-` 开头的特性，如 `key`、`ref` 等，在获取这些属性的值时，是通过 `getBindingAttr` 函数获取的，不过 `slot-scope`、`scope` 和 `inline-template` 这三个属性虽然没有以 `v-` 开头，但仍然使用 `getAndRemoveAttr` 函数获取其属性值。但这并不是关键，关键的是我们要知道使用 `getAndRemoveAttr` 和 `getBindingAttr` 这两个函数获取属性值的时候到底有什么区别。

我们知道类似于 `v-for` 或 `v-if` 这类以 `v-` 开头的属性，在 `Vue` 中我们称之为指令，并且这些属性的属性值是默认情况下被当做表达式处理的，比如：

```html
<div v-if="a && b"></div>
```

如上代码在执行的时候 `a` 和 `b` 都会被当做变量，并且 `a && b` 是具有完整意义的表达式，而非普通字符串。并且在解析阶段，如上 `div` 标签的元素描述对象的 `el.attrsList` 属性将是如下数组：

```js
el.attrsList = [
  {
    name: 'v-if',
    value: 'a && b'
  }
]
```

这时，当使用 `getAndRemoveAttr` 函数获取 `v-if` 属性值时，得到的就是字符串 `'a && b'`，但不要忘了这个字符串最终是要运行在 `new Function()` 函数中的，假设是如下代码：

```js
new Function('a && b')
```

那么这句代码等价于：

```js
function () {
  a && b
}
```

可以看到，此时的 `a && b` 已经不再是普通字符串了，而是表达式。

这就意味着 `slot-scope`、`scope` 和 `inline-template` 这三个属性的值，最终也将会被作为表达式处理，而非普通字符串。如下：

```html
<div slot-scope="slotProps"></div>
```

如上代码是使用作用域插槽的典型例子，我们知道这里的 `slotProps` 确实是变量，而非字符串。

那如果使用 `getBindingAttr` 函数获取 `slot-scope` 属性的值会产生什么效果呢？由于 `slot-scope` 并非 `v-bind:slot-scope` 或 `:slot-scope`，所以在使用 `getBindingAttr` 函数获取 `slot-scope` 属性值的时候，将会得到使用 `JSON.stringify` 函数处理后的结果，即：

```js
JSON.stringify('slotProps')
```

这个值就是字符串 `'"slotProps"'`，我们把这个字符串拿到 `new Function()` 中，如下：

```js
new Function('"slotProps"')
```

如上这句代码等价于：

```js
function () {
  "slotProps"
}
```

可以发现此时函数体内只有一个字符串 `"slotProps"`，而非变量。

但并不是说使用了 `getBindingAttr` 函数获取的属性值最终都是字符串，如果该属性是绑定的属性(使用 `v-bind` 或 `:`)，则该属性的值仍然具有 `javascript` 语言的能力。否则该属性的值就是一个普通的字符串。

## processAttrs 处理剩余属性

`processAttrs` 函数是 `processElement` 函数中调用的最后一个 `process*` 系列函数，在这之前已经调用了很多其他的 `process*` 系列函数对元素进行了处理，并且每当处理一个属性时，都会将该属性从元素描述对象的 `el.attrsList` 数组中移除，但 `el.attrsList` 数组中仍然保存着剩余未被处理的属性，而 `processAttrs` 函数就是用来处理这些剩余属性的。

既然 `processAttrs` 函数用来处理剩余未被处理的属性，那么我们首先要确定的是 `el.attrsList` 数组中都包含哪些剩余的属性，如下是前面已经处理过的属性：

* `v-pre`
* `v-for`
* `v-if`、`v-else-if`、`v-else`
* `v-once`
* `key`
* `ref`
* `slot`、`slot-scope`、`scope`、`name`
* `is`、`inline-template`

如上属性中包含了部分 `Vue` 内置的指令(`v-` 开头的属性)，大家可以对照一下 `Vue` 的官方文档，查看其内置的指令，可以发现之前的讲解中不包含对以下指令的解析：

* `v-text`、`v-html`、`v-show`、`v-on`、`v-bind`、`v-model`、`v-cloak`

除了这些指令之外，还有部分属性的处理我们也没讲到，比如 `class` 属性和 `style` 属性，这两个属性比较特殊，因为 `Vue` 对他们做了增强，实际上在“中置处理”(`transforms` 数组)中有对于 `class` 属性和 `style` 属性的处理，这个我们后面会统一讲解。

还有就是一些普通属性的处理了，如下 `html` 代码所示：

```html
<div :custom-prop="someVal" @custom-event="handleEvent" other-prop="static-prop"></div>
```

如上代码所示，其中 `:custom-prop` 是自定义的绑定属性，`@custom-event` 是自定义的事件，`other-prop` 是自定义的非绑定的属性，对于这些内容的处理都是由 `processAttrs` 函数完成的。其实处理自定义绑定属性本质上就是处理 `v-bind` 指令，而处理自定义事件就是处理 `v-on` 指令。

接下来我们具体查看一下 `processAttrs` 函数的源码，看看它是如何处理这些剩余未被处理的指令的。如下是简化后的代码：

```js
function processAttrs (el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, isProp
  for (i = 0, l = list.length; i < l; i++) {
    // 省略...
  }
}
```

可以看到在 `processAttrs` 函数内部，首先定义了 `list` 常量，它是 `el.attrsList` 数组的引用。接着又定义了一系列变量待使用，然后开启了一个 `for` 循环，循环的目的就是遍历 `el.attrsList` 数组，所以我们能够想到在循环内部就是逐个处理 `el.attrsList` 数组中那些剩余的属性。

`for` 循环内部的代码被一个 `if...else` 语句块分成两部分，如下：

```js
for (i = 0, l = list.length; i < l; i++) {
  name = rawName = list[i].name
  value = list[i].value
  if (dirRE.test(name)) {
    // 省略...
  } else {
    // 省略...
  }
}
```

在 `if...else` 语句块之前，分别为 `name`、`rawName` 以及 `value` 变量赋了值，其中 `name` 和 `rawName` 变量中保存的是属性的名字，而 `value` 变量中则保存着属性的值。然后才执行了 `if...else` 语句块，我们来看一下 `if` 条件语句的判断条件：

```js
if (dirRE.test(name))
```

使用 `dirRe` 正则去匹配属性名 `name`，`dirRE` 正则我们前面讲过了，它用来匹配一个字符串是否以 `v-`、`@` 或 `:` 开头，所以如果匹配成功则说明该属性是指令，此时 `if` 语句块内的代码会被执行，否则将执行 `else` 语句块的代码。举个例子，如下 `html` 片段所示：

```html
<div :custom-prop="someVal" @custom-event="handleEvent" other-prop="static-prop"></div>
```

其中 `:custom-prop` 属性和 `@custom-event` 属性将会被 `if` 语句块内的代码处理，而对于 `other-prop` 属性则会被 `else` 语句块内的代码处理。

接下来我们优先看一下如果该属性是一个指令，那么在 `if` 语句块内是如何对该指令进行处理的，如下代码：

```js {9,11,13}
if (dirRE.test(name)) {
  // mark element as dynamic
  el.hasBindings = true
  // modifiers
  modifiers = parseModifiers(name)
  if (modifiers) {
    name = name.replace(modifierRE, '')
  }
  if (bindRE.test(name)) { // v-bind
    // 省略...
  } else if (onRE.test(name)) { // v-on
    // 省略...
  } else { // normal directives
    // 省略...
  }
} else {
  // 省略...
}
```

如果代码执行到了这里，我们能够确认的是该属性是一个指令，如上高亮的三句代码所示，这是一个 `if...elseif...else` 语句块，不难发现 `if` 语句的判断条件是在检测该指令是否是 `v-bind`(包括缩写 `:`) 指令，`elseif` 语句的判断条件是在检测该指令是否是 `v-on`(包括缩写 `@`) 指令，而对于其他指令则会执行 `else` 语句块的代码。后面我们会对这三个分支内的代码做详细讲解，不过在这之前我们再来看一下如下高亮的代码：

```js {3,5-8}
if (dirRE.test(name)) {
  // mark element as dynamic
  el.hasBindings = true
  // modifiers
  modifiers = parseModifiers(name)
  if (modifiers) {
    name = name.replace(modifierRE, '')
  }
  if (bindRE.test(name)) { // v-bind
    // 省略...
  } else if (onRE.test(name)) { // v-on
    // 省略...
  } else { // normal directives
    // 省略...
  }
} else {
  // 省略...
}
```

一个完整的指令包含指令的名称、指令的参数、指令的修饰符以及指令的值，以上高亮代码的作用是用来解析指令中的修饰符。首先既然元素使用了指令，那么该指令的值就是表达式，既然是表达式那就涉及动态的内容，所以此时会在元素描述对象上添加 `el.hasBindings` 属性，并将其值设置为 `true`，标识着当前元素是一个动态的元素。接着执行了如下这句代码：

```js
modifiers = parseModifiers(name)
```

调用 `parseModifiers` 函数，该函数接收整个指令字符串作为参数，作用就是解析指令中的修饰符，并将解析结果赋值给 `modifiers` 变量。我们找到 `parseModifiers` 函数的代码，如下：

```js
function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE)
  if (match) {
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}
```

在 `parseModifiers` 函数内部首先使用指令字符串的 `match` 方法匹配正则 `modifierRE`，`modifierRE` 正则我们在上一章讲过，它是用来全局匹配字符串中字符 `.` 以及 `.` 后面的字符，也就是修饰符，举个例子，假设我们的指令字符串为：`'v-bind:some-prop.sync'`，则使用该字符串去匹配正则 `modifierRE` 最终将会得到一个数组：`[".sync"]`。一个指令有几个修饰符，则匹配的结果数组中就包含几个元素。如果匹配失败则会得到 `null`。回到上面的代码，定义了 `match` 常量，它保存着匹配结果。接着是一个 `if` 语句块，如果匹配成功则会执行 `if` 语句块内的代码，在 `if` 语句块内首先定义了 `ret` 常量，它是一个空对象，并且我们发现 `ret` 常量将作为匹配成功时的返回结果，`ret` 常量是什么呢？来看这句代码：

```js
match.forEach(m => { ret[m.slice(1)] = true })
```

使用 `forEach` 循环遍历了 `match` 数组，然后将每一项都作为 `ret` 对象的属性，并将其值设置为 `true`。注意由于 `match` 数组中的每个修饰符中都包含了字符 `.`，所以如上代码中使用 `m.slice(1)` 将字符 `.` 去掉。假设我们的指令字符串为：`'v-bind:some-prop.sync'`，则最终 `parseModifiers` 会返回一个对象：

```js
{
  sync: true
}
```

当然了，如果指令字符串中不包含修饰符，则 `parseModifiers` 函数没有返回值，或者说其返回值为 `undefined`。

再回到如下这段代码，注意高亮的代码所示：

```js {5-8}
if (dirRE.test(name)) {
  // mark element as dynamic
  el.hasBindings = true
  // modifiers
  modifiers = parseModifiers(name)
  if (modifiers) {
    name = name.replace(modifierRE, '')
  }
  if (bindRE.test(name)) { // v-bind
    // 省略...
  } else if (onRE.test(name)) { // v-on
    // 省略...
  } else { // normal directives
    // 省略...
  }
} else {
  // 省略...
}
```

在使用 `parseModifiers` 函数解析完指令中的修饰符之后，会使用 `modifiers` 变量保存解析结果，如果解析成功，将会执行如下代码：

```js
if (modifiers) {
  name = name.replace(modifierRE, '')
}
```

这句代码的作用很简单，就是将修饰符从指令字符串中移除，也就是说此时的指令字符串 `name` 中已经不包含修饰符部分了。

### 解析 v-bind 指令

处理完了修饰符，将进入对于指令的解析，解析环节分为三部分，分别是对于 `v-bind` 指令的解析，对于 `v-on` 指令的解析，以及对于其他指令的解析。如下代码所示：

```js {9,11,13}
if (dirRE.test(name)) {
  // mark element as dynamic
  el.hasBindings = true
  // modifiers
  modifiers = parseModifiers(name)
  if (modifiers) {
    name = name.replace(modifierRE, '')
  }
  if (bindRE.test(name)) { // v-bind
    // 省略...
  } else if (onRE.test(name)) { // v-on
    // 省略...
  } else { // normal directives
    // 省略...
  }
} else {
  // 省略...
}
```

如上高亮的代码所示，该 `if...elseif...else` 语句块分别用来处理 `v-bind` 指令、`v-on` 指令以及其他指令。我们先来看 `if` 语句块：

```js
if (bindRE.test(name)) {
  // 省略...
}
```

该 `if` 语句的判断条件是使用 `bindRE` 去匹配指令字符串，如果一个指令以 `v-bind:` 或 `:` 开头，则说明该指令为 `v-bind` 指令，这时 `if` 语句块内的代码将被执行，如下：

```js {2-4}
if (bindRE.test(name)) { // v-bind
  name = name.replace(bindRE, '')
  value = parseFilters(value)
  isProp = false
  // 省略...
}
```

首先使用 `bindRE` 正则将指令字符串中的 `v-bind:` 或 `:` 去除掉，此时 `name` 字符串已经从一个完整的指令字符串变为绑定属性的名字了，举个例子，假如原本的指令字符串为 `'v-bind:some-prop.sync'`，由于之前已经把该字符串中修饰符的部分去除掉了，所以指令字符串将变为 `'v-bind:some-prop'`，接着如上第一句高亮的代码又将指令字符串中的 `v-bind:` 去掉，所以此时指令字符串将变为 `'some-prop'`，可以发现该字符串就是绑定属性的名字，或者说是 `v-bind` 指令的参数。

接着调用 `parseFilters` 函数处理绑定属性的值，我们知道 `parseFilters` 函数的作用是用来将表达式与过滤器整合在一起的，前面我们已经做了详细的讲解，但凡涉及到能够使用过滤器的地方都要使用 `parseFilters` 函数去解析，并将解析后的新表达式返回。如上第二句高亮的代码所示，使用 `parseFilters` 函数的返回值重新赋值 `value` 变量。

第三句高亮的代码将 `isProp` 变量初始化为 `false`，`isProp` 变量标识着该绑定的属性是否是原生DOM对象的属性，所谓原生DOM对象的属性就是能够通过DOM元素对象直接访问的有效API，比如 `innerHTML` 就是一个原生DOM对象的属性。

再往下将进入一段 `if` 条件语句，该 `if` 语句块的作用是用来处理修饰符的：

```js {2,7,10}
if (modifiers) {
  if (modifiers.prop) {
    isProp = true
    name = camelize(name)
    if (name === 'innerHtml') name = 'innerHTML'
  }
  if (modifiers.camel) {
    name = camelize(name)
  }
  if (modifiers.sync) {
    addHandler(
      el,
      `update:${camelize(name)}`,
      genAssignmentCode(value, `$event`)
    )
  }
}
```

当然了，如果没有给 `v-bind` 属性提供修饰符，则这段 `if` 语句的代码将被忽略。`v-bind` 属性为开发者提供了三个修饰符，分别是 `prop`、`camel` 和 `sync`，这恰好对应如上代码中的三段 `if` 语句块。我们先来看第一段 `if` 语句块：

```js
if (modifiers.prop) {
  isProp = true
  name = camelize(name)
  if (name === 'innerHtml') name = 'innerHTML'
}
```

这段 `if` 语句块的代码用来处理使用了 `prop` 修饰符的 `v-bind` 指令，既然使用了 `prop` 修饰符，则意味着该属性将被作为原生DOM对象的属性，所以首先会将 `isProp` 变量设置为 `true`，接着使用 `camelize` 函数将属性名驼峰化，最后还会检查驼峰化之后的属性名是否等于字符串 `'innerHtml'`，如果属性名全等于该字符串则将属性名重写为字符串 `'innerHTML'`，我们知道 `'innerHTML'` 是一个特例，它的 `HTML` 四个字符串全部为大写。以上就是对于使用了 `prop` 修饰符的 `v-bind` 指令的处理，如果一个绑定属性使用了 `prop` 修饰符则 `isProp` 变量会被设置为 `true`，并且会把属性名字驼峰化。那么为什么要将 `isProp` 变量设置为 `true` 呢？答案在如下代码中：

```js {13}
if (bindRE.test(name)) { // v-bind
  name = name.replace(bindRE, '')
  value = parseFilters(value)
  isProp = false
  if (modifiers) {
    if (modifiers.prop) {
      isProp = true
      name = camelize(name)
      if (name === 'innerHtml') name = 'innerHTML'
    }
    // 省略...
  }
  if (isProp || (
    !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
  )) {
    addProp(el, name, value)
  } else {
    addAttr(el, name, value)
  }
}
```

如上高亮的代码所示，如果 `isProp` 为真则会执行该 `if` 语句块内的代码，即调用 `addProp` 函数，而 `else` 语句块内的 `addAttr` 函数是永远不会被调用的。我们前面讲解过 `addAttr` 函数，它会将属性的名字和值以对象的形式添加到元素描述对象的 `el.attrs` 数组中，`addProp` 函数与 `addAttr` 函数类似，只不过 `addProp` 函数会把属性的名字和值以对象的形式添加到元素描述对象的 `el.props` 数组中。如下是 `addProp` 函数的源码，它来自 `src/compiler/helpers.js` 文件：

```js
export function addProp (el: ASTElement, name: string, value: string) {
  (el.props || (el.props = [])).push({ name, value })
  el.plain = false
}
```

总之 `isProp` 变量是一个重要的标识，它的值将会影响一个属性被添加到元素描述对象的位置，从而影响后续的行为。另外这里再啰嗦一句：**元素描述对象的 `el.props` 数组中存储的并不是组件概念中的 `prop`，而是原生DOM对象的属性**。在后面的章节中我们会看到，组件概念中的 `prop` 其实是在 `el.attrs` 数组中。

有点扯远了，我们回过头来，明白了 `prop` 修饰符和 `isProp` 变量的作用之后，我们再来看一下对于 `camel` 修饰符的处理，如下代码：

```js {5-7}
if (modifiers) {
  if (modifiers.prop) {
    // 省略...
  }
  if (modifiers.camel) {
    name = camelize(name)
  }
  if (modifiers.sync) {
    // 省略...
  }
}
```

如上高亮的代码所示，如果 `modifiers.camel` 为真，则说明该绑定的属性使用了 `camel` 修饰符，使用该修饰符的作用只有一个，那就是将绑定的属性驼峰化，如下代码所示：

```html
<svg :view-box.camel="viewBox"></svg>
```

有的同学可能会说，我直接写成驼峰不就可以了吗：

```html
<svg :viewBox="viewBox"></svg>
```

不行，这是因为对于浏览器来讲，真正的属性名字是 `:viewBox` 而不是 `viewBox`，所以浏览器在渲染时会认为这是一个自定义属性，对于任何自定义属性浏览器都会把它渲染为小写的形式，所以当 `Vue` 尝试获取这段模板字符串的时候，会得到如下字符串：

```js
'<svg :viewbox="viewBox"></svg>'
```

最终渲染的真实DOM将是：

```html
<svg viewbox="viewBox"></svg>
```

这将导致渲染失败，因为 `SVG` 标签只认 `viewBox`，却不知道 `viewbox` 是什么。

可能大家已经注意到了，这个问题仅存在于 `Vue` 需要获取被浏览器处理后的模板字符串时才会出现，所以如果你使用了 `template` 选项代替 `Vue` 自动读取则不会出现这个问题：

```js
new Vue({
  template: '<svg :viewBox="viewBox"></svg>'
})
```

当然了，使用单文件组件也不会出现这种问题，所以这些情况下我们是不需要使用 `camel` 修饰符的。

接着我们来看一下对于最后一个修饰符的处理，即 `sync` 修饰符：

```js {8-14}
if (modifiers) {
  if (modifiers.prop) {
    // 省略...
  }
  if (modifiers.camel) {
    // 省略...
  }
  if (modifiers.sync) {
    addHandler(
      el,
      `update:${camelize(name)}`,
      genAssignmentCode(value, `$event`)
    )
  }
}
```

如上高亮代码所示，如果 `modifiers.sync` 为真，则说明该绑定的属性使用了 `sync` 修饰符。`sync` 修饰符实际上是一个语法糖，子组件不能够直接修改 `prop` 值，通常我们会在子组件中发射一个自定义事件，然后在父组件层面监听该事件并由父组件来修改状态。这个过程有时候过于繁琐，如下：

```html
<template>
  <child :some-prop="value" @custom-event="handleEvent" />
</template>

<script>
export default {
  data () {
    value: ''
  },
  methods: {
    handleEvent (val) {
      this.value = val
    }
  }
}
</script>
```

为了简化该过程，我们可以在绑定属性时使用 `sync` 修饰符：

```html
<child :some-prop.sync="value" />
```

这句代码等价于：

```html
<template>
  <child :some-prop="value" @update:someProp="handleEvent" />
</template>

<script>
export default {
  data () {
    value: ''
  },
  methods: {
    handleEvent (val) {
      this.value = val
    }
  }
}
</script>
```

注意事件名称 `update:someProp` 是固定的，它由 `update:` 加上驼峰化的绑定属性名称组成。所以在子组件中你需要发射一个名字叫做 `update:someProp` 的事件才能使 `sync` 修饰符生效，不难看出这大大提高了开发者的开发效率。

在 `Vue` 内部，使用 `sync` 修饰符的绑定属性与没有使用 `sync` 修饰符的绑定属性之间差异就在于：使用了 `sync` 修饰符的绑定属性等价于多了一个事件侦听，并且事件名称为 `'update:${驼峰化的属性名}'`。我们回到源码：

```js {8-14}
if (modifiers) {
  if (modifiers.prop) {
    // 省略...
  }
  if (modifiers.camel) {
    // 省略...
  }
  if (modifiers.sync) {
    addHandler(
      el,
      `update:${camelize(name)}`,
      genAssignmentCode(value, `$event`)
    )
  }
}
```

可以看到如果发现该绑定的属性使用了 `sync` 修饰符，则直接调用 `addHandler` 函数，在当前元素描述对象上添加事件侦听器。`addHandler` 函数的作用实际上就是将事件名称与该事件的侦听函数添加到元素描述对象的 `el.events` 属性或 `el.nativeEvents` 属性中。对于 `addHandler` 函数的实现我们将会在即将讲解的 `v-on` 指令的解析中为大家详细说明。这里大家要关注的是一个公式：

```js
:some-prop.sync <==等价于==> :some-prop + @update:someProp
```

通过如下代码我们就能够知道事件名称的构成：

```js {4}
if (modifiers.sync) {
  addHandler(
    el,
    `update:${camelize(name)}`,
    genAssignmentCode(value, `$event`)
  )
}
```

如上高亮代码所示，事件名称等于字符串 `'update:'` 加上驼峰化的绑定属性名称。另外我们注意到传递给 `addHandler` 函数的第三个参数，实际上 `addHandler` 函数的第三个参数就是当事件发生时的回调函数，而该回调函数是通过 `genAssignmentCode` 函数生成的。`genAssignmentCode` 函数来自 `src/compiler/directives/model.js` 文件，如下是其源码：

```js
export function genAssignmentCode (
  value: string,
  assignment: string
): string {
  const res = parseModel(value)
  if (res.key === null) {
    return `${value}=${assignment}`
  } else {
    return `$set(${res.exp}, ${res.key}, ${assignment})`
  }
}
```

要讲解 `genAssignmentCode` 函数将会牵扯到很多东西，实际上 `genAssignmentCode` 函数也被用在 `v-model` 指令，因为本质上 `v-model` 指令与绑定属性加上 `sync` 修饰符几乎相同，所以我们会在讲解 `v-model` 指令时再来详细讲解 `genAssignmentCode` 函数。这里大家只要关注一下如上代码中 `genAssignmentCode` 的返回值即可，它返回的是一个代码字符串，可以看到如果这个代码字符串作为代码执行，其作用就是一个赋值工作。这样就免去了我们手动赋值的繁琐。

以上我们讲完了对于三个绑定属性可以使用的修饰符，接下来我们来看处理绑定属性的最后一段代码：

```js
if (isProp || (
  !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
)) {
  addProp(el, name, value)
} else {
  addAttr(el, name, value)
}
```

实际上这段代码我们已经讲到过了，这里要强调的是 `if` 语句的判断条件：

```js
isProp || (!el.component && platformMustUseProp(el.tag, el.attrsMap.type, name))
```

前面说过了如果 `isProp` 变量为真，则说明该绑定的属性是原生DOM对象的属性，但是如果 `isProp` 变量为假，那么就要看第二个条件是否成立，如果第二个条件成立，则该绑定的属性还是会作为原生DOM对象的属性，第二个条件如下：

```js
!el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
```

首先 `el.component` 必须为假，这个条件能够保证什么呢？我们知道 `el.component` 属性保存的是标签 `is` 属性的值，如果 `el.component` 属性为假就能够保证标签没有使用 `is` 属性。那么为什么需要这个保证呢？这是因为后边的 [platformMustUseProp](../appendix/web-util.md#mustuseprop) 函数，该函数的讲解可以在附录中查看，总结如下：

* `input,textarea,option,select,progress` 这些标签的 `value` 属性都应该使用元素对象的原生的 `prop` 绑定（除了 `type === 'button'` 之外）
* `option` 标签的 `selected` 属性应该使用元素对象的原生的 `prop` 绑定
* `input` 标签的 `checked` 属性应该使用元素对象的原生的 `prop` 绑定
* `video` 标签的 `muted` 属性应该使用元素对象的原生的 `prop` 绑定

可以看到如果满足这些条件，则意味着即使你在绑定以上属性时没有使用 `prop` 修饰符，那么它们依然会被当做原生DOM对象的属性。不过我们还是没有解释为什么要保证 `!el.component` 成立，这是因为 `platformMustUseProp` 函数在判断的时候需要标签的名字(`el.tag`)，而 `el.component` 会在元素渲染阶段替换掉 `el.tag` 的值。所以如果 `el.component` 存在则会影响 `platformMustUseProp` 的判断结果。

最后我们来对 `v-bind` 指令的解析做一个总结：

* 1、任何绑定的属性，最终要么会被添加到元素描述对象的 `el.attrs` 数组中，要么就被添加到元素描述对象的 `el.props` 数组中。
* 2、对于使用了 `.sync` 修饰符的绑定属性，还会在元素描述对象的 `el.events` 对象中添加名字为 `'update:${驼峰化的属性名}'` 的事件。

### 解析 v-on 指令

接下来我们来看一下 `processAttrs` 函数对于 `v-on` 指令的解析，如下代码所示：

```js {4-5}
if (bindRE.test(name)) { // v-bind
  // 省略...
} else if (onRE.test(name)) { // v-on
  name = name.replace(onRE, '')
  addHandler(el, name, value, modifiers, false, warn)
} else { // normal directives
  // 省略...
}
```

与 `v-bind` 指令类似，使用 `onRE` 正则去匹配指令字符串，如果该指令字符串以 `@` 或 `v-on:` 开头，则说明该指令是事件绑定，此时 `elseif` 语句块内的代码将会被执行，在 `elseif` 语句块内，首先将指令字符串中的 `@` 字符或 `v-on:` 字符串去掉，然后直接调用 `addHandler` 函数。

打开 `src/compiler/helpers.js` 文件并找到 `addHandler` 函数，如下是 `addHandler` 函数签名：

```js
export function addHandler (
  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean,
  warn?: Function
) {
  // 省略...
}
```

可以看到 `addHandler` 函数接收六个参数，分别是：

* `el`：当前元素描述对象
* `name`： 绑定属性的名字，即事件名称
* `value`：绑定属性的值，这个值有可能是事件回调函数名字，有可能是内联语句，有可能是函数表达式
* `modifiers`：指令对象
* `important`：可选参数，是一个布尔值，代表着添加的事件侦听函数的重要级别，如果为 `true`，则该侦听函数会被添加到该事件侦听函数数组的头部，否则会将其添加到尾部，
* `warn`：打印警告信息的函数，是一个可选参数

了解了 `addHandler` 函数所需的参数，我们再来看一下解析 `v-on` 指令时调用 `addHandler` 函数所传递的参数，如下高亮代码所示：

```js
if (bindRE.test(name)) { // v-bind
  // 省略...
} else if (onRE.test(name)) { // v-on
  name = name.replace(onRE, '')
  addHandler(el, name, value, modifiers, false, warn)
} else { // normal directives
  // 省略...
}
```

如上高亮代码中在调用 `addHandler` 函数时传递了全部六个参数。这里就不一一介绍这六个实参了，相信大家都知道这六个实参是什么。我们开始研究 `addHandler` 函数的实现，在 `addHandler` 函数的开头是这样一段代码：

```js
modifiers = modifiers || emptyObject
// warn prevent and passive modifier
/* istanbul ignore if */
if (
  process.env.NODE_ENV !== 'production' && warn &&
  modifiers.prevent && modifiers.passive
) {
  warn(
    'passive and prevent can\'t be used together. ' +
    'Passive handler can\'t prevent default event.'
  )
}
```

首先检测 `v-on` 指令的修饰符对象 `modifiers` 是否存在，如果在使用 `v-on` 指令时没有指定任何修饰符，则 `modifiers` 的值为 `undefined`，此时会使用冻结的空对象 `emptyObject` 作为替代。接着是一个 `if` 条件语句块，如果该 `if` 语句的判断条件成立，则说明开发者同时使用了 `prevent` 修饰符和 `passive` 修饰符，此时如果是在非生产环境下并且 `addHandler` 函数的第六个参数 `warn` 存在，则使用 `warn` 函数打印警告信息，提示开发者 `passive` 修饰符不能和 `prevent` 修饰符一起使用，这是因为在事件监听中 `passive` 选项参数就是用来告诉浏览器该事件监听函数是不会阻止默认行为的。

再往下是这样一段代码：

```js
// check capture modifier
if (modifiers.capture) {
  delete modifiers.capture
  name = '!' + name // mark the event as captured
}
if (modifiers.once) {
  delete modifiers.once
  name = '~' + name // mark the event as once
}
/* istanbul ignore if */
if (modifiers.passive) {
  delete modifiers.passive
  name = '&' + name // mark the event as passive
}
```

这段代码由三个 `if` 条件语句块组成，如果事件指令中使用了 `capture` 修饰符，则第一个 `if` 语句块的内容将被执行，可以看到在第一个 `if` 语句块内首先将 `modifiers.capture` 选项移除，紧接着在原始事件名称之前添加一个字符 `!`。假设我们事件绑定代码如下：

```html
<div @click.capture="handleClick"></div>
```

如上代码中点击事件使用了 `capture` 修饰符，所以在 `addHandler` 函数内部，会把事件名称 `'click'` 修改为 `'!click'`。

与第一个 `if` 语句块类似，第二个和第三个 `if` 语句块分别用来处理当事件使用了 `once` 修饰符和 `passive` 修饰符的情况。可以看到如果事件使用了 `once` 修饰符，则会在事件名称的前面添加字符 `~`，如果事件使用了 `passive` 修饰符，则会在事件名称前面添加字符 `&`。也就是说如下两段代码是等价的：

```html
<div @click.once="handleClick"></div>
```

等价于：

```html
<div @~click="handleClick"></div>
```

再往下是如下这段代码：

```js
// normalize click.right and click.middle since they don't actually fire
// this is technically browser-specific, but at least for now browsers are
// the only target envs that have right/middle clicks.
if (name === 'click') {
  if (modifiers.right) {
    name = 'contextmenu'
    delete modifiers.right
  } else if (modifiers.middle) {
    name = 'mouseup'
  }
}
```

这段代码用来规范化“右击”事件和点击鼠标中间按钮的事件，我们知道在浏览器中点击右键一般会出来一个菜单，这本质上是触发了 `contextmenu` 事件。而 `Vue` 中定义“右击”事件的方式是为 `click` 事件添加 `right` 修饰符。所以如上代码中首先检查了事件名称是否是 `click`，如果事件名称是 `click` 并且使用了 `right` 修饰符，则会将事件名称重写为 `contextmenu`，同时使用 `delete` 操作符删除 `modifiers.right` 属性。类似地在 `Vue` 中定义点击滚轮事件的方式是为 `click` 事件指定 `middle` 修饰符，但我们知道鼠标本没有滚轮点击事件，一般我们区分用户点击的按钮是不是滚轮的方式是监听 `mouseup` 事件，然后通过事件对象的 `event.button` 属性值来判断，如果 `event.button === 1` 则说明用户点击的是滚轮按钮。

不过这里有一点需要提醒大家，我们知道如果 `click` 事件使用了 `once` 修饰符，则事件的名字会被修改为 `~click`，所以当程序执行到如上这段时，事件名字是永远不会等于字符串 `'click'` 的，换句话说，如果同时使用 `once` 修饰符和 `right` 修饰符，则右击事件不会被触发，如下代码所示：

```html
<div @click.right.once="handleClickRightOnce"></div>
```

如上代码无效，作为变通方案我们可以直接监听 `contextmenu` 事件，如下：

```html
<div @contextmenu.once="handleClickRightOnce"></div>
```

但其实从源码角度也是很好解决的，只需要把规范化“右击”事件和点击鼠标中间按钮的事件的这段代码提前即可，关于这一点我提交了一个 [PR](https://github.com/vuejs/vue/pull/8492)，但实际上我认为还有更好的解决方案，那就是从 `mouseup` 事件入手，将 `contextmenu` 事件与“右击”事件完全分离处理，这里就不展开讨论了。

我们回到 `addHandler` 函数继续看后面的代码，接下来我们要看的是如下这段代码：

```js
let events
if (modifiers.native) {
  delete modifiers.native
  events = el.nativeEvents || (el.nativeEvents = {})
} else {
  events = el.events || (el.events = {})
}
```

定义了 `events` 变量，然后判断是否存在 `native` 修饰符，如果 `native` 修饰符存在则会在元素描述对象上添加 `el.nativeEvents` 属性，初始值为一个空对象，并且 `events` 变量与 `el.nativeEvents` 属性具有相同的引用，另外大家注意如上代码中使用 `delete` 操作符删除了 `modifiers.native` 属性，到目前为止我们在讲解 `addHandler` 函数时已经遇到了很多次使用 `delete` 操作符删除修饰符对象属性的做法，那这么做的目的是什么呢？这是因为在代码生成阶段会使用 `for...in` 语句遍历修饰符对象，然后做一些相关的事情，所以在生成 `AST` 阶段把那些不希望被遍历的属性删除掉，更具体的内容我们会在代码生成中为大家详细讲解。回过头来，如果 `native` 属性不存在则会在元素描述对象上添加 `el.events` 属性，它的初始值也是一个空对象，此时 `events` 变量的引用将与 `el.events` 属性相同。

再往下是这样一段代码：

```js
const newHandler: any = {
  value: value.trim()
}
if (modifiers !== emptyObject) {
  newHandler.modifiers = modifiers
}
```

定义了 `newHandler` 对象，该对象初始拥有一个 `value` 属性，该属性的值就是 `v-on` 指令的属性值。接着是一个 `if` 条件语句，该 `if` 语句的判断条件检测了修饰符对象 `modifiers` 是否不等于 `emptyObject`，我们知道当一个事件没有使用任何修饰符时，修饰符对象 `modifiers` 会被初始化为 `emptyObject`，所以如果修饰符对象 `modifiers` 不等于 `emptyObject` 则说明事件使用了修饰符，此时会把修饰符对象赋值给 `newHandler.modifiers` 属性。

再往下是 `addHandler` 函数的最后一段代码：

```js
const handlers = events[name]
/* istanbul ignore if */
if (Array.isArray(handlers)) {
  important ? handlers.unshift(newHandler) : handlers.push(newHandler)
} else if (handlers) {
  events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
} else {
  events[name] = newHandler
}

el.plain = false
```

首先定义了 `handlers` 常量，它的值是通过事件名称获取 `events` 对象下的对应的属性值得到的：`events[name]`，我们知道变量 `events` 要么是元素描述对象的 `el.nativeEvents` 属性的引用，要么就是元素描述对象 `el.events` 属性的引用。无论是谁的引用，在初始情况下 `events` 变量都是一个空对象，所以在第一次调用 `addHandler` 时 `handlers` 常量是 `undefined`，这就会导致接下来的代码中 `else` 语句块将被执行：

```js {6}
if (Array.isArray(handlers)) {
  // 省略...
} else if (handlers) {
  // 省略...
} else {
  events[name] = newHandler
}
```

可以看到在 `else` 语句块内，为 `events` 对象定义了与事件名称相同的属性，并以 `newHandler` 对象作为属性值。举个例子，假设我们有如下模板代码：

```html
<div @click.once="handleClick"></div>
```

如上模板中监听了 `click` 事件，并绑定了名字叫做 `handleClick` 的事件监听函数，所以此时 `newHandler` 对象应该是：

```js
newHandler = {
  value: 'handleClick',
  modifiers: {} // 注意这里是空对象，因为 modifiers.once 修饰符被 delete 了
}
```

又因为使用了 `once` 修饰符，所以事件名称将变为字符串 `'~click'`，又因为在监听事件时没有使用 `native` 修饰符，所以 `events` 变量是元素描述对象的 `el.events` 属性的引用，所以调用 `addHandler` 函数的最终结果就是在元素描述对象的 `el.events` 对象中添加相应事件的处理结果：

```js
el.events = {
  '~click': {
    value: 'handleClick',
    modifiers: {}
  }
}
```

现在我们来修改一下之前的模板，如下：

```html
<div @click.prevent="handleClick1" @click="handleClick2"></div>
```

如上模板所示，我们有两个 `click` 事件的侦听，其中一个 `click` 事件使用了 `prevent` 修饰符，而另外一个 `click` 事件则没有使用修饰符，所以这两个 `click` 事件是不同，但这两个事件的名称却是相同的，都是 `'click'`，所以这将导致调用两次 `addHandler` 函数添加两次名称相同的事件，但是由于第一次调用 `addHandler` 函数添加 `click` 事件之后元素描述对象的 `el.events` 对象已经存在一个 `click` 属性，如下：

```js
el.events = {
  click: {
    value: 'handleClick1',
    modifiers: { prevent: true }
  }
}
```

所以当第二次调用 `addHandler` 函数时，如下 `elseif` 语句块的代码将被执行：

```js {6}
const handlers = events[name]
/* istanbul ignore if */
if (Array.isArray(handlers)) {
  important ? handlers.unshift(newHandler) : handlers.push(newHandler)
} else if (handlers) {
  events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
} else {
  events[name] = newHandler
}
```

此时 `newHandler` 对象是第二个 `click` 事件侦听的信息对象，而 `handlers` 常量保存的则是第一次被添加的事件信息，我们看如上高亮的那句代码，这句代码检测了参数 `important` 的真假，根据 `important` 参数的不同，会重新为 `events[name]` 赋值。可以看到 `important` 参数的真假所影响的仅仅是被添加的 `handlers` 对象的顺序。最终元素描述对象的 `el.events.click` 属性将变成一个数组，这个数组保存着前后两次添加的 `click` 事件的信息对象，如下：

```js
el.events = {
  click: [
    {
      value: 'handleClick1',
      modifiers: { prevent: true }
    },
    {
      value: 'handleClick2'
    }
  ]
}
```

这还没完，我们再次尝试修改我们的模板：

```html
<div @click.prevent="handleClick1" @click="handleClick2" @click.self="handleClick3"></div>
```

我们在上一次修改的基础上添加了第三个 `click` 事件侦听，但是我们使用了 `self` 修饰符，所以这个 `click` 事件与前两个 `click` 事件也是不同的，此时如下 `if` 语句块的代码将被执行：

```js {4}
const handlers = events[name]
/* istanbul ignore if */
if (Array.isArray(handlers)) {
  important ? handlers.unshift(newHandler) : handlers.push(newHandler)
} else if (handlers) {
  events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
} else {
  events[name] = newHandler
}
```

由于此时 `el.events.click` 属性已经是一个数组，所以如上 `if` 语句的判断条件成立。在 `if` 语句块内执行了一句代码，这句代码是一个三元运算符，其作用很简单，我们知道 `important` 所影响的就是事件作用的顺序，所以根据 `important` 参数的不同，会选择使用数组的 `unshift` 方法将新添加的事件信息对象放到数组的头部，或者选择数组的 `push` 方法将新添加的事件信息对象放到数组的尾部。这样无论你有多少个同名事件的监听，都不会落下任何一个监听函数的执行。

接着我们注意到 `addHandler` 函数的最后一句代码，如下：

```js
el.plain = false
```

如果一个标签存在事件侦听，无论如何都不会认为这个元素是“纯”的，所以这里直接将 `el.plain` 设置为 `false`。`el.plain` 属性会影响代码生成阶段，并间接导致程序的执行行为，我们后面会总结一个关于 `el.plain` 的变更情况，让大家充分地理解。

以上就是对于 `addHandler` 函数的讲解，我们发现 `addHandler` 函数对于元素描述对象的影响主要是在元素描述对象上添加了 `el.events` 属性和 `el.nativeEvents` 属性。对于 `el.events` 属性和 `el.nativeEvents` 属性的结构我们前面已经讲解得很详细了，这里不再做总结。

最后我们回到 `src/compiler/parser/index.js` 文件中的 `processAttrs` 函数中，如下高亮代码所示：

```js {4,5}
if (bindRE.test(name)) { // v-bind
  // 省略...
} else if (onRE.test(name)) { // v-on
  name = name.replace(onRE, '')
  addHandler(el, name, value, modifiers, false, warn)
} else { // normal directives
  // 省略...
}
```

现在大家应该知道对于使用 `v-on` 指令绑定的事件，在解析阶段都做了哪些处理了吧。另外我们注意一下如上代码中调用 `addHandler` 函数时传递的第五个参数为 `false`，它实际上就是 `addHandler` 函数中名字为 `important` 的参数，它影响的是新添加的事件信息对象的顺序，由于上面代码中传递的 `important` 参数为 `false`，所以使用 `v-on` 添加的事件侦听函数将按照添加的顺序被先后执行。

以上就是对于 `processAttrs` 函数中对于 `v-on` 指令的解析。

### 解析其他指令

讲解完了对于 `v-on` 指令的解析，接下来我们进入如下这段代码：

```js {6-16}
if (bindRE.test(name)) { // v-bind
  // 省略...
} else if (onRE.test(name)) { // v-on
  // 省略...
} else { // normal directives
  name = name.replace(dirRE, '')
  // parse arg
  const argMatch = name.match(argRE)
  const arg = argMatch && argMatch[1]
  if (arg) {
    name = name.slice(0, -(arg.length + 1))
  }
  addDirective(el, name, rawName, value, arg, modifiers)
  if (process.env.NODE_ENV !== 'production' && name === 'model') {
    checkForAliasModel(el, value)
  }
}
```

如上高亮代码所示，如果一个指令既不是 `v-bind` 也不是 `v-on`，则如上 `else` 语句块的代码将被执行。这段代码的作用是用来处理除 `v-bind` 和 `v-on` 指令之外的其他指令，但这些指令中不包含 `v-once` 指令，因为 `v-once` 指令已经在 `processOnce` 函数中被处理了，同样的 `v-if/v-else-if/v-else` 等指令也不会被如上这段代码处理，下面是一个表格，表格中列出了所有 `Vue` 内置提供的指令与已经处理过的指令和剩余未处理指令的对照表格：

| Vue 内置提供的所有指令  | 是否已经被解析 | 解析函数 |
| ------------- | ------------- | ------------- |
| `v-if`  | 是  | `processIf`  |
| `v-else-if`  | 是  | `processIf`  |
| `v-else`  | 是  | `processIf`  |
| `v-for`  | 是  | `processFor`  |
| `v-on`  | 是  | `processAttrs`  |
| `v-bind`  | 是  | `processAttrs`  |
| `v-pre`  | 是  | `processPre`  |
| `v-once`  | 是  | `processOnce`  |
| `v-text`  | 否  | 无  |
| `v-html`  | 否  | 无  |
| `v-show`  | 否  | 无  |
| `v-cloak`  | 否  | 无  |
| `v-model`  | 否  | 无  |

通过如上表格可以看到，到目前为止还有五个指令没有得到处理，分别是 `v-text`、`v-html`、`v-show`、`v-cloak` 以及 `v-model`，除了这五个 `Vue` 内置提供的指令之外，开发者还可以自定义指令，所以上面代码中 `else` 语句块内的代码就是用来处理剩余的这五个内置指令和其他自定义指令的。

我们回到 `else` 语句块内的代码，如下：

```js {6-16}
if (bindRE.test(name)) { // v-bind
  // 省略...
} else if (onRE.test(name)) { // v-on
  // 省略...
} else { // normal directives
  name = name.replace(dirRE, '')
  // parse arg
  const argMatch = name.match(argRE)
  const arg = argMatch && argMatch[1]
  if (arg) {
    name = name.slice(0, -(arg.length + 1))
  }
  addDirective(el, name, rawName, value, arg, modifiers)
  if (process.env.NODE_ENV !== 'production' && name === 'model') {
    checkForAliasModel(el, value)
  }
}
```

在 `else` 语句块内，首先使用字符串的 `replace` 方法配合 `dirRE` 正则去掉属性名称中的 `'v-'` 或 `':'` 或 `'@'` 等字符，并重新赋值 `name` 变量，所以此时 `name` 变量应该只包含属性名字，假如我们在一个标签中使用 `v-show` 指令，则此时 `name` 变量的值为字符串 `'show'`。但是对于自定义指令，开发者很可能为该指令提供参数，假设我们有一个叫做 `v-custom` 的指令，并且我们在使用该指令时为其指定了参数：`v-custom:arg`，这时重新赋值后的 `name` 变量应该是字符串 `'custom:arg'`。可能大家会问：如果指令有修饰符那是不是 `name` 变量保存的字符串中也包含修饰符？不会的，大家别忘了在 `processAttrs` 函数中每解析一个指令时都优先使用 `parseModifiers` 函数将修饰符解析完毕了，并且修饰符相关的字符串已经被移除，所以如上代码中的 `name` 变量中将不会包含修饰符字符串。

重新赋值 `name` 变量之后，会执行如下这两句代码：

```js
const argMatch = name.match(argRE)
const arg = argMatch && argMatch[1]
```

第一句代码使用 `argRE` 正则匹配变量 `name`，并将匹配结果保存在 `argMatch` 常量中，由于使用的是 `match` 方法，所以如果匹配成功则会返回一个结果数组，匹配失败则会得到 `null`。`argRE` 正则我们在上一章讲解过，它用来匹配指令字符串中的参数部分，并且拥有一个捕获组用来捕获参数字符串，假设现在 `name` 变量的值为 `custom:arg`，则最终 `argMatch` 常量将是一个数组：

```js
const argMatch = [':arg', 'arg']
```

可以看到 `argMatch` 数组中索引为 `1` 的元素保存着参数字符串。有了 `argMatch` 数组后将会执行第二句代码，第二句代码首先检测了 `argMatch` 是否存在，如果存在则取 `argMatch` 数组中索引为 `1` 的元素作为常量 `arg` 的值，所以常量 `arg` 所保存的就是参数字符串。

再往下是一个 `if` 条件语句，如下：

```js
if (arg) {
  name = name.slice(0, -(arg.length + 1))
}
```

这个 `if` 语句检测了参数字符串 `arg` 是否存在，如果存在说明有参数传递给该指令，此时会执行 `if` 语句块内的代码。可以发现 `if` 语句块内的这句代码的作用就是用来将参数字符串从 `name` 字符串中移除掉的，由于参数字符串 `arg` 不包含冒号(`:`)字符，所以需要使用 `-(arg.length + 1)` 才能正确截取。举个例子，假设此时 `name` 字符串为 `'custom:arg'`，再经过如上代码处理之后，最终 `name` 字符串将变为 `'custom'`，可以看到此时的 `name` 变量已经变成了真正的指令名字了。

再往下，将执行如下这句代码：

```js
addDirective(el, name, rawName, value, arg, modifiers)
```

这句代码调用了 `addDirective` 函数，并传递给该函数六个参数，为了让大家有直观的感受，我们还是举个例子，假设我们的指令为：`v-custom:arg.modif="myMethod"`，则最终调用 `addDirective` 函数时所传递的参数如下：

```js
addDirective(el, 'custom', 'v-custom:arg.modif', 'myMethod', 'arg', { modif: true })
```

实际上 `addDirective` 函数与 `addHandler` 函数类似，只不过 `addDirective` 函数的作用是用来在元素描述对象上添加 `el.directives` 属性的，如下是 `addDirective` 函数的源码，它来自 `src/compiler/helpers.js` 文件：

```js
export function addDirective (
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  modifiers: ?ASTModifiers
) {
  (el.directives || (el.directives = [])).push({ name, rawName, value, arg, modifiers })
  el.plain = false
}
```

可以看到 `addDirective` 函数接收六个参数，在 `addDirective` 函数体内，首先判断了元素描述对象的 `el.directives` 是否存在，如果不存在则先将其初始化一个空数组，然后再使用 `push` 方法添加一个指令信息对象到 `el.directives` 数组中，如果 `el.directives` 属性已经存在，则直接使用 `push` 方法将指令信息对象添加到 `el.directives` 数组中。我们一直说的 **指令信息对象** 实际上指的就是如上代码中传递给 `push` 方法的参数：

```js
{ name, rawName, value, arg, modifiers }
```

另外我们注意到在 `addDirective` 函数的最后，与 `addHandler` 函数类似，也有一句将元素描述对象的 `el.plain` 属性设置为 `false` 的代码。

我们回到 `processAttrs` 函数中，继续看代码，如下高亮的代码所示：

```js {14-16}
if (bindRE.test(name)) { // v-bind
  // 省略...
} else if (onRE.test(name)) { // v-on
  // 省略...
} else { // normal directives
  name = name.replace(dirRE, '')
  // parse arg
  const argMatch = name.match(argRE)
  const arg = argMatch && argMatch[1]
  if (arg) {
    name = name.slice(0, -(arg.length + 1))
  }
  addDirective(el, name, rawName, value, arg, modifiers)
  if (process.env.NODE_ENV !== 'production' && name === 'model') {
    checkForAliasModel(el, value)
  }
}
```

这段高亮的代码是 `else` 语句块的最后一段代码，它是一个 `if` 条件语句块，在非生产环境下，如果指令的名字为 `model`，则会调用 `checkForAliasModel` 函数，并将元素描述对象和 `v-model` 属性值作为参数传递，这段代码的作用是什么呢？我们找到 `checkForAliasModel` 函数，如下：

```js
function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`
      )
    }
    _el = _el.parent
  }
}
```

`checkForAliasModel` 函数的作用就是从使用了 `v-model` 指令的标签开始，逐层向上遍历父级标签的元素描述对象，直到根元素为止。并且在遍历的过程中一旦发现这些标签的元素描述对象中存在满足条件：`_el.for && _el.alias === value` 的情况，就会打印警告信息。我们先来看如下条件：

```js
if (_el.for && _el.alias === value)
```

如果这个条件成立，则说明使用了 `v-model` 指令的标签或其父代标签使用了 `v-for` 指令，如下：

```html
<div v-for="item of list">
  <input v-model="item" />
</div>
```

假设如上代码中的 `list` 数组如下：

```js
[1, 2, 3]
```

此时将会渲染三个输入框，但是当我们修改输入框的值时，这个变更是不会体现到 `list` 数组的，换句话说如上代码中的 `v-model` 指令无效，为什么无效呢？这与 `v-for` 指令的实现有关，如上代码中的 `v-model` 指令所执行的修改操作等价于修改了函数的局部变量，这当然不会影响到真正的数据。为了解决这个问题，`Vue` 也给了我们一个方案，那就是使用对象数组替代基本类型值的数组，并在 `v-model` 指令中绑定对象的属性，我们修改一下上例并使其生效：

```html
<div v-for="obj of list">
  <input v-model="obj.item" />
</div>
```

此时在定义 `list` 数组时，应该将其定义为：

```js
[
  { item: 1 },
  { item: 2 },
  { item: 3 },
]
```

所以实际上 `checkForAliasModel` 函数的作用就是给开发者合适的提醒。

以上就是对自定义指令和剩余的五个未被解析的内置指令的处理，可以看到每当遇到一个这样的指令，都会在元素描述对象的 `el.directives` 数组中添加一个指令信息对象，如下：

```js
el.directives = [
  {
    name, // 指令名字
    rawName, // 指令原始名字
    value, // 指令的属性值
    arg, // 指令的参数
    modifiers // 指令的修饰符
  }
]
```

注意，如上注释中我们把指令信息对象中的 `value` 属性说成“指令的属性值”，我已经不止一次的强调过，在解析编译阶段一切都是字符串，并不是 `Vue` 中数据状态的值，大家千万不要搞混。

### 处理非指令属性

上一节中我们讲解了 `processAttrs` 函数对于指令的处理，接下来我们将讲解 `processAttrs` 函数对于那些非指令的属性是如何处理的，如下代码所示：

```js {9-11}
function processAttrs (el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, isProp
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name
    value = list[i].value
    if (dirRE.test(name)) {
      // 省略...
    } else {
      // 省略...
    }
  }
}
```

如上高亮的代码所示，这个 `else` 语句块内代码的作用就是用来处理非指令属性的，如下列出的非指令属性是我们在之前的讲解中已经讲过的属性：

* `key`
* `ref`
* `slot`、`slot-scope`、`scope`、`name`
* `is`、`inline-template`

这些非指令属性都已经被相应的处理函数解析过了，所以 `processAttrs` 函数是不负责处理如上这些非指令属性的。换句话说除了以上这些以外，其他的非指令属性基本都由 `processAttrs` 函数来处理，比如 `id`、`width` 等，如下：

```html
<div id="box" width="100px"></div>
```

如上 `div` 标签中的 `id` 属性和 `width` 属性都会被 `processAttrs` 函数处理，可能大家会问 `class` 属性是不是也被 `processAttrs` 函数处理呢？不是的，大家别忘了在 `processElement` 函数中有这样一段代码：

```js
for (let i = 0; i < transforms.length; i++) {
  element = transforms[i](element, options) || element
}
```

这段代码在 `processAttrs` 函数之前执行，并且这段代码的作用是调用“中置处理”钩子，而 `class` 属性和 `style` 属性都会在中置处理钩子中被处理，而并非 `processAttrs` 函数。

接下来我们就查看一下这段用来处理非指令属性的代码，如下 `else` 语句块内的代码所示：

```js
if (dirRE.test(name)) {
  // 省略...
} else {
  // literal attribute
  if (process.env.NODE_ENV !== 'production') {
    const res = parseText(value, delimiters)
    if (res) {
      warn(
        `${name}="${value}": ` +
        'Interpolation inside attributes has been removed. ' +
        'Use v-bind or the colon shorthand instead. For example, ' +
        'instead of <div id="{{ val }}">, use <div :id="val">.'
      )
    }
  }
  addAttr(el, name, JSON.stringify(value))
  // #6887 firefox doesn't update muted state if set via attribute
  // even immediately after element creation
  if (!el.component &&
      name === 'muted' &&
      platformMustUseProp(el.tag, el.attrsMap.type, name)) {
    addProp(el, name, 'true')
  }
}
```

如上 `else` 语句块内的代码中，首先执行的是如下这段代码，它是一个 `if` 条件语句块：

```js
if (process.env.NODE_ENV !== 'production') {
  const res = parseText(value, delimiters)
  if (res) {
    warn(
      `${name}="${value}": ` +
      'Interpolation inside attributes has been removed. ' +
      'Use v-bind or the colon shorthand instead. For example, ' +
      'instead of <div id="{{ val }}">, use <div :id="val">.'
    )
  }
}
```

可以看到，在非生产环境下才会执行该 `if` 语句块内的代码，在该 `if` 语句块内首先调用了 `parseText` 函数，这个函数来自于 `src/compiler/parser/text-parser.js` 文件，`parseText` 函数的作用是用来解析字面量表达式的，什么是字面量表达式呢？如下模板代码所示：

```html
<div id="{{ isTrue ? 'a' : 'b' }}"></div>
```

其中字符串 `"{{ isTrue ? 'a' : 'b' }}"` 就称为字面量表达式，此时就会使用 `parseText` 函数来解析这段字符串。至于 `parseText` 函数是如何对这段字符串进行解析的，我们会在后面讲解处理文本节点时再来详细说明。这里大家只需要知道，如果使用 `parseText` 函数能够成功解析某个非指令属性的属性值字符串，则说明该非指令属性的属性值使用了字面量表达式，就如同上面的模板中的 `id` 属性一样。此时将会打印警告信息，提示开发者使用绑定属性作为替代，如下：

```html
<div :id="isTrue ? 'a' : 'b'"></div>
```

这就是上面那段 `if` 语句块代码的作用，我们往下继续看代码，接下来将执行如下这句代码：

```js
addAttr(el, name, JSON.stringify(value))
```

可以看到，对于任何非指令属性，都会使用 `addAttr` 函数将该属性与该属性对应的字符串值添加到元素描述对象的 `el.attrs` 数组中。这里大家需要注意的是，如上这句代码中使用 `JSON.stringify` 函数对属性值做了处理，这么做的目的相信大家都知道了，就是让该属性的值当做一个纯字符串对待。

理论上代码运行到这里就已经足够了，该做的事情都已经完成了，但是我们发现在 `else` 语句块的最后，还有如下这样一段代码：

```js
// #6887 firefox doesn't update muted state if set via attribute
// even immediately after element creation
if (!el.component &&
    name === 'muted' &&
    platformMustUseProp(el.tag, el.attrsMap.type, name)) {
  addProp(el, name, 'true')
}
```

实际上元素描述对象的 `el.attrs` 数组中所存储的任何属性都会在由虚拟DOM创建真实DOM的过程中使用 `setAttribute` 方法将属性添加到真实DOM元素上，而在火狐浏览器中存在无法通过DOM元素的 `setAttribute` 方法为 `video` 标签添加 `muted` 属性的问题，所以如上代码就是为了解决该问题的，其方案是如果一个属性的名字是 `muted` 并且该标签满足 [platformMustUseProp](../appendix/web-util.md#mustuseprop) 函数(`video` 标签满足)，则会额外调用 `addProp` 函数将属性添加到元素描述对象的 `el.props` 数组中。为什么这么做呢？这是因为元素描述对象的 `el.props` 数组中所存储的任何属性都会在由虚拟DOM创建真实DOM的过程中直接使用真实DOM对象添加，也就是说对于 `<video>` 标签的 `muted` 属性的添加方式为：`videoEl.muted = true`。另外如上代码的注释中已经提供了相应的 `issue` 号：`#6887`，感兴趣的同学可以去看一下。

## preTransformNode 前置处理

讲完了 `processAttrs` 函数之后，所有的 `process*` 系列函数我们都讲解完毕了。另外大家不要忘了，目前我们所讲解的内容都是在 `parseHTML` 函数的 `start` 钩子中运行的代码，如下高亮的代码所示：

```js {9-11}
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

也就是说我们现在讲解的内容都是在当解析器遇到开始标签时所做的工作，接下来我们要讲的内容就是 `start` 钩子函数中的如下这段代码：

```js
// apply pre-transforms
for (let i = 0; i < preTransforms.length; i++) {
  element = preTransforms[i](element, options) || element
}
```

我们说过这段代码是在应用前置转换(或前置处理)，其中 `preTransforms` 变量是一个数组，这个数组中包含了所有前置处理的函数，如下代码所示：

```js
preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
```

由上代码可知 `preTransforms` 变量的值是使用 `pluckModuleFunction` 函数从 `options.modules` 编译器选项中读取 `preTransformNode` 字段筛选出来的。具体的筛选过程在前面的章节中我们已经讲解过了，这里就不再细说。

我来说一说编译器选项中的 `modules`，在 [理解编译器代码的组织方式](./80vue-compiler-start.md#理解编译器代码的组织方式) 一节中我们知道编译器的选项来自于两部分，一部分是创建编译器时传递的基本选项(`baseOptions`)，另一部分则是在使用编译器编译模板时传递的选项参数。如下是创建编译器时的基本选项：

```js
import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

const { compile, compileToFunctions } = createCompiler(baseOptions)
```

如上代码来自 `src/platforms/web/compiler/index.js` 文件，可以看到 `baseOptions` 导入自 `src/platforms/web/compiler/options.js` 文件，对于基本选项的解析我们在 [compile 的作用](./80vue-compiler-start.md#compile-的作用) 一节中做了详细的讲解，并且整理了 [附录/编译器选项](../appendix/compiler-options.md)，如果大家忘记了可以回头查看。

最终我们了解到编译器选项的 `modules` 选项来自 `src/platforms/web/compiler/modules/index.js` 文件导出的一个数组，如下：

```js
import klass from './class'
import style from './style'
import model from './model'

export default [
  klass,
  style,
  model
]
```

如果把 `modules` 数组展开的话，它长成如下这个样子：

```js
[
  // klass
  {
    staticKeys: ['staticClass'],
    transformNode,
    genData
  },
  // style
  {
    staticKeys: ['staticStyle'],
    transformNode,
    genData
  },
  // model
  {
    preTransformNode
  }
]
```

根据如上数组可以发现 `modules` 数组中的每一个元素都是一个对象，并且 `klass` 对象和 `style` 对象都拥有 `transformNode` 属性，而 `model` 对象中则有一个 `preTransformNode` 属性。我们打开 `src/compiler/parser/index.js` 文件，找到如下代码：

```js
preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
```

这时我们应该知道 `preTransforms` 变量应该是一个数组：

```js
preTransforms = [
  preTransformNode
]
```

并且数组中只有一个元素 `preTransformNode`，而这里的 `preTransformNode` 就是来自于 `src/platforms/web/compiler/modules/model.js` 文件中的 `preTransformNode` 函数。接下来我们要重点讲解的就是 `preTransformNode` 函数的作用，既然它是用来对元素描述对象做前置处理的，我们就看看它都做了哪些处理。

:::tip
为了方便描述，后续我们会把 `src/platforms/web/compiler/modules/model.js` 文件简称 `model.js` 文件（注意：此约定仅限当前章节）
:::

如下是 `preTransformNode` 函数的签名以及函数体内一开始的一段代码：

```js
function preTransformNode (el: ASTElement, options: CompilerOptions) {
  if (el.tag === 'input') {
    const map = el.attrsMap
    if (!map['v-model']) {
      return
    }

    // 省略...
  }
}
```

`preTransformNode` 函数接收两个参数，第一个参数是要预处理的元素描述对象，第二个参数则是透传过来的编译器的选项参数。在 `preTransformNode` 函数内，所有的代码都被包含在一个 `if` 条件语句中，该 `if` 语句的条件是：

```js
if (el.tag === 'input')
```

也就是说只有当前解析的标签是 `input` 标签时才会执行预处理工作，看来 `preTransformNode` 函数是用来预处理 `input` 标签的。如果当前解析的元素是 `input` 标签，则会继续判断该 `input` 标签是否使用了 `v-model` 属性：

```js
const map = el.attrsMap
if (!map['v-model']) {
  return
}
```

如果该 `input` 标签没有使用 `v-model` 属性，则函数直接返回，什么都不做。所以我们可以说 `preTransformNode` 函数要预处理的是 **使用了 `v-model` 属性的 `input` 标签**，不过还没完，我们继续看如下代码

```js {9}
let typeBinding
if (map[':type'] || map['v-bind:type']) {
  typeBinding = getBindingAttr(el, 'type')
}
if (!map.type && !typeBinding && map['v-bind']) {
  typeBinding = `(${map['v-bind']}).type`
}

if (typeBinding) {
  // 省略...
}
```

上面这段代码是 `preTransformNode` 函数中剩余的所有代码，只不过我们省略了最后一个 `if` 语句块内的代码。我们注意如上代码中高亮的 `if` 语句的条件，可以发现只有当 `typeBinding` 变量为真的情况下才会执行该 `if` 语句块内的代码，而该 `if` 语句块内的代码才是用来完成主要工作的代码。那么 `typeBinding` 变量是什么呢？实际上 `typeBinding` 变量保存的是该 `input` 标签上绑定的 `type` 属性的值，举个例子，假如有如下模板：

```html
<input v-model="val" :type="inputType" />
```

则 `typeBinding` 变量的值为字符串 `'inputType'`。我们来看源码的实现，首先是如下这段代码：

```js
if (map[':type'] || map['v-bind:type']) {
  typeBinding = getBindingAttr(el, 'type')
}
```

由于开发者在绑定属性的时候可以选择 `v-bind:` 或其缩写 `:` 两种方式，所以如上代码中分别获取了通过这两种方式绑定的 `type` 属性，如果存在其一，则使用 `getBindingAttr` 函数获取绑定的 `type` 属性的值。如果开发者没有这两种方式绑定 `type` 属性，则代码会继续执行，来到如下这段 `if` 条件语句：

```js
if (!map.type && !typeBinding && map['v-bind']) {
  typeBinding = `(${map['v-bind']}).type`
}
```

如果该 `if` 条件语句的判断条件成立，则说明该 `input` 标签没有使用非绑定的 `type` 属性，并且也没有使用 `v-bind:` 或 `:` 绑定 `type` 属性，并且开发者使用了 `v-bind`。这里大家要注意了，开发者即使没有使用 `v-bind:` 或 `:` 绑定 `type` 属性，但仍然可以通过如下方式绑定属性：

```html
<input v-model="val" v-bind="{ type: inputType }" />
```

此时就需要通过读取绑定对象的 `type` 属性来获取绑定的属性值，即：

```js
typeBinding = `(${map['v-bind']}).type`
```

如上这句代码相当于：

```js
typeBinding = `({ type: inputType }).type`
```

总之我们要想方设法获取到绑定的 `type` 属性的值，如果获取不到则说明该 `input` 标签的类型是固定不变的，因为它是非绑定的。只有当一个 `input` 表单拥有绑定的 `type` 属性时才会执行真正的预处理代码，所以现在我们可以进一步的总结：**`preTransformNode` 函数要预处理的是使用了 `v-model` 属性并且使用了绑定的 `type` 属性的 `input` 标签**。

那么要如何处理使用了 `v-model` 属性并且使用了绑定的 `type` 属性的 `input` 标签呢？来看一下 `model.js` 文件开头的一段注释：

```js
/**
 * Expand input[v-model] with dyanmic type bindings into v-if-else chains
 * Turn this:
 *   <input v-model="data[type]" :type="type">
 * into this:
 *   <input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]">
 *   <input v-else-if="type === 'radio'" type="radio" v-model="data[type]">
 *   <input v-else :type="type" v-model="data[type]">
 */
```

根据如上注释可知 `preTransformNode` 函数会将形如：

```html
<input v-model="data[type]" :type="type">
```

这样的 `input` 标签扩展为如下三种 `input` 标签：

```html
<input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]">
<input v-else-if="type === 'radio'" type="radio" v-model="data[type]">
<input v-else :type="type" v-model="data[type]">
```

我们知道在 `AST` 中一个标签对应一个元素描述对象，所以从结果上看，`preTransformNode` 函数将一个 `input` 元素描述对象扩展为三个 `input` 标签的元素描述对象。但是由于扩展后的标签由 `v-if`、`v-else-if` 和 `v-else` 三个条件指令组成，我们在前面的分析中得知，对于使用了 `v-else-if` 和 `v-else` 指令的标签，其元素描述对象是会被添加到那个使用 `v-if` 指令的元素描述对象的 `el.ifConditions` 数组中的。所以虽然把一个 `input` 标签扩展成了三个，但实际上并不会影响 `AST` 的结构，并且从渲染结果上看，也是一致的。

但为什么要将一个 `input` 标签扩展为三个呢？这里有一个重要因素，由于使用了绑定的 `type` 属性，所以该 `input` 标签的类型是不确定的，我们知道同样是 `input` 标签，但类型为 `checkbox` 的 `input` 标签与类型为 `radio` 的 `input` 标签的行为是不一样的。到代码生成的阶段大家会看到正是因为这里将 `input` 标签类型做了区分，才使得代码生成时能根据三种不同情况生成三种对应的代码，从而实现三种不同的功能。有的同学就会问了，这里不做区分可不可以？答案是可以，但是假如这里不做区分，那么当你在代码生成时是不可能知道目标 `input` 元素的类型是什么的，为了保证实现所有类型 `input` 标签的功能可用，所以你必须保证生成的代码能完成所有类型标签的工作。换句话说你要么选择在编译阶段区分类型，要么就在运行时阶段区分类型。而 `Vue` 选择了在编译阶段就将类型区分开来，这么做的好处是运行时的代码在针对某种特定类型的 `input` 标签时所执行的代码是很单一职责的。当我们后面分析代码生成时你同样能够看到，在编译阶段区分类型使得代码编写更加容易。如果从另外一个角度来讲，由于不同类型的 `input` 标签所绑定的事件未必相同，所以这也是在编译阶段区分 `input` 标签类型的一个重要因素。

接下来我们看一下具体实现，首先是如下这段代码：

```js {2-5}
if (typeBinding) {
  const ifCondition = getAndRemoveAttr(el, 'v-if', true)
  const ifConditionExtra = ifCondition ? `&&(${ifCondition})` : ``
  const hasElse = getAndRemoveAttr(el, 'v-else', true) != null
  const elseIfCondition = getAndRemoveAttr(el, 'v-else-if', true)
  // 省略...
}
```

这段代码定义了四个常量，分别是 `ifCondition`、`ifConditionExtra`、`hasElse` 以及 `elseIfCondition`，其中 `ifCondition` 常量保存的值是通过 `getAndRemoveAttr` 函数取得的 `v-if` 指令的值，注意如上代码中调用 `getAndRemoveAttr` 函数时传递的第三个参数为 `true`，所以在获取到属性值之后，会将该属性从元素描述对象的 `el.attrsMap` 中移除。

假设我们有如下模板：

```html
<input v-model="val" :type="inputType" v-if="display" />
```

则 `ifCondition` 常量的值为字符串 `'display'`。

第二个常量 `ifConditionExtra` 同样是一个字符串，还是以如上模板为例，由于 `ifCondition` 常量存在，所以 `ifConditionExtra` 常量的值为字符串 `'&&(display)'`，假若 `ifCondition` 常量不存在，则 `ifConditionExtra` 常量的值将是一个空字符串。

第三个常量 `hasElse` 是一个布尔值，它代表着 `input` 标签是否使用了 `v-else` 指令。其实现方式同样是通过 `getAndRemoveAttr` 函数获取 `v-else` 指令的属性值，然后将值与 `null` 做比较。如果 `input` 标签使用 `v-else` 指令，则 `hasElse` 常量的值为真，反之为假。

第四个常量 `elseIfCondition` 与 `ifCondition` 类似，只不过 `elseIfCondition` 所存储的是 `v-else-if` 指令的属性值。

再往下是如下这段代码：

```js
// 1. checkbox
const branch0 = cloneASTElement(el)
// process for on the main node
processFor(branch0)
addRawAttr(branch0, 'type', 'checkbox')
processElement(branch0, options)
branch0.processed = true // prevent it from double-processed
branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
addIfCondition(branch0, {
  exp: branch0.if,
  block: branch0
})
```

前面我们说过了，该 `preTransformNode` 函数的作用就是将一个拥有绑定类型和 `v-model` 指令的 `input` 标签扩展为三个 `input` 标签，这个三个 `input` 标签分别是复选按钮(`checkbox`)、单选按钮(`radio`)和其他 `input` 标签。而如上这段代码的作用就是创建复选按钮的，首先调用 `cloneASTElement` 函数克隆出一个与原始标签的元素描述对象一模一样的元素描述对象出来，并将新克隆出的元素描述对象赋值给 `branch0` 常量。我们来看一下 `cloneASTElement` 函数的实现，如下：

```js
function cloneASTElement (el) {
  return createASTElement(el.tag, el.attrsList.slice(), el.parent)
}
```

其实现很简单，就是通过 `createASTElement` 函数再创建出一个元素描述对象即可，不过由于 `el.attrsList` 数组是引用类型，所以为了避免克隆的元素描述对象与原始描述对象互相干扰，所以需要使用数组的 `slice` 方法复刻出一个新的 `el.attrList` 数组。

拿到了克隆出的新元素描述对象后需要做什么呢？很简单啊，该怎么处理就怎么处理呗，打开 `src/compiler/parser/index.js` 文件，在解析开始标签的 `start` 钩子函数中有如下这样一段代码：

```js {4-9}
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

如上高亮代码所示，对于一个不在 `v-pre` 指令内的标签，会使用四个 `process*` 函数处理它，所以在 `preTransformNode` 函数中同样需要这四个 `process*` 函数对标签的元素描述对象做处理，如下高亮代码所示：

```js {4,6}
// 1. checkbox
const branch0 = cloneASTElement(el)
// process for on the main node
processFor(branch0)
addRawAttr(branch0, 'type', 'checkbox')
processElement(branch0, options)
branch0.processed = true // prevent it from double-processed
branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
addIfCondition(branch0, {
  exp: branch0.if,
  block: branch0
})
```

注意如上两句高亮的代码，分别调用了 `processFor` 函数和 `processElement` 函数，大家应该已经注意到了，这里并没有调用 `processOnce` 函数以及 `processIf` 函数，为什么没有调用这两个函数呢？对于 `processOnce` 函数，既然没有调用该函数，那么就能说明一个问题，即如下代码中的 `v-once` 指令无效：

```html
<input v-model="val" :type="inputType" v-once />
```

大家想象一下这样设计是否合理？我认为这是合理的，对于一个既使用了 `v-model` 指令又使用了绑定的 `type` 属性的 `input` 标签而言，难道它还存在静态的意义吗。

除了没有调用 `processOnce` 函数之外，还没有调用 `processIf` 函数，这是因为对于条件指令早已经处理完了，如下是我们前面讲解过的代码：

```js
const ifCondition = getAndRemoveAttr(el, 'v-if', true)
const ifConditionExtra = ifCondition ? `&&(${ifCondition})` : ``
const hasElse = getAndRemoveAttr(el, 'v-else', true) != null
const elseIfCondition = getAndRemoveAttr(el, 'v-else-if', true)
```

实际上 `preTransformNode` 函数的处理逻辑就是把一个 `input` 标签扩展为多个标签，并且这些扩展出来的标签彼此之间是互斥的，后面大家会看到这些扩展出来的标签都存在于元素描述对象的 `el.ifConditions` 数组中。

我们接着看代码，如下高亮代码所示：

```js {5}
// 1. checkbox
const branch0 = cloneASTElement(el)
// process for on the main node
processFor(branch0)
addRawAttr(branch0, 'type', 'checkbox')
processElement(branch0, options)
branch0.processed = true // prevent it from double-processed
branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
addIfCondition(branch0, {
  exp: branch0.if,
  block: branch0
})
 ```

在 `processFor` 函数和 `processElement` 函数中调用了 `addRawAttr` 函数，该函数来自于 `src/compiler/helpers.js` 文件，其源码如下：

```js
export function addRawAttr (el: ASTElement, name: string, value: any) {
  el.attrsMap[name] = value
  el.attrsList.push({ name, value })
}
```

代码很容易理解，`addRawAttr` 函数的作用就是将属性的名和值分别添加到元素描述对象的 `el.attrsMap` 对象以及 `el.attrsList` 数组中。以如下这句话为例：

```js
addRawAttr(branch0, 'type', 'checkbox')
```

这么做就等价于把新克隆出来的标签视作：

```html
<input type="checkbox" />
```

通过这句话大家应该也能认识到预处理的意义，在预处理中你甚至可以把一个 `div` 标签预处理成 `span` 标签，而后续的处理完全感知不到这一点，并且会把这个标签当做 `span` 标签处理。

继续往下看代码，如下高亮代码所示：

```js {7}
// 1. checkbox
const branch0 = cloneASTElement(el)
// process for on the main node
processFor(branch0)
addRawAttr(branch0, 'type', 'checkbox')
processElement(branch0, options)
branch0.processed = true // prevent it from double-processed
branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
addIfCondition(branch0, {
  exp: branch0.if,
  block: branch0
})
```

如上高亮的这句代码将元素描述对象的 `el.processed` 属性设置为 `true`，标识着当前元素描述对象已经被处理过了，我们回到 `src/compiler/parser/index.js` 文件中 `start` 钩子函数的如下这段代码：

```js {3}
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

注意如上高亮的那句代码所示，由于 `preTransformNode` 函数是在如上这段代码之前应用的，所以当程序执行到如上这段代码时，由于此时的 `el.processed` 属性的值已经为 `true`，所以判断条件将会为假，即 `elseif` 语句块内的代码将不会被执行。这么做的目的是为了避免重复的解析。

对于第一个克隆的元素描述对象来说，最后执行的将是如下高亮的代码：

```js {8-12}
// 1. checkbox
const branch0 = cloneASTElement(el)
// process for on the main node
processFor(branch0)
addRawAttr(branch0, 'type', 'checkbox')
processElement(branch0, options)
branch0.processed = true // prevent it from double-processed
branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
addIfCondition(branch0, {
  exp: branch0.if,
  block: branch0
})
```

这段代码为元素描述对象添加了 `el.if` 属性，其 `if` 属性值为：

```js
`(${typeBinding})==='checkbox'` + ifConditionExtra
```

假设我们有如下模板：

```html
<input v-model="val" :type="inputType" v-if="display" />
```

则 `el.if` 属性的值将为：`'(${inputType})==='checkbox'&&display`，可以看到只有当本地状态 `inputType` 的值为字符串 `'checkbox'` 并且本地状态 `display` 为真时才会渲染该复选按钮。

另外我们知道如果一个标签使用了 `v-if` 指令，则该标签的元素描述对象被添加到其自身的 `el.ifConditions` 数组中，所以需要执行如下高亮的代码：

```js {9-12}
// 1. checkbox
const branch0 = cloneASTElement(el)
// process for on the main node
processFor(branch0)
addRawAttr(branch0, 'type', 'checkbox')
processElement(branch0, options)
branch0.processed = true // prevent it from double-processed
branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
addIfCondition(branch0, {
  exp: branch0.if,
  block: branch0
})
```

至此，对于第一个扩展出来的复选按钮就算告一段落了，我们接着看后面的代码，如下：

```js
// 2. add radio else-if condition
const branch1 = cloneASTElement(el)
getAndRemoveAttr(branch1, 'v-for', true)
addRawAttr(branch1, 'type', 'radio')
processElement(branch1, options)
addIfCondition(branch0, {
  exp: `(${typeBinding})==='radio'` + ifConditionExtra,
  block: branch1
})
// 3. other
const branch2 = cloneASTElement(el)
getAndRemoveAttr(branch2, 'v-for', true)
addRawAttr(branch2, ':type', typeBinding)
processElement(branch2, options)
addIfCondition(branch0, {
  exp: ifCondition,
  block: branch2
})
```

这段代码可以分成两部分，与扩展复选按钮一样，如上这段代码中，第一部分用来扩展单选按钮，而第二部分用来扩展其他类型的 `input` 标签。需要注意的有两点，第一点是如上代码中无论是扩展单选按钮还是扩展其他类型的 `input` 标签，它们都重新使用 `cloneASTElement` 函数克隆出了新的元素描述对象并且这两个元素描述对象都会被添加到复选按钮元素描述对象的 `el.ifConditions` 数组中。第二点需要注意的是无论是扩展单选按钮还是扩展其他类型的 `input` 标签，它们都执行如下这句代码：

```js
getAndRemoveAttr(branch2, 'v-for', true)
```

这句代码的意义就是单纯的将克隆出来的元素描述对象中的 `v-for` 属性移除掉，因为在复选按钮中已经使用 `processFor` 处理过了 `v-for` 指令，由于它们本是互斥的，其本质上等价于是同一个元素，只是根据不同的条件渲染不同的标签罢了，所以 `v-for` 指令处理一次就够了。

再往下执行的是如下这段代码：

```js
if (hasElse) {
  branch0.else = true
} else if (elseIfCondition) {
  branch0.elseif = elseIfCondition
}
```

这段代码的作用是什么呢？在前面的讲解中，我们所举的例子都是使用 `v-if` 指令的 `input` 标签，但该 `input` 标签也有可能使用 `v-else-if` 或 `v-else` 啊，如下：

```html
<div v-if="num === 1"></div>
<input v-model="val" :type="inputType" v-else />
```

最后 `preTransformNode` 函数将返回一个全新的元素描述对象：

```js {6}
function preTransformNode (el: ASTElement, options: CompilerOptions) {
  if (el.tag === 'input') {
    // 省略...
    if (typeBinding) {
      // 省略...
      return branch0
    }
  }
}
```

我们再回到 `src/compiler/parser/index.js` 文件找到应用预处理钩子的代码，如下：

```js {3}
// apply pre-transforms
for (let i = 0; i < preTransforms.length; i++) {
  element = preTransforms[i](element, options) || element
}
```

可以看到如果通过预处理函数处理之后得到了新的元素描述对象，则使用新的元素描述对象替换当前元素描述对象(`element`)，否则依然使用 `element` 作为元素描述对象。

## transformNode 中置处理

在前置处理中，目前只有一个用来处理使用了 `v-model` 指令并且使用绑定的 `type` 属性的 `input` 标签的前置处理函数。与之不同，中置处理函数 `transformNode` 则有两，分别用来对 `class` 属性和 `style` 属性进行扩展，我们打开 `src/compiler/parser/index.js` 函数找到 `processElement` 函数，如下高亮代码所示：

```js {11-13}
export function processElement (element: ASTElement, options: CompilerOptions) {
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  element.plain = !element.key && !element.attrsList.length

  processRef(element)
  processSlot(element)
  processComponent(element)
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  processAttrs(element)
}
```

可以看到中置处理函数的应用时机是在 `processAttrs` 函数之前，使用 `for` 循环遍历了 `transforms` 数组，`transforms` 数组中包含两个 `transformNode` 函数，分别来自 `src/platforms/web/compiler/modules/class.js` 文件和 `src/platforms/web/compiler/modules/style.js` 文件。根据文件名我们也能大概猜到这两个中置处理函数的作用是什么，我们首先来看 `class.js` 文件，打开该文件找到 `transformNode` 函数，如下：

```js
function transformNode (el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  const staticClass = getAndRemoveAttr(el, 'class')
  if (process.env.NODE_ENV !== 'production' && staticClass) {
    const res = parseText(staticClass, options.delimiters)
    if (res) {
      warn(
        `class="${staticClass}": ` +
        'Interpolation inside attributes has been removed. ' +
        'Use v-bind or the colon shorthand instead. For example, ' +
        'instead of <div class="{{ val }}">, use <div :class="val">.'
      )
    }
  }
  if (staticClass) {
    el.staticClass = JSON.stringify(staticClass)
  }
  const classBinding = getBindingAttr(el, 'class', false /* getStatic */)
  if (classBinding) {
    el.classBinding = classBinding
  }
}
```

在该 `transformNode` 函数内，首先执行是如下两句代码：

```js
const warn = options.warn || baseWarn
const staticClass = getAndRemoveAttr(el, 'class')
```

定义 `warn` 常量，它是一个函数，用来打印警告信息。接着使用 `getAndRemoveAttr` 函数从元素描述对象上获取非绑定的 `class` 属性的值，并将其保存在 `staticClass` 常量中。接着进入一段 `if` 条件语句：

```js
if (process.env.NODE_ENV !== 'production' && staticClass) {
  const res = parseText(staticClass, options.delimiters)
  if (res) {
    warn(
      `class="${staticClass}": ` +
      'Interpolation inside attributes has been removed. ' +
      'Use v-bind or the colon shorthand instead. For example, ' +
      'instead of <div class="{{ val }}">, use <div :class="val">.'
    )
  }
}
```

在非生产环境下，并且非绑定的 `class` 属性值存在，则会使用 `parseText` 函数解析该值，如果解析成功则说明你在非绑定的 `class` 属性中使用了字面量表达式，例如：

```html
<div class="{{ isActive ? 'active' : '' }}"></div>
```

这时 `Vue` 会打印警告信息，提示你使用如下这种方式替代：

```html
<div :class="{ 'active': isActive }"></div>
```

再往下是这样一段代码：

```js
if (staticClass) {
  el.staticClass = JSON.stringify(staticClass)
}
```

如果非绑定的 `class` 属性值存在，则将该值保存在元素描述对象的 `el.staticClass` 属性中，注意这里使用 `JSON.stringify` 对值做了处理，这么做的目的我们已经说过很多遍了。再往下是该 `transformNode` 函数的最后一段代码：

```js
const classBinding = getBindingAttr(el, 'class', false /* getStatic */)
if (classBinding) {
  el.classBinding = classBinding
}
```

这段代码使用了 `getBindingAttr` 函数获取绑定的 `class` 属性的值，如果绑定的 `class` 属性的值存在，则将该值保存在 `el.classBinding` 属性中。

以上就是中置处理对于 `class` 属性的处理方式，我们做一个简短的总结：

* 非绑定的 `class` 属性值保存在元素描述对象的 `el.staticClass` 属性中，假设有如下模板：

```html
<div class="a b c"></div>
```

则该标签元素描述对象的 `el.staticClass` 属性值为：

```js
el.staticClass = JSON.stringify('a b c')
```

* 绑定的 `class` 属性值保存在元素描述对象的 `el.classBinding` 属性中，假设我们有如下模板：

```html
<div :class="{ 'active': isActive }"></div>
```

则该标签元素描述对象的 `el.classBinding` 属性值为：

```js
el.classBinding = "{ 'active': isActive }"
```

对于 `style` 属性的处理与对 `class` 属性的处理类似，用于处理 `style` 属性的中置处理函数位于 `src/platforms/web/compiler/modules/style.js` 文件，如下：

```js
function transformNode (el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  const staticStyle = getAndRemoveAttr(el, 'style')
  if (staticStyle) {
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      const res = parseText(staticStyle, options.delimiters)
      if (res) {
        warn(
          `style="${staticStyle}": ` +
          'Interpolation inside attributes has been removed. ' +
          'Use v-bind or the colon shorthand instead. For example, ' +
          'instead of <div style="{{ val }}">, use <div :style="val">.'
        )
      }
    }
    el.staticStyle = JSON.stringify(parseStyleText(staticStyle))
  }

  const styleBinding = getBindingAttr(el, 'style', false /* getStatic */)
  if (styleBinding) {
    el.styleBinding = styleBinding
  }
}
```

可以看到，用来处理 `style` 属性的 `transformNode` 函数基本与用来处理 `class` 属性的 `transformNode` 函数相同，这里大家要额外注意如下这句代码：

```js
el.staticStyle = JSON.stringify(parseStyleText(staticStyle))
```

与 `class` 属性不同，如果一个标签使用了非绑定的 `style` 属性，则会使用 `parseStyleText` 函数对属性值进行处理，`parseStyleText` 函数来自 `src/platforms/web/util/style.js` 文件，那么 `parseStyleText` 函数会如何处理非绑定的 `style` 属性值呢？举个例子，如下模板所示：

```html
<div style="color: red; background: green;"></div>
```

如上模板中使用了非绑定的 `style` 属性，属性值为字符串 `'color: red; background: green;'`，`parseStyleText` 函数会把这个字符串解析为对象形式，如下：

```js
{
  color: 'red',
  background: 'green'
}
```

最后再使用 `JSON.stringify` 函数将如上对象变为字符串后赋值给元素描述对象的 `el.staticStyle` 属性。

我们来看一下 `parseStyleText` 函数是如何将样式字符串解析为对象的，如下是 `parseStyleText` 函数的源码：

```js
export const parseStyleText = cached(function (cssText) {
  const res = {}
  const listDelimiter = /;(?![^(]*\))/g
  const propertyDelimiter = /:(.+)/
  cssText.split(listDelimiter).forEach(function (item) {
    if (item) {
      var tmp = item.split(propertyDelimiter)
      tmp.length > 1 && (res[tmp[0].trim()] = tmp[1].trim())
    }
  })
  return res
})
```

由以上代码可知 `parseStyleText` 函数是由 `cached` 函数创建的高阶函数，`parseStyleText` 接收内联样式字符串作为参数并返回解析后的对象。在 `parseStyleText` 函数内部首先定义了 `res` 常量，该常量就会作为 `parseStyleText` 函数的返回值，其初始值是一个空对象，接着定义了两个正则常量 `listDelimiter` 和 `propertyDelimiter`，其实把一个内联样式字符串解析为对象的思路很简单，首先我们要找到样式字符串的规则，如下：

```js
<div style="color: red; background: green;"></div>
```

可以看到在样式字符串中分号(`;`)用来作为每一条样式规则的分割，而冒号(`:`)则用来一条样式规则中属性名与值的分割，所以我们有如下思路：

* 1、使用分号(`;`)把样式字符串分割为一个数组，数组中的每个元素都是一条样式规则，以如上模板为例，分割后的数组应该是：

```js
[
  'color: red',
  'background: green'
]
```

接着遍历该数组，对于每一条样式规则使用冒号(`:`)将其属性名与值再次进行分割，这样我们就能够得到想要的结果了。明白了这个思路再去看 `parseStyleText` 函数的代码就会很容易理解。

对于 `parseStyleText` 函数的逻辑我们不做过多解释，这里我们重点来说一下 `listDelimiter` 正则，如下：

```js
const listDelimiter = /;(?![^(]*\))/g
```

该正则表达式使用了 **正向否定查找(`(?!`)**，什么是正向否定查找呢？举个例子，正则表达式 `/a(?!b)/`用来匹配后面没有跟字符 `'b'` 的字符 `'a'`。所以如上正则表达式用来全局匹配字符串中的分号(`;`)，但是该分号必须满足一个条件，即 **该分号的后面不能跟左圆括号(`)`)，除非有一个相应的右圆括号(`(`)存在**，说起来有点抽象，我们还是举例说明，如下模板所示：

```html
<div style="color: red; background: url(www.xxx.com?a=1&amp;copy=3);"></div>
```

大家仔细观察如上 `div` 标签的 `style` 属性值中存在几个分号？答案是三个分号，但只有其中两个分号才是真正的样式规则分割符，而字符串 `'url(www.xxx.com?a=1&amp;copy=3)'` 中的分号则是不能作为样式规则分割符的，正则常量 `listDelimiter` 正是为了实现这个功能而设计的。有的同学可能会问为什么 `url` 中会带有分号(`;`)，实际上正如上面的例子所示，我们知道内联样式是写在 `html` 文件中的，而在 `html` 规范中存在一个叫做 `html实体` 的概念，我们来看如下这段 `html` 模板：

```html
<a href="foo.cgi?chapter=1&copy=3">link</a>
```

这段 `html` 模板在一些浏览器中不能正常工作，这是因为有些浏览器会把 `&copy` 当做 `html` 实体从而把其解析为字符 `©`，这就导致当你打开该链接时，变成了访问：`foo.cgi?chapter=1©=3`。具体的内容大家可以查看这里：[Ampersands (&'s) in URLs](http://htmlhelp.com/tools/validator/problems.html#amp)。

总之，对于非绑定的 `style` 属性，会在该元素描述对象上添加 `el.staticStyle` 属性，该属性的值是一个字符串化后的对象。接着对于绑定的 `style` 属性，则会使用如下这段代码来处理：

```js
const styleBinding = getBindingAttr(el, 'style', false /* getStatic */)
if (styleBinding) {
  el.styleBinding = styleBinding
}
```

与处理绑定的 `class` 属性类似，使用 `getBindingAttr` 函数获取到绑定的 `style` 属性值后，如果值存在则直接将其赋值给元素描述对象的 `el.styleBinding` 属性。

以上就是中置处理对于 `style` 属性的处理方式，我们做一个简短的总结：

* 非绑定的 `style` 属性值保存在元素描述对象的 `el.staticStyle` 属性中，假设有如下模板：

```html
<div style="color: red; background: green;"></div>
```

则该标签元素描述对象的 `el.staticStyle` 属性值为：

```js
el.staticStyle = JSON.stringify({
  color: 'red',
  background: 'green'
})
```

* 绑定的 `style` 属性值保存在元素描述对象的 `el.styleBinding` 属性中，假设我们有如下模板：

```html
<div :style="{ fontSize: fontSize + 'px' }"></div>
```

则该标签元素描述对象的 `el.styleBinding` 属性值为：

```js
el.styleBinding = "{ fontSize: fontSize + 'px' }"
```

现在前置处理(`preTransformNode`)和中置处理(`transformNode`)我们都讲完了，还剩下后置处理(`postTransformsNode`)没有讲，每当遇到非一元标签的结束标签或遇到一元标签时则会应用后置处理，我们回到 `src/compiler/parser/index.js` 文件，如下高亮的代码所示：

```js {10-12}
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

该 `for` 循环遍历了 `postTransforms` 数组，但实际上 `postTransforms` 是一个空数组，因为目前还没有任何后置处理的钩子函数。这里只是暂时提供一个用于后置处理的出口，当有需要的时候可以使用。

## 文本节点的元素描述对象

接下来我们主要讲解当解析器遇到一个文本节点时会如何为文本节点创建元素描述对象，又会如何对文本节点做哪些特殊的处理。我们打开 `src/compiler/parser/index.js` 文件找到 `parseHTML` 函数的 `chars` 钩子函数选项，如下高亮代码所示：

```js {3-5}
parseHTML(template, {
    // 省略...
    chars (text: string) {
      // 省略...
    },
    // 省略...
  })
  return root
}
```

当解析器遇到文本节点时，如上代码中的 `chars` 钩子函数就会被调用，并且接收该文本节点的文本内容作为参数。我们来看 `chars` 钩子函数最开始的这段代码：

```js
if (!currentParent) {
  if (process.env.NODE_ENV !== 'production') {
    if (text === template) {
      warnOnce(
        'Component template requires a root element, rather than just text.'
      )
    } else if ((text = text.trim())) {
      warnOnce(
        `text "${text}" outside root element will be ignored.`
      )
    }
  }
  return
}
```

这段代码是连续的几个 `if` 条件语句，首先判断了 `currentParent` 变量是否存在，我们知道 `currentParent` 变量指向的是当前节点的父节点，如果父节点不存在才会执行该 `if` 条件语句里面的代码。大家思考一下，如果 `currentParent` 变量不存在说明什么问题？我们知道如果代码执行到了这里，那么当前节点必然是文本节点，并且该文本节点没有父级节点。什么情况下会出现一个文本节点没有父级节点呢？有两种情况：

* 第一：模板中只有文本节点

```html
<template>
  我是文本节点
</template>
```

如上模板中没有根元素，只有一个文本节点。由于没有元素节点，所以 `currentParent` 变量是肯定不存在值的，而 `Vue` 的模板要求必须要有一个根元素节点才行。当解析器在解析如上模板时，由于模板只有一个文本节点，所以在解析过程中只会调用一次 `chars` 钩子函数，同时将文本节点的内容作为参数传递，此时就会出现一种情况，即：“整个模板的内容与文本节点的内容完全一致”，换句话说 `text === template` 条件成立，这时解析器会打印警告信息提示模板不能只是文本，必须有一个元素节点才行。

* 第二：文本节点在根元素的外面

```html
<template>
  <div>根元素内的文本节点</div>根元素外的文本节点
</template>
```

我们知道 `currentParent` 变量始终保存的是当前解析节点的父节点，当解析器解析如上模板并遇到根元素外的文本节点时，`currentParent` 变量是不存在的，但是此时条件 `text === template` 是不成立的，这时如下代码会被执行：

```js
else if ((text = text.trim())) {
  warnOnce(
    `text "${text}" outside root element will be ignored.`
  )
}
```

即如果 `text` 是非空的字符串则打印警告信息提示开发者根元素外的文本将会被忽略。

如果模板不符合以上要求则此时 `chars` 钩子函数会立即 `return`，不会继续做后续的工作，如果模板符合要求则将会继续执行如下代码：

```js
// IE textarea placeholder bug
/* istanbul ignore if */
if (isIE &&
  currentParent.tag === 'textarea' &&
  currentParent.attrsMap.placeholder === text
) {
  return
}
```

这段代码是用来解决 IE 浏览器中渲染 `<textarea>` 标签的 `placeholder` 属性时存在的 bug 的。具体的问题大家可以点击这个 [issue](https://github.com/vuejs/vue/issues/4098) 查看。为了让大家更好理解，我们举个例子，如下 `html` 代码所示：

```html
<div id="box">
  <textarea placeholder="some placeholder..."></textarea>
</div>
```

如上 `html` 片段存在一个 `<textarea>` 标签，该标签拥有 `placeholder` 属性，但却没有真实的文本内容，假如我们使用如下代码获取字符串内容：

```js
document.getElementById('box').innerHTML
```

在 IE 浏览器中将得到如下字符串：

```js
'<textarea placeholder="some placeholder...">some placeholder...</textarea>'
```

可以看到 `<textarea>` 标签的 `placeholder` 属性的属性值被设置成了 `<textarea>` 的真实文本内容，为了解决这个问题，所以产生了如下代码：

```js
// IE textarea placeholder bug
/* istanbul ignore if */
if (isIE &&
  currentParent.tag === 'textarea' &&
  currentParent.attrsMap.placeholder === text
) {
  return
}
```

如果当前文本节点的父元素是 `<textarea>` 标签，并且文本元素的内容和 `<textarea>` 标签的 `placeholder` 属性值相同，则说明此时遇到了 IE 的 bug，由于只有当 `<textarea>` 标签没有真实文本内容时才存在这个 bug，所以这说明当前解析的文本节点原本就是不存在的，这时 `chars` 钩子函数会直接 `return`，不做后续处理。

再往下是这样一段代码：

```js
const children = currentParent.children
text = inPre || text.trim()
  ? isTextTag(currentParent) ? text : decodeHTMLCached(text)
  // only preserve whitespace if its not right after a starting tag
  : preserveWhitespace && children.length ? ' ' : ''
```

这段代码首先定义了 `children` 常量，它是 `currentParent.children` 的引用。接着判断了条件 `inPre || text.trim()` 的真假，我们一点点来看，假设此时 `inPre` 变量为真，那么如上代码等价于：

```js
text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
```

如上代码中首先使用 `isTextTag` 函数检测当前文本节点的父节点是否是文本标签(即 `<script>` 标签或 `<style>` 标签)，如果当前文本节点的父节点是文本标签，那么则原封不动的保留原始文本，否则使用 `decodeHTMLCached` 函数对文本进行解码，其中关键点在于一定要使用 `decodeHTMLCached` 函数解码文本才行，为什么呢？来看如下代码：

```js
<pre>
  &lt;div&gt;我是一个DIV&lt;/div&gt;
</pre>
```

我们通常会使用 `<pre>` 标签展示源码，所以通常会书写 `html` 实体，假如不对如上 `html` 实体进行解码，那么最终展示在页面上的内容就是字符串 `'&lt;div&gt;我是一个DIV&lt;/div&gt;'` 而非 `'<div>我是一个DIV</div>'`，这是因为 `Vue` 在创建文本节点时使用的是 `document.createTextNode` 函数，这不同于将如上模板直接交给浏览器解析并渲染，所以需要解码后将字符串 `'<div>我是一个DIV</div>'` 作为一个文本节点创建才行。

我们再回头来看一下这段代码：

```js
text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
```

这段代码还使用 `isTextTag` 函数检测了当前文本节点的父节点是否是文本标签，如果是文本标签则直接使用原始文本，而不会使用 `decodeHTMLCached` 函数对文本进行解码。这时我们考虑的就不应该是 `inPre` 变量为真的情况了，而是 `text.trim()` 这个条件为真的情况，当 `text.trim()` 为真时说明当前文本节点的内容不是空白，只要不是空白的文本并且该文本存在于文本标签之内，那么该文本就不需要进行解码操作，比如存在于 `<script>` 标签或 `<style>` 标签之内的文本。

我们再来看如下高亮代码：

```js {4}
text = inPre || text.trim()
  ? isTextTag(currentParent) ? text : decodeHTMLCached(text)
  // only preserve whitespace if its not right after a starting tag
  : preserveWhitespace && children.length ? ' ' : ''
```

如果条件 `inPre || text.trim()` 为假，则会执行如上代码中高亮的部分，那么如上代码相当于：

```js
text = preserveWhitespace && children.length ? ' ' : ''
```

首先我们要明确的是当条件 `inPre || text.trim()` 为假时代表什么，我们对该条件取反：`!inPre && !text.trim()`，取反后的条件很容易理解，用一句话描述就是 **不存在于 `<pre>` 标签内的空白符**，有的同学可能会有疑问，此时 `text` 一定是空白符吗？难道不可能是空字符串吗？当然不可能是空字符串，因为如果 `text` 是空字符串则代码是不会执行 `chars` 钩子函数的。那么对于不存在于 `<pre>` 标签内的空白符要如何处理呢？我们来看如下代码：

```js
text = preserveWhitespace && children.length ? ' ' : ''
```

如上代码是一个三元运算符，如果 `preserveWhitespace` 常量为真并且当前文本节点的父节点有子元素存在，则将 `text` 变量设置为空格字符(`' '`)，否则将 `text` 变量设置为空字符串。其中 `preserveWhitespace` 常量是一个布尔值代表着是否保留空格，只有它为真的情况下才会保留空格。但即使 `preserveWhitespace` 常量的值为真，如果当前节点的父节点没有子元素则也不会保留空格，换句话说，编译器只会保留那些 **不存在于开始标签之后的空格**。而这也体现在了编译器源码的注释中，如下：

```js {3}
text = inPre || text.trim()
  ? isTextTag(currentParent) ? text : decodeHTMLCached(text)
  // only preserve whitespace if its not right after a starting tag
  : preserveWhitespace && children.length ? ' ' : ''
```

默认情况下编译器是会保留空格的，除非你显示的指定编译器选项 `preserveWhitespace` 的值为 `false` 时才会不保留空格。

我们来做一下总结：

* 1、如果文本节点是非空白符，无论其在不在 `<pre>` 标签之内，只要其不在文本标签内就会对文本进行解码，否则不会解码。
* 2、如果文本节点是空白符
  * 2.1、空白符存在于 `<pre>` 标签之内，则完全保留
  * 2.2、空白符不存在于 `<pre>` 标签之内，则根据编译器选项配置来决定是否保留空白，并且只会保留那些不存在于开始标签之后的空白符。

再往下我们将来到 `chars` 钩子函数的最后一段代码：

```js
if (text) {
  // 省略...
}
```

这是一个 `if` 条件语句，可以看到该条件语句块内的代码只有当 `text` 变量存在时才会执行，所以当编译器选项 `preserveWhitespace` 的值为 `false` 时，所有空白符都会被忽略，从而导致不会执行如上这段 `html` 代码，所以也就没有空白符节点被创建。我们来看一下该 `if` 条件语句块内的代码，如下：

```js
let res
if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
  children.push({
    type: 2,
    expression: res.expression,
    tokens: res.tokens,
    text
  })
} else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
  children.push({
    type: 3,
    text
  })
}
```

我们首先来看一下如上代码中 `if` 语句的判断条件：

```js
if (!inVPre && text !== ' ' && (res = parseText(text, delimiters)))
```

如果上面的 `if` 语句的判断条件为真则说明：

* 1、当前文本节点不存在于使用 `v-pre` 指令的标签之内
* 2、当前文本节点不是空格字符
* 3、使用 `parseText` 函数成功解析当前文本节点的内容

对于前两个条件很好理解，关键在于 `parseText` 函数能够成功解析文本节点的内容说明了什么，如下模板所示：

```html
<div>我的名字是：{{ name }}</div>
```

如上模板中存在一个文本节点，该节点的文本内容是字符串：`'我的名字是：{{ name }}'`，这个字符串并不是普通的字符串，它包含了 `Vue` 语法中的字面量表达式，而 `parseText` 函数的作用就是用来解析这段包含了字面量表达式的文本的，如果解析成功则说明该文本节点的内容确实包含字面量表达式，所以此时会执行以下代码创建一个类型为2(`type = 2`)的元素描述对象：

```js
if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
  children.push({
    type: 2,
    expression: res.expression,
    tokens: res.tokens,
    text
  })
}
```

并将该文本节点的元素描述对象添加到父级的子节点中，另外我们注意到类型为 `2` 的元素描述对象拥有三个特殊的属性，分别是 `expression`、`tokens` 以及 `text`，其中 `text` 就是原始的文本内容，而 `expression` 和 `tokens` 的值是通过 `parseText` 函数解析的结果中读取的。至于 `parseText` 函数的具体实现我们会在下一小节中讲解。

如果 `if` 语句的判断条件失败，则有三种可能：

* 1、文本节点存在于使用了 `v-pre` 指令的标签之内
* 2、文本节点是空格字符
* 3、文本节点的文本内容通过 `parseText` 函数解析失败

只要以上三种情况中，有一种情况出现则代码会来到 `else...if` 分支的判断，如下：

```js
else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
  children.push({
    type: 3,
    text
  })
}
```

如果 `else...if` 语句的判断条件成立，则有以下几种可能：

* 1、文本内容不是空格，即 `text !== ' '`
* 2、如果文本内容是空格，但是该文本节点的父节点还没有子节点(即 `!children.length`)，这说明当前文本内容就是父节点的第一个子节点
* 3、如果文本内容是空格，并且该文本节点的父节点有子节点，但最后一个子节点不是空格，此时也会执行 `else...if` 语句块内的代码

当文本满足以上条件，就会被当做普通文本节点对待，此时会创建类型为3(`type = 3`)的元素描述对象，并将其添加到父级节点的子节点中。

实际上以上分析并不足以让大家理解这么做的目的，但是我们综合思考就会容易得出如下结论：

* 1、如果文本节点存在于 `v-pre` 标签中，则会被作为普通文本节点对象
* 2、`<pre>` 标签内的空白会被保留
* 3、`preserveWhitespace` 只会保留那些不在开始标签之后的空格(说空白也没问题)
* 4、普通文本节点的元素描述对象的类型为 3，即 `type = 3`
* 5、包含字面量表达式的文本节点不会被作为普通的文本节点对待，而是会使用 `parseText` 函数解析它们，并创建一个类型为 2，即 `type = 2` 的元素描述对象

## parseText 函数解析字面量表达式

在上一小节的讲解中我们了解到文本节点的内容是需要通过 `parseText` 函数解析的，为什么要使用 `parseText` 函数解析文本节点呢？这是因为文本节点中很可能包含字面量表达式，我们所说的字面量表达式指的是使用花括号(`{{}}`)或自定义模板符号所定义的表达式，例如如下 `<p>` 标签内的文本：

```html
<p>我的名字叫：{{name}}</p>
```

如上 `<p>` 标签内的文本在解析阶段会被当做一个普通的文本节点，可是该文本节点却包含了 `Vue` 的模板语法，所以需要使用 `parseText` 对其进行解析，为了让大家更好地理解 `parseText` 函数的作用，我们需要先了解 `parseText` 函数的最终目的。我们知道模板最终会被编译器编译为渲染函数，而如上文本节点被编译后将以如下表达式存在于渲染函数中：

```js
"我的名字叫："+_s(name)
```

可以看到编译的结果分为两部分，第一部分是普通文本：`"我的名字叫："`，另外一部分是把字面量表达式中的表达式提取出来并作为 `_s` 函数的参数，这里大家暂时把 `_s` 函数理解成与 `toString` 函数的功能类似即可，并没有什么特别之处。看到这里相信你已经明白 `parseText` 函数的作用了，没错它的作用就是用来识别一段文本节点内容中的普通文本和字面量表达式并把他们按顺序拼接起来。

接下来我们打开 `src/compiler/parser/text-parser.js` 文件，可以看到该文件只导出了一个 `parseText` 函数，所以这个文件的所有内容都服务于 `parseText` 函数，既然 `parseText` 函数会识别字面量表达式，那么自然需要一种识别机制，最容易想到的办法就是使用正则表达式，我们在 `src/compiler/parser/text-parser.js` 文件中能够看到如下正则常量：

```js
const defaultTagRE = /\{\{((?:.|\n)+?)\}\}/g
```

`defaultTagRE` 常量是一个正则，这个正则很简单，用来惰性匹配 `{{}}` 里的内容，并捕获 `{{}}` 里的内容。根据 `defaultTagRE` 常量的名字我们能够知道这是一个默认的正则，大家都知道我们在使用 `Vue` 的时候可以通过 `delimiters` 选项自定义字面量表达式的分隔符，比如我们可以将其配置成 `delimiters: ['${', '}']`，正是由于这个原因，所以我们不能一味的使用 `defaultTagRE` 正则去识别字面量表达式，我们需要根据开发者对 `delimiters` 选项的配置自动生成一个新的正则表达式，并用其匹配文本。我们在 `text-parser.js` 文件中能够看到如下这段代码：

```js
const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})
```

这段代码定义了 `buildRegex` 函数，该函数接收 `delimiters` 选项的值作为参数，并返回一个新的正则表达式。我们观察新的正则表达式：

```js
return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
```

可以发现，新的正则表达式与 `defaultTagRE` 正则中间的部分是一样的，唯一不同的是新的正则使用 `open` 和 `close` 常量的内容替换掉用了默认的 `{{}}`，我们以 `open` 常量为例讲解该常量的值，如下：

```js
const open = delimiters[0].replace(regexEscapeRE, '\\$&')
```

假如开发者指定 `delimiters` 选项的值为 `['${', '}']`，如上代码相当于：

```js
const open = '${'.replace(regexEscapeRE, '\\$&')
```

另外如上代码中存在另外一个正则常量 `regexEscapeRE`，它的内容如下：

```js
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g
```

可以看到该正则所匹配的字符都是那些在正则表达式中具有特殊意义的字符，正是因为这些字符在正则表达式中具有特殊意义，所以才需要使用 `replace` 方法将匹配到的具有特殊意义的字符进行转义，转义的结果就是在具有特殊意义的字符前面添加字符 `\`，所以最终 `open` 常量的值将为：`'\$\{'`。这里简单说明一下，字符串的 `replace` 方法的第二个参数可以是一个字符串，即要替换的文本，如果第二个参数是字符串，则可以使用特殊的字符序列：

* $$ =====> $
* $& =====> 匹配整个模式的字符串，与RegExp.lastMatch的值相同
* $' =====> 匹配的子字符串之后的子字符串，与RegExp.rightContext的值相同
* $` =====> 匹配的子字符串之前的子字符串，与RegExp.leftContext的值相同
* $n =====> 匹配第n(0 ~ 9)个捕获组的子字符串，如果正则表达式中没有捕获组，则使用空字符串
* $nn =====> 匹配第nn(01 ~ 99)个捕获组的子字符串，如果正则表达式中没有捕获组，则使用空字符串

最终 `buildRegex` 函数将会构建一个全新的正则：

```js
new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
```

等价于：

```js
new RegExp('\$\{((?:.|\\n)+?)\}', 'g')
```

也就等价于：

```js
/\$\{((?:.|\\n)+?)\}/g
```

如上正则与 `defaultTagRE` 正则相比，仅仅是分隔符部分发生了变换，仅此而已。

接下来我们将正式进入 `parseText` 函数的讲解，如下是 `parseText` 函数的签名：

```js
export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  // 省略...
}
```

该函数接收两个参数，分别是要解析的文本内容以及 `delimiters` 选项的值，在 `parseText` 函数的开头是这样一段代码：

```js
const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
if (!tagRE.test(text)) {
  return
}
```

这段代码定义了 `tagRE` 常量，这个常量就是最终用来匹配文本的正则，可以看到如果 `delimiters` 选项存在则使用 `buildRegex` 函数构建的新正则去匹配文本，否则使用默认的 `defaultTagRE` 正则。接着是一段 `if` 条件语句，使用 `tagRE.test(text)` 对文本内容进行测试，如果测试失败则说明文本中不包含字面量表达式，此时 `parseText` 函数会直接返回，因为什么都不需要做。如果测试成功，则代码继续执行，将来到如下这段代码：

```js
const tokens = []
const rawTokens = []
let lastIndex = tagRE.lastIndex = 0
let match, index, tokenValue
while ((match = tagRE.exec(text))) {
  index = match.index
  // push text token
  if (index > lastIndex) {
    rawTokens.push(tokenValue = text.slice(lastIndex, index))
    tokens.push(JSON.stringify(tokenValue))
  }
  // tag token
  const exp = parseFilters(match[1].trim())
  tokens.push(`_s(${exp})`)
  rawTokens.push({ '@binding': exp })
  lastIndex = index + match[0].length
}
```

上面这段代码是一段 `while` 循环语句，在 `while` 循环语句之前定义了一些常量和变量，这些常量和变量将会在 `while` 循环内使用。我们观察 `while` 循环的判断条件：

```js
(match = tagRE.exec(text))
```

这里使用 `tagRE` 正则匹配文本内容，并将匹配结果保存在 `match` 变量中，直到匹配失败循环才会终止，这时意味着所有的字面量表达式都已经处理完毕了。那么匹配结果 `match` 变量中保存着什么值呢？如果匹配成功则 `match` 变量将会是一个数组，该数组的第一个元素为整个匹配的字符串，第二个元素是正则 `tagRE` 捕获组所匹配的内容，假设我们的文本为 '{{name}}'，则匹配成功后 `match` 数组的值为：

```js
match = ['{{name}}', 'name']
```

但 `match` 并不是一个普通的数组，它还包含 `match.index` 属性，该属性的值代表着匹配的字符串在整个字符串中的位置，假设我们有这样一段文本：`'abc{{name}}'`，则匹配成功后 `match.index` 的值为 `3`，因为第一个左花括号(`{`)在整个字符串中的索引是 `3`。明白了这些我们就可以继续看 `while` 循环内的代码了，在 `while` 循环内的开头是如下这段代码：

```js
index = match.index
// push text token
if (index > lastIndex) {
  rawTokens.push(tokenValue = text.slice(lastIndex, index))
  tokens.push(JSON.stringify(tokenValue))
}
```

这段代码首先使用 `index` 变量保存了 `match.index` 属性的值，接着是一个 `if` 条件语句，它判断了变量 `index` 的值是否大于 `lastIndex` 变量的值，大家思考一下什么情况下会出现变量 `index` 的值大于 `lastIndex` 变量的值的情况？我们知道 `lastIndex` 变量的初始值是 `0`，所以只要 `index` 变量大于 `0` 即可，换句话说只要 `match.index` 变量的值大于 `0` 即可，我们还是以这段文本为例：`'abc{{name}}'`，我们知道当匹配这段文本时，`match.index` 的值将会为 `3`，它大于 `0`，所以此时如上 `if` 条件语句的判断条件满足，此时将会执行 `if` 语句块内的代码，在 `if` 语句块内有这样一句话，如下：

```js
rawTokens.push(tokenValue = text.slice(lastIndex, index))
```

如上这句代码中有这样一句代码：

```js
tokenValue = text.slice(lastIndex, index)
```

这句代码使用字符串的 `slice` 方法对文本进行截取，假如我们还拿上例来说，则如上这句代码相当于：

```js
tokenValue = 'abc{{name}}'.slice(0, 3)
```

可以看到这句代码的最终结果就是将原始文本中的 `'abc'` 字符片段截取了出来，并保存在变量 `tokenValue` 中，我们发现截取出来的字符片段就是字面量表达式前的普通文本，这段普通文本的文本内容除了会保存在 `tokenValue` 变量中之外还会被 `push` 到 `rawTokens` 数组中。另外我们注意到在这段 `if` 条件语句中还有如下这句代码：

```js
tokens.push(JSON.stringify(tokenValue))
```

可以看到这段代码使用 `JSON.stringify` 对截取出来的字符片段处理之后将其 `push` 到了 `tokens` 数组中。所以经过了这一系列处理之后，`rawTokens` 数组和 `tokens` 数组分别拥有了一个元素：

```js
rawTokens = ['abc']
tokens = ["'abc'"]
```

普通文本已经截取了出来，接下来该处理字面量表达式了，我们继续看 `while` 循环内的代码，如下：

```js {2}
// tag token
const exp = parseFilters(match[1].trim())
tokens.push(`_s(${exp})`)
rawTokens.push({ '@binding': exp })
lastIndex = index + match[0].length
```

如上高亮代码所示，这段代码首先使用 `parseFilters` 函数对匹配结果的捕获内容进行解析，假设文本内容为 `'abc{{name | someFilter}}'`，则 `match[1]` 的值为字符串 `'name'`，所以如上高亮的这句代码相当于：

```js
const exp = parseFilters('name | someFilter')
```

我们在前面的章节中已经讲解过了 `parseFilters` 函数的作用，如上代码中最终 `exp` 常量的值为字符串 `"_f('someFilter')(name)"`。接着会执行如下这两句代码：

```js
tokens.push(`_s(${exp})`)
rawTokens.push({ '@binding': exp })
```

这两句代码分别向 `tokens` 数组和 `rawTokens` 数组中添加了新的元素，假设我们的文本内容为 `'abc{{name | someFilter}}'`，则此时 `tokens` 数组和 `rawTokens` 数组的值已经为：

```js
tokens = ["'abc'", '_s(_f("someFilter")(name))']
rawTokens = [
  'abc',
  {
    '@binding': "_f('someFilter')(name)"
  }
]
```

最后还有一句代码需要执行，这句代码也是 `while` 循环的最后一句代码，如下：

```js
lastIndex = index + match[0].length
```

这句代码的作用是更新 `lastIndex` 变量的值，可以看到 `lastIndex` 变量的值等于 `index` 变量的值加上匹配的字符串的长度，我们以字符串 `'abc{{name}}def'` 为例，此时 `lastIndex` 变量的初始值为 `0`；`index` 变量的值为 `3`，指向第一个左花括号(`{`)；`match[0].length` 的值为匹配的字符串 '{{name}}' 的长度，所以 `match[0].length` 的值为 `8`，最终：

```js
lastIndex = 3 + 8 // lastIndex = 11
```

可以看到此时的 `lastIndex` 变量的值被更新为 `11`，恰好指向原始字符串中字符 `'d'` 的位置，为下一次 `while` 循环做准备。

在 `while` 循环的后面是如下这段代码：

```js
if (lastIndex < text.length) {
  rawTokens.push(tokenValue = text.slice(lastIndex))
  tokens.push(JSON.stringify(tokenValue))
}
```

这是一段 `if` 条件语句，其对比了 `lastIndex` 变量的值和原始文本长度(`text.length`)的大小，当 `lastIndex` 变量的值小于原始文本长度时该 `if` 条件语句内的代码将被执行。那么什么情况下 `lastIndex` 变量的值小于原始文本长度呢？我们知道每当 `while` 循环结束之前都会更新 `lastIndex` 变量的值并开始下一次循环，我们假设原始文本为 `'abc{{name}}def'`，当第一次 `while` 循环结束之前会更新 `lastIndex` 变量的值，使其指向字符 `'d'`，所以此时 `lastIndex` 变量的值为 `11`。然后开始下一次 `while` 循环，但大家不要忘了 `while` 循环的判断条件是：`(match = tagRE.exec(text))`，由于第二次 `while` 循环将会从字符 `'d'` 开始向后匹配，即匹配剩余的字符串 `'def'`，很明显该字符串中不在包含字面量表达式，所以 `while` 循环的判断条件会失败，循环终止。最终 `lastIndex` 变量的值停留在 `11`，而整个原始字符串的长度为 `14`，此时满足 `lastIndex` 变量的值小于原始字符串的长度，如上 `if` 条件语句内的代码将被执行。很明显，如上代码的目的是为了截取剩余的普通文本并将其添加到 `rawTokens` 和 `tokens` 数组中。当原始字符串 `'abc{{name}}def'` 被解析完毕后，`rawTokens` 和 `tokens` 数组的值将是：

```js
tokens = ["'abc'", '_s(name)', "'def'"]
rawTokens = [
  'abc',
  {
    '@binding': '_s(name)'
  },
  'def'
]
```

最后 `parseText` 函数将返回一个对象，如下代码所示：

```js
return {
  expression: tokens.join('+'),
  tokens: rawTokens
}
```

该对象包含两个属性，即 `expression` 和 `tokens`，拿上例来说，最后 `parseText` 函数的返回值将是：

```js
return {
  expression: "'abc'+_s(name)+'def'",
  tokens: [
    'abc',
    {
      '@binding': '_s(name)'
    },
    'def'
  ]
}
```

在如上这个返回值对象中，`expression` 属性的值就是最终出现在渲染函数中的代码片段。另外这里要强调一点 `tokens` 数组是用来给 `weex` 使用的。

## 对结束标签的处理

接下来我们讲解一下当解析器遇到结束标签的时候，都会做哪些事情，如下代码所示：

```js
end () {
  // remove trailing whitespace
  const element = stack[stack.length - 1]
  const lastNode = element.children[element.children.length - 1]
  if (lastNode && lastNode.type === 3 && lastNode.text === ' ' && !inPre) {
    element.children.pop()
  }
  // pop stack
  stack.length -= 1
  currentParent = stack[stack.length - 1]
  closeElement(element)
}
```

如上这段代码是 `parseHTML` 函数的 `end` 钩子函数，当解析 `html` 字符串遇到结束标签的时候，会调用该钩子函数并传递三个参数，不过我们发现在如上代码中并没有使用到 `end` 钩子函数的任何参数，这是因为当遇到结束标签时的处理逻辑根本用不到这些参数。那么在 `end` 钩子函数中都需要做哪些事情呢？关于这个问题在之前章节的讲解中我们多少都提到过了，我们知道每当解析器遇到非一元标签的开始标签时，会将该标签的元素描述对象设置给 `currentParent` 变量，代表后续解析过程中遇到的所有标签都应该是 `currentParent` 变量所代表的标签的子节点，同时还会将该标签的元素描述对象添加到 `stack` 栈中。而当遇到结束标签的时候则意味着 `currentParent` 变量所代表的标签以及其子节点全部解析完毕了，此时我们应该把 `currentParent` 变量的引用修改为当前标签的父标签，这样我们就将作用域还原给了上层节点，以保证解析过程中正确的父子关系。如下这段代码就是用来完成这些工作的：

```js
// pop stack
stack.length -= 1
currentParent = stack[stack.length - 1]
```

首先将当前节点出栈：`stack.length -= 1`，接着读取出栈后 `stack` 栈中的最后一个元素作为 `currentParent` 变量的值。另外我们注意到有这样一句代码：

```js
closeElement(element)
```

调用了 `closeElement` 函数，`closeElement` 函数的调用时机有两个，当遇到一元标签或非一元标签的结束标签时都会调用 `closeElement` 函数，该函数的源码如下：

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

它的工作有两个，第一个是对数据状态的还原，我们知道每当遇到 `<pre>` 标签的开始标签时，解析器会将 `inPre` 变量设置为 `true`，这代表着后续解析所遇到的标签都存在于 `<pre>` 标签中，一旦 `<pre>` 标签内的所有内容解析完毕后，解析器将会遇到 `<pre>` 标签的结束标签，此时 `platformIsPreTag(element.tag)` 将会为真，如上代码所示，会将 `inPre` 变量的值重置为 `false`。同样的道理，如果需要的话还会重置 `inVPre` 变量的值。`closeElement` 函数的第二个作用是调用后置处理转换钩子函数，即如上代码中的 `for` 循环部分，这段代码我们在前面的章节中已经讲解过了，这里不再细说。

我们回到 `end` 钩子函数，注意如下高亮的代码：

```js {3-7}
end () {
  // remove trailing whitespace
  const element = stack[stack.length - 1]
  const lastNode = element.children[element.children.length - 1]
  if (lastNode && lastNode.type === 3 && lastNode.text === ' ' && !inPre) {
    element.children.pop()
  }
  // pop stack
  stack.length -= 1
  currentParent = stack[stack.length - 1]
  closeElement(element)
}
```

这段高亮代码的作用是去除当前元素最后一个空白子节点，我们在讲解 `chars` 钩子函数时了解到：**`preserveWhitespace` 只会保留那些不在开始标签之后的空格(说空白也没问题)**，所以当空白作为标签的最后一个子节点存在时，也会被保留，如下代码所示：

```html
<div><span>test</span> <!-- 空白占位 -->  </div>
```

如上代码中 `<span>` 标签的结束标签与 `<div>` 标签的结束标签之间存在一段空白，这段空白将会被保留。但是这段空白的保留对于我们编写代码并没有什么益处，我们在编写 `html` 代码的时候经常会为了可读性将代码格式化为多行，如果这段空白被保留那么就可能对布局产生影响，尤其是对行内元素的影响。为了消除这些影响带来的问题，好的做法是将它们去掉，而如上 `end` 钩子函数中高亮的代码就是用来完成这个工作的。

## 注释节点的元素描述对象

解析器是否会解析并保留注释节点，是由 `shouldKeepComment` 编译器选项决定的，开发者可以在创建 `Vue` 实例的时候通过设置 `comments` 选项的值来控制编译器的 `shouldKeepComment` 选项。默认情况下 `comments` 选项的值为 `false`，即不保留注释，假如将其设置为 `true`，则当解析器遇到注释节点时会保留该注释节点，此时 `parseHTML` 函数的 `comment` 钩子函数会被调用，如下：

```js
comment (text: string) {
  currentParent.children.push({
    type: 3,
    text,
    isComment: true
  })
}
```

`comment` 钩子函数接收注释节点的内容作为参数，在 `comment` 钩子函数内所做的事情很简单，就是为当前注释节点创建一个类型为 `3` 并且 `isComment` 属性为 `true` 的元素描述对象，并将其添加到父节点元素描述对象的 `children` 数组内。

大家需要注意的是，普通文本节点与注释节点的元素描述对象的类型是一样的，都是 `3`，不同的是注释节点的元素描述对象拥有 `isComment` 属性，并且该属性的值为 `true`，目的就是用来与普通文本节点作区分的。

至此，对于解析器相关的内容我们就全部讲解完毕了，最终解析器把 `Vue` 的模板解析为抽象语法树(`AST`)，强烈建议读完本节的同学能够仔细阅读以下附录 [Vue 模板 AST 详解](../appendix/ast.md)，相信你一定会有更多的收获。
