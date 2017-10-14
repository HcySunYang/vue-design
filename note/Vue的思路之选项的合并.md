## Vue 的思路之选项的合并

上一章节我们了解了 `Vue` 对选项的规范化，而接下来才是真正的合并阶段，我们继续看 `mergeOptions` 函数的代码，接下来的一段代码如下：

```js
const options = {}
let key
for (key in parent) {
  mergeField(key)
}
for (key in child) {
  if (!hasOwn(parent, key)) {
    mergeField(key)
  }
}
function mergeField (key) {
  const strat = strats[key] || defaultStrat
  options[key] = strat(parent[key], child[key], vm, key)
}
return options
```

这段代码的第一句和最后一句说明了 `mergeOptions` 函数的的确确返回了一个新的对象，因为第一句代码声明了一个常量 `options`，而最后一句代码将其返回，所以我们自然可以预估到中间的代码是在充实 `options` 常量，而 `options` 常量就应该是最终合并之后的选项，我们看看它是怎么产生的。

首先我们明确一下代码结构，这里有两个 `for in` 循环以及一个名字叫 `mergeField` 的函数，而且我们可以发现这两个 `for in` 循环中都调用了 `mergeField` 函数。我们先看第一段 `for in` 代码：

```js
for (key in parent) {
  mergeField(key)
}
```

这段 `for in` 用来遍历 `parent`，并且将 `parent` 对象的键作为参数传递给 `mergeField` 函数，大家应该知道这里的 `key` 是什么，假如 `parent` 就是 `Vue.options`：

```js
Vue.options = {
  components: {
      KeepAlive
      Transition,
      TransitionGroup
  },
  directives:{
      model,
      show
  },
  filters: Object.create(null),
  _base: Vue
}
```

那么 `key` 就应该分别是：`components`、`directives`、`filters` 以及 `_base`，除了 `_base` 其他的都是字段都可以理解为是 `Vue` 提供的选项的名字。

而第二段 `for in` 代码：

```js
for (key in child) {
  if (!hasOwn(parent, key)) {
    mergeField(key)
  }
}
```

其遍历的是 `child` 对象，并且多了一个判断：

```js
if (!hasOwn(parent, key))
```

其中 `hasOwn` 函数来自于 `shared/util.js` 文件，可以再 [shared/util.js 文件工具方法全解](/note/附录/shared-util) 中查看其详解，其作用是用来判断一个属性是否是对象自身的属性(不包括原型上的)。所以这个判断语句的意思是，如果 `child` 对象的键也在 `parent` 上出现，那么就不要再调用 `mergeField` 的了，因为在上一个 `for in` 循环中已经调用过了，这就避免了重复调用。

总之这两个 `for in` 循环的目的就是使用在 `parent` 或者 `child` 对象中出现的 `key(即选项的名字)` 作为参数调用 `mergeField` 函数，真正合并的操作实际在 `mergeField` 函数中。

`mergeField` 代码如下：

```js
function mergeField (key) {
  const strat = strats[key] || defaultStrat
  options[key] = strat(parent[key], child[key], vm, key)
}
```

`mergeField` 函数只要两句代码，第一句代码定义了一个常量 `start`，它的值是通过指定的 `key` 访问 `strats` 对象得到的，而当访问的不存在时，则使用 `defaultStrat` 作为值。

这里我就要明确了，`starts` 是什么？