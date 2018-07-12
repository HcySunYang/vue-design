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