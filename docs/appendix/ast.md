# Vue 模板 AST 详解

## type

节点元素描述对象的 `type` 属性用来标识一个节点的类型。

* 示例：

```js
ast = {
  type: 1
}
```

它有三个可取值，分别是 `1`、`2`、`3`，分别代表的含义是：

* `1`：代表当前节点类型为标签
* `2`：包含字面量表达式的文本节点
* `3`：普通文本节点或注释节点

## expression

当节点类型为 `2` 时，该节点的元素描述对象会包含 `expression` 属性。

* 示例：

```js
ast = {
  type: 2,
  expression: "'abc'+_s(name)+'def'"
}
```

## tokens

与 `expression` 类似，当节点类型为 `2` 时，该节点的元素描述对象会包含 `tokens` 属性。

* 示例：

```js
ast = {
  type: 2,
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

节点元素描述对象的 `tokens` 属性是用来给 `weex` 使用的，这里不做过多解释。

## tag

只有当节点类型为 `1`，即该节点为标签时其元素描述对象才会有 `tag` 属性，该属性的值代表标签的名字。

* 示例：

```js
ast = {
  type: 1,
  tag: 'div'
}
```

## attrsList

只有当节点类型为 `1`，即该节点为标签时其元素描述对象才会有 `attrsList` 属性，它是一个对象数组，存储着原始的 `html` 属性名和值。

* 示例：

```js
ast = {
  type: 1,
  attrsList: [
    {
      name: 'v-for',
      value: 'obj of list'
    },
    {
      name: 'class',
      value: 'box'
    }
  ]
}
```

## attrsMap

节点元素描述对象的 `attrsMap` 属性与 `attrsList` 属性一样，不同点在于 `attrsMap` 是以键值对的方式保存 `html` 属性名和值的。

* 示例：

```js
ast = {
  type: 1,
  attrsMap: {
    'v-for': 'obj of list',
    'class': 'box'
  }
}
```

## attrs

节点元素描述对象的 `attrs` 属性也是一个数组，并且也只有当节点类型为 `1`，即节点为标签的时候，其元素描述对象才会包含这个属性。`attrs` 属性不同于 `attrsList` 属性，具体表现在：

* 1、`attrsList` 属性仅用于解析阶段，而 `attrs` 属性则用于代码生成阶段，甚至运行时阶段。
* 2、`attrsList` 属性所包含的内容作为元素材料被解析器使用，而 `attrs` 属性所包含的内容在运行时阶段会使用原生 `DOM` 操作方法 `setAttribute` 真正将属性设置给 `DOM` 元素

简单来说 `attrs` 属性会包含以下内容：

* 1、大部分使用 `v-bind`(或其缩写`:`) 指令绑定的属性会被添加到 `attrs` 数组中。

为什么说大部分而不是全部呢？因为在 `Vue` 中有个 `Must Use Prop` 的概念，对于一个属性如果它是 `Must Use Prop` 的，则该属性不会被添加到 `attrs` 数组中，而是会被添加到元素描述对象的 `props` 数组中。

如下 `html` 模板所示：

```html
<div :some-attr="val"></div>
```

最终 `attrs` 数组将为：

```js
ast = {
  attrs: [
    {
      name: 'some-attr',
      value: 'val'
    }
  ]
}
```

* 2、普通的非绑定属性会被添加到 `attrs` 数组中。

如下 `html` 模板所示：

```html
<div no-binding-attr="val"></div>
```

最终 `attrs` 数组将为：

```js
ast = {
  attrs: [
    {
      name: 'no-binding-attr',
      value: '"val"'
    }
  ]
}
```

大家观察绑定属性和非绑定属性在 `attrs` 数组中的却别？很容易能够发现，非绑定属性的属性值是经过 `JSON.stringify` 的，我们已经不止一次的提到过这么做的目的。

* 3、`slot` 特性会被添加到 `attrs` 数组中。

如下 `html` 模板所示：

```html
<div slot="header"></div>
```

最终 `attrs` 数组将为：

```js
ast = {
  attrs: [
    {
      name: 'slot',
      value: '"header"'
    }
  ]
}
```

当然了由于 `slot` 本身是可绑定的属性，所以如果 `html` 模板如下：

```html
<div :slot="header"></div>
```

最终 `attrs` 数组将为：

```js
ast = {
  attrs: [
    {
      name: 'slot',
      value: 'header'
    }
  ]
}
```

区别在于 `value` 值是非 `JSON.stringify` 化的。

实际上，并不是出现在 `attrs` 数组中的属性就一定会使用 `setAttribute` 函数将其添加到 `DOM` 上，例如在运行时阶段，组件会根据该组件自身的 `props` 定义，从 `attrs` 中抽离出那些作为组件 `props` 的属性元素。

## props

节点元素描述对象的 `props` 属性也是一个数组，它的格式与 `attrs` 数组类似。就像 `attrs` 数组中的属性在运行时阶段会使用 `setAttribute` 函数将其添加到 `DOM` 上一样，`props` 数组中的属性则会直接通过 `DOM` 元素对象访问并添加，举个例子，假设 `props` 数组如下：

```js
ast = {
  props: [
    {
      name: 'innerHTML',
      value: '"some text"'
    }
  ]
}
```

则在运行时阶段，会使用如下代码操作 `DOM`：

```js
elm.innerHTML = 'some text'
```

其中 `elm` 为 `DOM` 节点对象。

那么那些属性会被当做 `props` 呢？有两种，第一种是在绑定属性时使用了 `prop` 修饰符，例如：

```html
<div :some.prop="aaa"></div>
```

由于绑定 `some` 属性的时候使用了 `prop` 修饰符，所以 `some` 属性不会出现在元素描述对象的 `attrs` 数组中，而是会出现在元素描述对象的 `props` 数组中。

第二种是那些比较特殊的属性，在绑定这些属性时，即使没有指定 `prop` 修饰符，但是由于它属于 `Must Use Prop` 的，所以这些属性会被强制添加到元素描述对象的 `props` 数组中，只有那些属性是 `Must Use Prop`，可以查看附录：[mustuseprop](../appendix/web-util.html#mustuseprop)

## pre

节点元素描述对象的 `pre` 属性是一个布尔值，它的真假代表着标签是否使用了 `v-pre` 指令，既然是标签，所以只有当节点的类型为 `1` 的时候其元素描述对象才会拥有 `pre` 属性。

* 示例：

```js
ast = {
  type: 1,
  pre: true
}
```

## ns

标签的 `Namespace`，如果一个标签是 `SVG` 标签，则该标签的元素描述对象将会拥有 `ns` 属性，其值为 `'svg'`，如果一个标签是 `<math>` 标签，则该标签元素描述对象的 `ns` 属性值为字符串 `'math'`。

* 示例：

```js
ast = {
  type: 1,
  ns: 'svg'
}
```

## forbidden

节点元素描述对象的 `forbidden` 属性是一个布尔值，其真假代表着该节点是否是在 `Vue` 模板中禁止被使用的。在 `Vue` 模板中满足以下条件的标签为禁止使用的标签：

* 1、`<style>` 标签禁止出现在模板中。
* 2、没有指定 `type` 属性的 `<script>` 标签，或 `type` 属性值为 `'text/javascript'` 的 `<script>` 标签。

## parent

节点元素描述对象的 `parent` 属性是父节点元素描述对象的引用。

## children

节点元素描述对象的 `children` 属性是一个数组，存储着该节点所有子节点的元素描述对象。当然了有些节点是不可能拥有子节点的，比如普通文本节点，对于不可能拥有子节点的节点，其元素描述对象没有 `children` 属性。

* 示例：

```js
ast = {
  children: [
    {
      type: 1,
      // 其他节点属性...
    }
  ]
}
```

## ifConditions

如果一个标签使用 `v-if` 指令，则该标签的元素描述对象将会拥有 `ifConditions` 属性，它是一个数组。如果一个标签使用 `v-else-if` 或 `v-else` 指令，则该标签不会被添加到其父节点元素描述对象的 `children` 数组中，而是会被添加到相符的带有 `v-if` 指令节点的元素描述对象的 `ifConditions` 数组中。

假设有如下模板：

```html
<div v-if="a"></div>
<h1 v-else-if="b"></h1>
<p v-else></p>
```

则 `<div>` 标签元素描述对象将是：

```js
ast = {
  type: 1,
  tag: 'div',
  ifConditions: [
    {
      exp: 'a',
      block: { type: 1, tag: 'div', ifConditions: [...] /* 省略其他属性 */ }
    },
    {
      exp: 'b',
      block: { type: 1, tag: 'h1' /* 省略其他属性 */ }
    },
    {
      exp: undefined,
      block: { type: 1, tag: 'p' /* 省略其他属性 */ }
    }
  ],
  // 其他属性...
}
```

可以发现一个节点元素描述对象的 `ifConditions` 数组中也会包含节点自身的元素描述对象。

## slotName

只有 `<slot>` 标签的元素描述对象才会拥有 `slotName` 属性，代表该插槽的名字，假设模板如下：

```html
<slot name="header" />
```

则元素描述对象为：

```js
ast = {
  type: 1,
  tag: 'slot',
  slotName: '"header"'
}
```

注意 `<slot>` 标签的 `name` 属性可以是绑定的：

```html
<slot :name="dynamicName" />
```

则元素描述对象为：

```js
ast = {
  type: 1,
  tag: 'slot',
  slotName: 'dynamicName'
}
```

如果没有为 `<slot>` 标签指定 `name` 属性，则其元素描述对象的 `slotName` 属性为：

```js {4}
ast = {
  type: 1,
  tag: 'slot',
  slotName: '""'
}
```

## slotTarget

如果一个标签使用了 `slot` 特性，则说明该标签将会被作为插槽的内容，为了标识该标签将被插入的位置，该标签的元素描述对象会拥有 `slotTarget` 属性，假如有如下模板：

```html
<div slot="header" ></div>
```

则其元素描述对象为：

```js
ast = {
  type: 1,
  tag: 'div',
  slotTarget: '"header"'
}
```

我们来对比一下使用 `name` 属性的 `<slot>` 标签的元素描述对象：

```js
ast = {
  type: 1,
  tag: 'slot',
  slotName: '"header"'
}
```

可以发现 `slotTarget` 和 `slotName` 是一一对象的，这将会在运行时阶段用来寻找合适的插槽内容。

另外 `slot` 特性也可以是绑定的：

```html
<div :slot="dynamicTarger" ></div>
```

则其元素描述对象为：

```js
ast = {
  type: 1,
  tag: 'div',
  slotTarget: 'dynamicTarger'
}
```

如果没有为 `slot` 特性指定属性值，则该标签元素描述对象的 `slotTarget` 属性的值为：

```js
ast = {
  type: 1,
  tag: 'div',
  slotTarget: '"default"'
}
```

## slotScope

我们可以使用 `slot-scope` 特性来指定一个插槽内容是作用域插槽，此时该标签的元素描述对象将拥有 `slotScope` 属性，假如有如下模板：

```html
<div slot-scope="scopeData"></div>
```

其元素描述对象为：

```js
ast = {
  type: 1,
  tag: 'div',
  slotScope: 'scopeData'
}
```

## scopedSlots

同常情况下我们插槽是作为一个组件的子节点去书写的，如下：

```html
<comp>
  <div slot="header"></div>
