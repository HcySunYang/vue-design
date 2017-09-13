## shared/util.js 文件工具方法全解

#### extend

`extend` 方法的全部代码如下：

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

该函数的作用是，将 `_from` 对象的属性混合到 `to` 对象中。使用一个简单的 `for in` 语句实现。