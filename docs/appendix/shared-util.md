# shared/util.js 文件工具方法全解

## emptyObject

源码如下：

```js
export const emptyObject = Object.freeze({})
```

* 描述：`emptyObject` 是一个冻结的空对象，这意味着 `emptyObject` 是不可扩展、不可配置、不可写的

## isUndef

源码如下：

```js
export function isUndef (v: any): boolean %checks {
  return v === undefined || v === null
}
```

* 描述：`isUndef` 函数用来判断给定的变量是否是未定义，要注意的是，这个函数认为即使变量值为 `null`，也会认为其是未定义的。

* 参数：
  * `{Any} v` 任意变量

## isPrimitive

* 源码如下：

```js
export function isPrimitive (value: any): boolean %checks {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    // $flow-disable-line
    typeof value === 'symbol' ||
    typeof value === 'boolean'
  )
}
```

* 描述：`isPrimitive` 用来判断给定的变量是否是原始类型值，即：字符串、数字、布尔值以及 `symbol`。

* 参数：
  * `{Any} v` 任意变量

## isValidArrayIndex

* 源码如下：

```js
export function isValidArrayIndex (val: any): boolean {
  const n = parseFloat(String(val))
  return n >= 0 && Math.floor(n) === n && isFinite(val)
}
```

* 描述：`isValidArrayIndex` 函数用来判断给定的值是否是有效的数组索引。如果是有效的则返回 `true`，否则返回 `false`。

* 源码分析：

一个有效的数组索引要满足两个条件：1、大于等于 `0` 的整数，2、在条件一的基础上，这个整数不能是无限的。在源码中条件 `n >= 0 && Math.floor(n) === n` 保证了索引是一个大于等于 `0` 的整数，而条件 `isFinite(val)` 保证了该值是有限的。

## extend

源码如下：

```js
/**
 * Mix properties into target object.
 */
export function extend (to: Object, _from: ?Object): Object {
  for (const key in _from) {
    to[key] = _from[key]
  }
  return to
}
```

* 描述：将 `_from` 对象的属性混合到 `to` 对象中

* 参数：
  * `{Object} to` 目标对象
  * `{Object} _from` 源对象

* 返回值：混合后的新对象

* 源码分析

`extend` 函数的实现还是挺简单的，使用一个 `for in` 语句实现。大家基本都能看得懂

## makeMap

源码如下：

```js
/**
 * Make a map and return a function for checking if a key
 * is in that map.
 */
export function makeMap (
  str: string,
  expectsLowerCase?: boolean
): (key: string) => true | void {
  const map = Object.create(null)
  const list: Array<string> = str.split(',')
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true
  }
  return expectsLowerCase
    ? val => map[val.toLowerCase()]
    : val => map[val]
}
```

* 描述：`makeMap` 函数首先根据一个字符串生成一个 `map`，然后根据该 `map` 产生一个新函数，新函数接收一个字符串参数作为 `key`，如果这个 `key` 在 `map` 中则返回 `true`，否则返回 `undefined`。

* 参数：
  * `{String} str` 一个以逗号分隔的字符串
  * `{Boolean} expectsLowerCase` 是否小写

* 返回值：根据生成的 `map` 产生的函数

* 源码分析

首先定义一个对象 `map`：

```js
const map = Object.create(null)
```

然后根据逗号，将 `str` 分隔成数组并保存到 `list` 变量中：

```js
const list: Array<string> = str.split(',')
```

遍历 `list` 并以 `list` 中的元素作为 `map` 的 `key`，将其设置为 `true`：

```js
for (let i = 0; i < list.length; i++) {
  map[list[i]] = true
}
```

最后，返回一个函数，并且如果 `expectsLowerCase` 为 `true` 的话，将 `map` 的 `key` 小写:

```js
return expectsLowerCase
    ? val => map[val.toLowerCase()]
    : val => map[val]
```

* 使用示例：

```js
// 检测是否是小写的元音字母
export const isVowel = makeMap('a,e,i,o,u', true)

isVowel('e')  // true
isVowel('b')  // false
```

## isBuiltInTag

* 源码如下：

```js
/**
 * Check if a tag is a built-in tag.
 */
export const isBuiltInTag = makeMap('slot,component', true)
```

* 描述：检查是否是内置的标签

* 源码分析