</comp>
```

如上代码所示我们有自定义组件 `<copm>`，并为该自定义组件提供了插槽内容。普通插槽会出现在组件元素描述对象的 `children` 数组中，如下是以上模板的 `AST`：

```js
ast = {
  type: '1',
  tag: 'comp',
  children: [
    {
      type: 1,
      tag: 'div',
      slotTarget: '"header"'
    }
  ]
}
```

但如果一个插槽不是普通插槽，而是作用域插槽，则该插槽节点的元素描述对象不会作为组件的 `children` 属性存在，而是会被添加到组件元素描述对象的 `scopedSlots` 属性中，假设有如下模板：

```html
<comp>
  <div slot="header" slot-scope="scopeData"></div>
</comp>
```

则其生成的 `AST` 为：

```js
ast = {
  type: '1',
  tag: 'comp',
  children: [],
  scopedSlots: {
    '"header"': {
      type: 1,
      tag: 'div',
      slotTarget: '"header"'
    }
  }
}
```

可以发现 `scopedSlots` 对象的键值是作用域插槽元素描述对象的 `slotTarget` 属性的值。

## for、alias、iterator1、iterator2

当标签使用了 `v-for` 指令时，其元素描述对象将会拥有以上这四个属性，在如上四个属性中，其中 `for`、`alias` 这两个属性是肯定存在的，而 `iterator1` 和 `iterator2` 这两个属性不一定会存在。

如果模板如下：

```html
<div v-for="obj of list"></div>
```

则其元素描述对象为：

```js
ast = {
  for: 'list',
  alias: 'obj'
}
```

如果模板如下：

```js
<div v-for="(obj, index) of list"></div>
```

则其元素描述对象为：

```js
ast = {
  for: 'list',
  alias: 'obj',
  iterator1: 'index'
}
```

如果模板如下：

```html
<div v-for="(obj, key, index) of list"></div>
```

则其元素描述对象为：

```js
ast = {
  for: 'list',
  alias: 'obj',
  iterator1: 'key'
  iterator2: 'index'
}
```

## if、elseif、`else`

如果一个标签使用了 `v-if` 指令，则该标签元素描述对象就会拥有 `if` 属性，假如有如下模板：

```html
<div v-if="a"></div>
```

则其元素描述对象为：

```js
ast = {
  if: 'a'
}
```

如果一个标签使用了 `v-else-if` 指令，则该标签元素描述对象就会拥有 `elseif` 属性，假如有如下模板：

```html
<div v-else-if="b"></div>
```

则其元素描述对象为：

```js
ast = {
  elseif: 'b'
}
```

如果一个标签使用了 `v-else` 指令，则该标签元素描述对象就会拥有 `else` 属性，假如有如下模板：

```html
<div v-else></div>
```

则其元素描述对象为：

```js
ast = {
  else: true
}
```

## once

使用标签使用了 `v-once` 指令，则该标签的元素描述对象就会包含 `once` 属性，它是一个布尔值，如下：

```js
ast = {
  once: true
}
```

## key

如果标签使用 `key` 特性，则该标签的元素描述对象就会包含 `key` 属性，假设有如下模板：

```html
<div key="unique"></div>
```

则其元素描述对象为：

```js
ast = {
  key: '"unique"'
}
```

`key` 特性可以是绑定的：

```html
<div :key="unique"></div>
```

则其元素描述对象为：

```js
ast = {
  key: 'unique'
}
```

## ref

与 `key` 类似，假设有如下模板：

```html
<div ref="domRef"></div>
```

则其元素描述对象为：

```js
ast = {
  ref: '"domRef"'
}
```

`ref` 特性可以是绑定的：

```html
<div :ref="domRef"></div>
```

则其元素描述对象为：

```js
ast = {
  ref: 'domRef'
}
```

## refInFor

元素描述对象的 `refInFor` 是一个布尔值。如果一个使用了 `ref` 特性的标签是使用了 `v-for` 指令标签的子代节点，则该标签元素描述对象的 `checkInFor` 属性将会为 `true`，否则为 `false`

## component

如果标签使用 `is` 特性，则其元素描述对象将会拥有 `component` 属性，假设有如下模板：

```html
<component :is="currentView"></component>
```

则其元素描述对象为：

```js
ast = {
  type: 1,
  tag: 'component',
  component: 'currentView'
}
```

`is` 特性也可以是非绑定的：

```html
<table></table>
  <tr is="my-row"></tr>
