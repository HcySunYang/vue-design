# 编译器选项

该部分内容整理了 `Vue` 的编译器所接收的选项参数。

```js
{
  shouldDecodeNewlines,
  shouldDecodeNewlinesForHref,
  delimiters,
  comments,
  warn,  // 被 delete

  // baseOptions
  expectHTML: true,
  modules: [
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
  ],
  directives: {
    model: function(){},
    html: function(){},
    text: function(){}
  },
  isPreTag,
  isUnaryTag,
  mustUseProp,
  canBeLeftOpenTag,
  isReservedTag,
  getTagNamespace,
  staticKeys: genStaticKeys(modules),
  warn = (msg, tip) => {
    (tip ? tips : errors).push(msg)
  }
}
```