`isBuiltInTag` 是一个使用 `makeMap` 生成的函数：

```js
makeMap('slot,component', true)
```

可知：`slot` 和 `component` 为 `Vue` 内置的标签

## isReservedAttribute

* 源码如下：

```js
/**
 * Check if a attribute is a reserved attribute.
 */
export const isReservedAttribute = makeMap('key,ref,slot,slot-scope,is')
```

* 描述：检查给定字符串是否是内置的属性

* 源码分析

`isReservedAttribute` 是一个使用 `makeMap` 生成的函数：

```js
makeMap('key,ref,slot,slot-scope,is')
```

可知：`key`、`ref`、`slot`、`slot-scope` 以及 `is` 等属性皆属于内置属性，我们不能使用这些属性作为 `props` 的名字。

## remove

* 源码如下：

```js
export function remove (arr: Array<any>, item: any): Array<any> | void {
  if (arr.length) {
    const index = arr.indexOf(item)
    if (index > -1) {
      return arr.splice(index, 1)
    }
  }
}
```

* 描述：从数组中移除指定元素

* 参数：
  * `{Array} arr` 源数组
  * `{Any} item` 要从数组中移除的元素

* 返回值：如果成功移除，则返回移除后的元素，否则返回 `undefined`。

* 源码分析：

首先判断数组 `arr` 的长度是否为 `0`，如果为 `0` 则说明没有任何需要移除的元素，如果不为 `0` 则使用 `indexOf` 函数查看要移除的元素是否在数组中以及在数组中的位置，然后使用 `splice` 方法将其移除。

## cached

* 源码如下：

```js
/**
 * Create a cached version of a pure function.
 */
export function cached<F: Function> (fn: F): F {
  const cache = Object.create(null)
  return (function cachedFn (str: string) {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  }: any)
}
```

* 描述：为一个纯函数创建一个缓存版本的函数

* 参数：
  * `{Function} fn` 一个函数（注意：这个函数必须是纯函数）

* 返回值： 新的函数

* 源码分析：

首先，大家要明白这个函数的意义，我们提到了，传递给 `cached` 函数的参数一定要是一个纯函数，那为什么要是一个纯函数呢？因为纯函数有一个特性，即输入不变则输出不变。在现实中，有很多这样的场景，简单举个例子，也是我们接下来要介绍的一个函数：中横线转驼峰 (`camelize()` 函数)，假设我们给 `camelize` 函数传递字符串 `aaa-bbb`，那么得到的始终都是 `aaaBbb`，不会有其他可能，那我们想象一下，在一个庞大的应用程序中，我们可能需要转译很多相同的字符串，如果每次都要重新执行转译程序，那么是一个极大的浪费，我们只需转译一次并将结果缓存，当再次需要转译该相同的字符串时，我们只需要从缓存中读取即可，这就是 `cached` 的目标，下面我们看一下它是怎么实现的。

首先创建一个 `cache` 对象：

```js
const cache = Object.create(null)
```

随即便返回一个函数：

```js
return (function cachedFn (str: string) {
  const hit = cache[str]
  return hit || (cache[str] = fn(str))
}: any)
```

这个函数与原函数 `fn` 的区别就在于：先读取缓存：

```js
const hit = cache[str]
```

如果有命中则直接返回缓存的值，否则采用原函数 `fn` 计算一次并且设置缓存，然后返回结果：

```js
return hit || (cache[str] = fn(str))
```

可以看到，这就是一个函数式编程的玩法，也是比较简单的。

## emptyObject

* 源码如下：

```js
export const emptyObject = Object.freeze({})
```

* 描述：创建一个空的冻结对象

* 源码分析：通过以空 `json` 对象 `{}` 为参数调用 `Object.freeze` 函数实现。

## camelize

* 源码如下：

```js
/**
 * Camelize a hyphen-delimited string.
 */
const camelizeRE = /-(\w)/g
export const camelize = cached((str: string): string => {
  return str.replace(camelizeRE, (_, c) => c ? c.toUpperCase() : '')
})
```

* 描述：连字符转驼峰

* 源码分析：