</table>
```

则 `<tr>` 标签的元素描述对象为：

```js
ast = {
  type: 1,
  tag: 'tr',
  component: '"my-row"'
}
```

## inlineTemplate

节点元素描述对象的 `inlineTemplate` 属性是一个布尔值，标识着一个组件使用使用内联模板，假设我们有如下模板：

```html
<copm inline-template></copm>
```

则其元素描述对象为：

```js
ast = {
  inlineTemplate: true
}
```

## hasBindings

节点元素描述对象的 `hasBindings` 属性是一个布尔值，用来标签当前节点是否拥有绑定，所谓绑定指的就是指令。所以如果一个标签使用了指令(包括自定义指令)，则其元素描述对象的 `hasBindings` 属性就会为 `true`。

这里要强调一点，事件本身也是指令(`v-on` 指令)，绑定的属性也是指令(`v-bind` 指令)。

## events、nativeEvents

如果标签使用了 `v-on` 指令(或缩写 `@`)绑定了事件，则该标签元素描述对象中将包含 `events` 属性，假如有如下模板：

```html
<div @click="handleClick"></div>
```

则其元素描述对象为：

```js
ast = {
  events: {
    'click': {
      value: 'handleClick'
    }
  }
}
```

如果在绑定事件的时候使用了修饰符，如下模板所示：

```html
<div @click.stop="handleClick"></div>
```

则其元素描述对象为：

```js {5-7}
ast = {
  events: {
    'click': {
      value: 'handleClick',
      modifiers: {
        stop: true
      }
    }
  }
}
```

可以看到多出了 `modifiers` 对象。

但并不是所有修饰符都会出现在 `modifiers` 对象中，如下模板所示：

```html
<div @click.once="handleClick"></div>
```

如上模板中我们使用了 `once` 修饰符，但它并不会出现在 `modifiers` 对象中，其最终生成的元素描述对象如下：

```js
ast = {
  events: {
    '~click': {
      value: 'handleClick',
      modifiers: {}
    }
  }
}
```

可以看到 `modifiers` 是一个空对象，但是事件名字由 `click` 变成了 `~click`。实际上对于一个使用了 `once` 修饰符的事件绑定，解析器会在原始事件名称前添加 `~` 符并将其作为新的事件名称，接着会忽略 `once` 修饰符，所以 `once` 修饰符不会出现在 `modifiers` 对象中。为什么要忽略 `once` 修饰符呢？因为对于后面的程序来讲，该修饰符已经没有使用的必要的，因为通过检查事件名称的第一个字符是否为 `~` 即可判断该事件是否为 `once` 的。除了 `once` 修饰符之外，以下列出的修饰符也不会出现在 `modifiers` 对象中：

* 1、事件名称为 `click` 并使用了 `right` 修饰符，则 `right` 修饰符不会出现在 `modifiers` 对象中，因为在解析阶段使用了 `right` 修饰符的 `click` 事件会被重写为 `contextmenu` 事件，假如有如下模板：

```html
<div @click.right="handler"></div>
```

其元素描述对象为：

```js
ast = {
  events: {
    contextmenu: {
      value: "handler",
      modifiers: {}
    }
  }
}
```

* 2、`capture`、`passive` 修饰符不会出现在 `modifiers` 对象中，原因与 `once` 修饰符一样，`capture`、`passive` 修饰符也会修改事件的名称，其中 `capture` 修饰符会在原始事件名称之前添加 `!`，`passive` 修饰符会在事件名称之前添加 `&`，假如有如下模板

```html
<div @click.capture="handler"></div>
<div @click.passive="handler"></div>
```

则对于的元素描述对象分别为：

```js
// 使用了 `capture` 修饰符
ast = {
  events: {
    '!click': {
      value: "handler",
      modifiers: {}
    }
  }
}

