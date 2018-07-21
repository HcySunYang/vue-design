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

首先使用 `bindRE` 正则将指令字符串中的 `v-bind:` 或 `:` 去除掉，此时 `name` 字符串已经从一个完成的指令字符串变为绑定属性的名字了，举个例子，假如原本的指令字符串为 `'v-bind:some-prop.sync'`，由于之前已经把该字符串中修饰符的部分去除掉了，所以指令字符串将变为 `'v-bind:some-prop'`，接着如上第一句高亮的代码又将指令字符串中的 `v-bind:` 去掉，所以此时指令字符串将变为 `'some-prop'`，可以发现该字符串就是绑定属性的名字，或者说是 `v-bind` 指令的参数。

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

首先 `el.component` 必须为假，这个条件能够保证什么呢？我们知道 `el.component` 属性保存的是标签 `is` 属性的值，如果 `el.component` 属性为假就能够保证标签没有使用 `is` 属性。那么为什么需要这个保证呢？这是因为后边的 [platformMustUseProp](../appendix/web-util.html#mustuseprop) 函数，该函数的讲解可以在附录中查看，总结如下：

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

可以看到 `addDirective` 函数接收六个参数，在 `addDirective` 函数体内，首先判断了元素描述对象的 `el.directives` 是否存在，如果不存在则先将其初始化一个空数组，然后再使用 `push` 方法添加一个指令信息对象到 `el.directives` 数组中，如果 `el.directives` 属性已经存在，则直接使用 `push` 方法将指令信息对象添加到 `el.directives` 数组中。我们一直说的**指令信息对象**实际上指的就是如上代码中传递给 `push` 方法的参数：

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

这些非指令属性都已经被相应的处理函数解析过了，所以 `processAttrs` 函数是不负责处理如上这些非指令属性的。换句话说除了以上属性基本指令的非指令属性基本都由 `processAttrs` 函数来处理，比如 `id`、`width` 等，如下：

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

实际上元素描述对象的 `el.attrs` 数组中所存储的任何属性都会在由虚拟DOM创建真实DOM的过程中使用 `setAttribute` 方法将属性添加到真实DOM元素上，而在火狐浏览器中存在无法通过DOM元素的 `setAttribute` 方法为 `video` 标签添加 `muted` 属性的问题，所以如上代码就是为了解决该问题的，其方案是如果一个属性的名字是 `muted` 并且该标签满足 [platformMustUseProp](../appendix/web-util.html#mustuseprop) 函数(`video` 标签满足)，则会额外调用 `addProp` 函数将属性添加到元素描述对象的 `el.props` 数组中。为什么这么做呢？这是因为元素描述对象的 `el.props` 数组中所存储的任何属性都会在由虚拟DOM创建真实DOM的过程中直接使用真实DOM对象添加，也就是说对于 `<video>` 标签的 `muted` 属性的添加方式为：`videoEl.muted = true`。另外如上代码的注释中已经提供了相应的 `issue` 号：`#6887`，感兴趣的同学可以去看一下。

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

我来说一说编译器选项中的 `modules`，在 [理解编译器代码的组织方式](./art/80vue-compiler-start.md#理解编译器代码的组织方式) 一节中我们知道编译器的选项来自于两部分，一部分是创建编译器时传递的基本选项(`baseOptions`)，另一部分则是在使用编辑器编译模板时传递的选项参数。如下是创建编译器时的基本选项：

```js
import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

const { compile, compileToFunctions } = createCompiler(baseOptions)
```

如上代码来自 `src/platforms/web/compiler/index.js` 文件，可以看到 `baseOptions` 导入自 `src/platforms/web/compiler/options.js` 文件，对于基本选项的解析我们在 [compile 的作用](./art/80vue-compiler-start.html#compile-的作用) 一节中做了详细的讲解，并且整理了 [附录/编译器选项](../appendix/compiler-options.html)，如果大家忘记了可以回头查看。

最终我们了解到编译器选项的 `modules` 选项来 `src/platforms/web/compiler/modules/index.js` 文件导出的一个数组，如下：

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

如果该 `input` 标签没有使用 `v-model` 属性，则函数直接返回，什么都不做。所以我们可以说 `preTransformNode` 函数要预处理的是**使用了 `v-model` 属性的 `input` 标签**，不过还没完，我们继续看如下代码




那么要如何处理使用了 `v-model` 属性的 `input` 标签呢？来看一下 `model.js` 文件开头的一段注释：

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


## 文本节点的元素描述对象
## parseText 函数解析字面量表达式
## 对结束标签的处理
## 注释节点的元素描述对象
## 对元素描述对象的总结