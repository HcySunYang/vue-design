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

那如果使用 `getBindingAttr` 函数获取 `slot-scope` 属性的值会产生什么效果呢？由于 `slot-scope` 没有并非 `v-bind:slot-scope` 或 `:slot-scope`，所以在使用 `getBindingAttr` 函数获取 `slot-scope` 属性值的时候，将会得到使用 `JSON.stringify` 函数处理后的结果，即：

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

`processAttrs` 函数是 `processElement` 函数中调用的最后一个 `process*` 函数，在这之前已经调用了很多其他的 `process*` 函数对元素进行了处理，并且每当处理一个属性时，都会将该属性从元素描述对象的 `el.attrsList` 数组中移除，但 `el.attrsList` 数组中仍然保存着剩余未被处理的属性，而 `processAttrs` 函数就是用来处理这些剩余属性的。

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

除了这些指令之外，还有部分属性的处理我们也没讲到，比如 `class` 属性和 `style` 属性，这两个属性比较特殊，因为 `Vue` 对他们做了增强，实际上在“中置处理”(`transforms` 数组)中有有对于 `class` 属性和 `style` 属性的处理，这个我们后面会统一讲解。

再有就是一些普通属性的处理了，如下 `html` 代码所示：

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

可以看到在 `processAttrs` 函数内部，首先定义了 `list` 常量，它是 `el.attrsList` 数组的引用。接着有定义了一些列变量待使用，然后开启了一个 `for` 循环，循环的目的就是遍历 `el.attrsList` 数组，所以我们能够想到在循环内部就是逐个处理 `el.attrsList` 数组中那些剩余的属性的。

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

一个完整的指令包含指令的名称、指令的参数、指令的修饰符以及指令的值，以上高亮代码的作用是用来解析指令中的修饰符的。首先既然元素使用了指令，那么该指令的值就是表达式，既然是表达式那就涉及动态的内容，所以此时会在元素描述对象上添加 `el.hasBindings` 属性，并将其值设置为 `true`，标识着当前元素是一个动态的元素。接着执行了如下这句代码：

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

在 `parseModifiers` 函数内部首先使用指令字符串的 `match` 方法匹配正则 `modifierRE`，`modifierRE` 正则我们在上一章讲过，它用来全局匹配字符串中字符 `.` 以及 `.` 后面的字符，也就是修饰符，举个例子，假设我们的指令字符串为：`'v-bind:some-prop.sync'`，则使用该字符串去匹配正则 `modifierRE` 最终将会得到一个数组：`[".sync"]`。一个指令有几个修饰符，则匹配的结果数组中就包含几个元素。如果匹配失败则会得到 `null`。回到上面的代码，定义了 `match` 常量，它保存着匹配结果。接着是一个 `if` 语句块，如果匹配成功则会执行 `if` 语句块内的代码，在 `if` 语句块内首先定义了 `ret` 常量，它是一个空对象，并且我们发现 `ret` 常量将作为匹配成功时的返回结果，`ret` 常量是什么呢？来看这句代码：

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

这句代码的作用很简单，就是讲修饰符从指令字符串中移除，也就是说此时的指令字符串 `name` 中已经不包含修饰符部分了。

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

首先使用 `bindRE` 正则将指令字符串中的 `v-bind:` 或 `:` 去除掉，此时 `name` 字符串已经从一个完成的指令字符串变为绑定属性的名字了，举个例子，假如原本的指令字符串为 `'v-bind:some-prop.sync'`，由于之前已经把该字符串中修饰符的部分取出掉了，所以指令字符串将变为 `'v-bind:some-prop'`，接着如上第一句高亮的代码又将指令字符串中的 `v-bind:` 去掉，所以此时指令字符串将变为 `'some-prop'`，可以发现该字符串就是绑定属性的名字，或者说是 `v-bind` 指令的参数。

接着调用 `parseFilters` 函数处理绑定属性的值，我们知道 `parseFilters` 函数的作用是用来将表达式与过滤器整合在一起的，前面我们已经做了详细的讲解，但凡涉及到能够使用过滤器的地方都要使用 `parseFilters` 函数去解析，并将解析后的新表达式返回。如上第二句高亮的代码所示，使用 `parseFilters` 函数的返回值重新赋值 `value` 变量。

第三句高亮的代码将 `isProp` 变量初始化为 `false`，`isProp` 变量标识着该绑定的属性是否是原生DOM对象属性，所谓原生DOM对象的属性就是能够通过DOM元素对象直接访问的有效API，比如 `innerHTML` 就是一个原生DOM对象属性。

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

这段 `if` 语句块的代码用来处理使用了 `prop` 修饰符的 `v-bind` 指令，既然使用了 `prop` 修饰符，则意味着该属性将被作为原生DOM对象的属性，所以首先会将 `isProp` 变量设置为 `true`，接着使用 `camelize` 函数将属性名驼峰化，最后还会检查驼峰化之后的属性名是否等于字符串 `'innerHtml'`，如果属性名全等于该字符串则将属性名重写为字符串 `'innerHTML'`，我们知道 `'innerHTML'` 是一个特例，它的 `HTML` 四个字符串全部为大写。以上就是对于使用了 `prop` 修饰符的 `v-bind` 指令的处理，如果一个绑定属性使用了 `prop` 修饰符则 `isProp` 变量会被设置为 `true`，并且会把属性名字驼峰化。那么为什么要将 `isProp` 变量设置为 `true` 呢？答案在如下代码中：

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

总之 `isProp` 变量是一个重要的标识，它的值将会影响一个属性被添加到元素描述对象的位置，从而影响后续的行为。另外这里在啰嗦一句：**元素描述对象的 `el.props` 数组中存储的并不是组件概念中的 `prop`，而是原生DOM对象的属性**。在后面的章节中我们会看到，组件概念中的 `prop` 其实是在 `el.attrs` 数组中。

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

如上高亮的代码所示，如果 `modifiers.camel` 为真，则说明该绑定的属性使用了 `camel` 修饰符，使用该修饰符的作用只有一个，那就是将绑定的属性驼峰化，如下代码如实：

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

如上高亮到吗所示，事件名称等于字符串 `'update:'` 加上驼峰化的绑定属性名称。另外我们注意到传递给 `addHandler` 函数的第三个参数，实际上 `addHandler` 函数的第三个参数就是当事件发生时的回调函数，而该回调函数是通过 `genAssignmentCode` 函数生成的。`genAssignmentCode` 函数来自 `src/compiler/directives/model.js` 文件，如下是其源码：

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

要讲解 `genAssignmentCode` 函数将会牵扯很多东西，实际上 `genAssignmentCode` 函数也被用在 `v-model` 指令，因为本质上 `v-model` 指令与绑定属性加上 `sync` 修饰符几乎相同，所以我们会在讲解 `v-model` 指令时再来详细讲解 `genAssignmentCode` 函数。这里大家只要关注一下如上代码中 `genAssignmentCode` 的返回值即可，它返回的是一个代码字符串，可以看到如果这个代码字符串作为代码执行，其作用就是一个赋值工作。这样就免去了我们手工赋值的繁琐。

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

实际上这段代码我们已经简单过了，这里要强调的是 `if` 语句的判断条件：

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

### 解析其他指令