// 使用了 `passive` 修饰符
ast = {
  events: {
    '&click': {
      value: "handler",
      modifiers: {}
    }
  }
}
```

* 3、`native` 修饰符也不会出现在 `modifiers` 对象中，原因很简单，`native` 修饰符是用来给解析器使用的，当解析器遇到使用了 `native` 修饰符的事件，则会将事件信息添加到元素描述对象的 `nativeEvents` 属性中，而不是 `events` 属性中，例如：

```html
<comp @click.native="handler"></copm>
```

则其元素描述对象为：

```js
ast = {
  nativeEvents: {
    click: {
      value: "handler",
      modifiers: {}
    }
  }
}
```

除了以上修饰符之外，其他所有修饰符都会出现在 `modifiers` 对象中。

## directives

节点元素对象的 `directives` 属性是一个数组，用来保存标签中所有指令信息。但并不是所有指令信息都会保存在 `directives` 数组中，比如 `v-for` 指令和 `v-if` 指令等等，因为这些指令在之前的处理中已经被移除掉。总的来说，指令分为内置指令和自定义指令，真正会出现在 `directives` 数组中的只有部分内置指令以及全部自定义指令。

不会出现在 `directives` 数组中的内置指令有：`v-pre`、`v-for`、`v-if`、`v-else-if`、`v-else` 以及 `v-once`。

会出现在 `directives` 数组中的内置有：`v-text`、`v-html`、`v-show`、`v-model` 以及 `v-cloak`。

另外 `v-on`、`v-bind` 是两个比较特殊的指令，当这两个指令拥有参数时，则不会出现在 `directives` 数组中，比如：

```html
<div v-on:click="handler"></div>
<div v-bind:some-prop="val"></div>
```

以上这两中写法，由于 `v-on` 和 `v-bind` 指令拥有参数，所以这两个指令不会出现在 `directives`，但是我们知道 `v-on` 和 `v-bind` 指令可以直接绑定对象，此时他们是没有参数的：

```html
<div v-on="$listeners"></div>
<div v-bind="$attrs"></div>
```

这时候 `v-on` 和 `v-bind` 指令都会出现在 `directives` 数组中。为什么同样指令不同的使用方式会得到不同的对待呢？其实正是由于使用方式的不同，才需要不同的处理，在代码生成阶段，我们会更加理解这一点。

一个完整的指令由四部分组成，分别是：`指令的名称`、`指令表达式`、`指令参数` 以及 `指令修饰符`，假设有如下模板：

```html
<div v-custom-dir:arg.modif="val"></div>
```

如上模板展示了一个完整的指令，最终其生成的元素描述对象为：

```js
ast = {
  directives: [
    {
      name: 'custom-dir',
      rawName: 'v-custom-dir:arg.modif',
      value: 'val',
      arg: 'arg',
      modifiers: {
        modif: true
      }
    }
  ]
}
```

## staticClass

如果以标签使用了静态 `class`，即非绑定的 `class`，那么该标签的元素描述对象将拥有 `staticClass` 属性，假设有如下模板：

```html
<div class="a b c"></div>
```

则其元素描述对象为：

```js
ast = {
  staticClass: '"a b c"'
}
```

## classBinding

`staticClass` 属性中存储的是静态 `class` ，而元素描述对象的 `classBinding` 属性中所存储的则是绑定的 `class`，假设有如下模板：

```html
<div :class="{ active: true }"></div>
```

则其元素描述对象为：

```js
ast = {
  classBinding: '{ active: true }'
}
```

## staticStyle、styleBinding

节点元素描述对象的 `staticStyle` 属于包含的是静态 `style` 内联样式信息，假设有如下模板：

```html
<div style="color: red; background: green;"></div>
```

则其元素描述对象为：

```js
ast = {
  staticStyle: '{"color":"red","background":"green"}'
}
```

可以发现 `staticStyle` 属性的值不是简单的把 `style` 内联样式拷贝下来，而是将其解析成了对象的样子。

`styleBinding` 属性类似于 `classBinding` 属性。假设有如下模板：

```html
<div :style="{ backgroundColor: green }"></div>
```

则其元素描述对象为：

```js
ast = {
  styleBinding: '{ backgroundColor: green }'
}
```

## plain

节点元素描述对象的 `plain` 属性是一个布尔值，`plain` 属性的真假将影响代码生成阶段对于 `VNodeData` 的生成。什么是 `VNodeData` 呢？在 `Vue` 中一个 `VNode` 代表一个虚拟节点，而 `VNodeData` 就是用来描述该虚拟节点的管家信息。在代码生成节点我们会发现 `AST` 中元素的大部分信息都用来生成 `VNodeData`。对于一个节点的元素描述对象来讲，如果其 `plain` 属性值为 `true`，该节点所对应的虚拟节点将不包含任何 `VNodeData`。

* 1、如果一个标签是使用了 `v-pre` 指令标签的子代标签，则该标签元素描述对象的 `plain` 属性将使用为 `true`。但要注意的是，使用了 `v-pre` 指令的那个标签的元素描述对象的 `plain` 属性不为 `true`。

* 2、如果你标签既没有使用特性 `key`，又没有任何属性，那么该标签的元素描述对象的 `plain` 属性将始终为 `true`。

其实，我们完全可以认为，只有使用了 `v-pre` 指令的标签的子待节点其元素描述对象的 `plain` 属性才会为 `true`。

## isComment

节点元素描述对象的 `isComment` 属性是一个布尔值，用来标识当前节点是否是注释节点。所以只有注释节点的元素描述对象才会有这个属性，并且其值为 `true`。
