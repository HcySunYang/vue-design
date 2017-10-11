## shared/util.js 文件工具方法全解

#### extend

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

#### makeMap

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

#### isBuiltInTag

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

#### cached

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

#### camelize

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

* 描述：中横线转驼峰

* 源码分析：

这是一个很基本的函数，定义一个正则表达式：`/-(\w)/g`，用来全局匹配字符串中 *中横线及中横线后的一个字符*。真心没什么好说的.....

* 使用实例：

```js
camelize('aaa-bbb')   // aaaBbb
```

#### noop

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

#### isPlainObject

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

#### isRegExp

* 源码如下：

```js
export function isRegExp (v: any): boolean {
  return _toString.call(v) === '[object RegExp]'
}
```

* 描述：检测一个对象是否是正则对象。

* 源码分析：

原理很简单，使用 `Object.prototype.toString` 与 `'[object RegExp]'` 做全等对比。