这是一个很基本的函数，定义一个正则表达式：`/-(\w)/g`，用来全局匹配字符串中 *中横线及连字符后的一个字符*，注意该正则中拥有一个捕获组，用来捕获连字符后面的字符，在 `camelize` 函数体内，使用 `camelizeRE` 正则匹配字符串，如果连字符后有字符，则将匹配到的内容使用该字符的大写形式替换，否则使用空字符串替换即可。

* 使用实例：

```js
camelize('aaa-bbb')   // aaaBbb
```

## hyphenate

* 源码如下：

```js
/**
 * Hyphenate a camelCase string.
 */
const hyphenateRE = /\B([A-Z])/g
export const hyphenate = cached((str: string): string => {
  return str.replace(hyphenateRE, '-$1').toLowerCase()
})
```

* 描述：驼峰转连字符

* 源码分析：

其作用与 `camelize` 恰好相反。用来将驼峰字符串转为连字符，实现方式同样是使用正则，正则 `/\B([A-Z])/g` 用来全局匹配字符串中的大写字母，并且该大写字母前必须要单子的边界。在 `hyphenate` 函数体内使用 `hyphenateRE` 正则匹配字符串，并将匹配的内容使用连字符和捕获组的字符替换，最后转为小写。

* 使用实例：

```js
hyphenate('aaaBbb')   // aaa-bbb
```

## noop

* 源码如下：

```js
/**
 * Perform no operation.
 * Stubbing args to make Flow happy without leaving useless transpiled code
 * with ...rest (https://flow.org/blog/2017/05/07/Strict-Function-Call-Arity/)
 */
export function noop (a?: any, b?: any, c?: any) {}
```

* 描述：空函数，什么都不做，用于初始化一些值为函数的变量。

* 源码分析：

就是简单的写了一个空函数 `noop`，至于其中的参数 `a`，`b`，`c` 的作用，我们看注释可知是为了避免 `Flow` 使用 `rest` 参数转译代码。

## no

* 源码如下：

```js
/**
 * Always return false.
 */
export const no = (a?: any, b?: any, c?: any) => false
```

* 描述：始终返回 `false` 的函数

## toRawType

* 源码如下：

```js
/**
 * Get the raw type string of a value e.g. [object Object]
 */
const _toString = Object.prototype.toString

export function toRawType (value: any): string {
  return _toString.call(value).slice(8, -1)
}
```

* 描述：获取一个值的原始类型字符串。

* 源码分析：

首先使用 `Object.prototype.toString` 获取诸如这样的字符串：`[object Object]`，然后使用 `slice` 方法截取，最终结果类似于 `Object`。

## isPlainObject

* 源码如下：

```js
/**
 * Strict object type check. Only returns true
 * for plain JavaScript objects.
 */
export function isPlainObject (obj: any): boolean {
  return _toString.call(obj) === '[object Object]'
}
```

* 描述：检测一个对象是否是纯对象。

* 源码分析：

原理很简单，使用 `Object.prototype.toString` 与 `'[object Object]'` 做全等对比。

## isRegExp

* 源码如下：

```js
export function isRegExp (v: any): boolean {
  return _toString.call(v) === '[object RegExp]'
}
```

* 描述：检测一个对象是否是正则对象。

* 源码分析：

原理很简单，使用 `Object.prototype.toString` 与 `'[object RegExp]'` 做全等对比。

## genStaticKeys

* 源码如下：

```js
/**
 * Generate a static keys string from compiler modules.
 */
export function genStaticKeys (modules: Array<ModuleOptions>): string {
  return modules.reduce((keys, m) => {
    return keys.concat(m.staticKeys || [])
  }, []).join(',')
}
```

* 描述：根据编译器(`compiler`)的 `modules` 生成一个静态键字符串。

* 参数：
  * `{Array} modules` 编译器选项参数的 `modules` 选项

* 源码分析：

首先我们知道 `modules` 是编译器的一个选项，该选项是一个数组，其格式大概如下：

```js
[
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

可以发现 `modules` 的每一个元素是一个对象，该对象可能包含 `staticKeys` 属性，也可能不包含，而 `genStaticKeys` 函数的作用就是通过对 `modules` 数组的遍历，将所有的 `staticKeys` 收集到一个数组，最终转换成一个以逗号 `,` 拼接的字符串。

其实现方式很简单，对数组 `modules` 使用 `reduce` 函数进行归并，将所有的 `staticKeys` 归并到一个数组中，最后通过 `join(',')` 实现目的。

