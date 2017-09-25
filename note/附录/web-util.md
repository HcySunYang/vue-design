## platforms/web/util 目录下的工具方法全解

#### index.js 文件

##### query

* 源码如下：

```js
/**
 * Query an element selector if it's not an element already.
 */
export function query (el: string | Element): Element {
  if (typeof el === 'string') {
    const selected = document.querySelector(el)
    if (!selected) {
      process.env.NODE_ENV !== 'production' && warn(
        'Cannot find element: ' + el
      )
      return document.createElement('div')
    }
    return selected
  } else {
    return el
  }
}
```

* 描述：查询元素

* 参数：
    * `{String | Element} el` css选择符或者DOM元素

* 返回值：`{Element}` 如果参数是字符串，那么将该字符串作为css选择符查询元素，如果查找到该元素则返回该元素，否则返回一个新创建的 `div`，如果参数不是一个字符串，则直接返回参数。

* 源码分析：

`query` 函数内部使用 `document.querySelector()` 实现，so easy。

#### attrs.js 文件

##### isReservedAttr

* 源码如下：

```js
// these are reserved for web because they are directly compiled away
// during template compilation
export const isReservedAttr = makeMap('style,class')
```

* 描述：`isReservedAttr` 函数是通过 `makeMap` 生成的，用来检测一个属性是否是保留属性(web平台的保留属性)，由源码可知，保留属性有两个：`style` 和 `class`。

##### mustUseProp

* 源码如下：

```js
// attributes that should be using props for binding
const acceptValue = makeMap('input,textarea,option,select,progress')
export const mustUseProp = (tag: string, type: ?string, attr: string): boolean => {
  return (
    (attr === 'value' && acceptValue(tag)) && type !== 'button' ||
    (attr === 'selected' && tag === 'option') ||
    (attr === 'checked' && tag === 'input') ||
    (attr === 'muted' && tag === 'video')
  )
}
```

* 描述：用来检测一个属性在指定的标签中是否要使用 `props` 进行绑定

* 参数：
    * `{String} tag` 标签名
    * `{String} type` 标签的 `type` 属性，多用于如 `<input type="button"/>`
    * `{String} attr` 属性名

* 返回值：如果给定的属性 `attr`，在标签 `tag` 中要使用 `props` 进行绑定，那么就返回 `true`，否则 `false`。

* 源码分析：

首先定义一个函数 `acceptValue`，这是一个使用 `makeMap` 生成的函数，用来检测标签是否是以下标签之一：`input,textarea,option,select,progress`。

`mustUseProp` 的函数体就是一个由多个判断组成的语句：

```js
return (
    // `input,textarea,option,select,progress` 这些标签的 value 属性都应该使用 props 绑定（除了 type === 'button' 之外）
    (attr === 'value' && acceptValue(tag)) && type !== 'button' ||
    // option 标签的 selected 属性应该使用 props 绑定
    (attr === 'selected' && tag === 'option') ||
    // input 标签的 checked 属性应该使用 props 绑定
    (attr === 'checked' && tag === 'input') ||
    // video 标签的 muted 属性应该使用 props 绑定
    (attr === 'muted' && tag === 'video')
)
```

总结为：属于以下几种情况之一的，应该改使用 `props` 绑定：

* `input,textarea,option,select,progress` 这些标签的 `value` 属性都应该使用 `props` 绑定（除了 `type === 'button'` 之外）
* `option` 标签的 `selected` 属性应该使用 `props` 绑定
* `input` 标签的 `checked` 属性应该使用 `props` 绑定
* `video` 标签的 `muted` 属性应该使用 `props` 绑定


#### class.js 文件

#### compat.js 文件

#### element.js 文件

##### isHTMLTag

* 源码如下：

```js
export const isHTMLTag = makeMap(
  'html,body,base,head,link,meta,style,title,' +
  'address,article,aside,footer,header,h1,h2,h3,h4,h5,h6,hgroup,nav,section,' +
  'div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,' +
  'a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,rtc,ruby,' +
  's,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,' +
  'embed,object,param,source,canvas,script,noscript,del,ins,' +
  'caption,col,colgroup,table,thead,tbody,td,th,tr,' +
  'button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,' +
  'output,progress,select,textarea,' +
  'details,dialog,menu,menuitem,summary,' +
  'content,element,shadow,template,blockquote,iframe,tfoot'
)
```

* 描述：检查是否是HTML标签

* 源码分析

`isHTMLTag` 是一个使用 `makeMap` 生成的函数，可以在 [shared/util.js 文件工具方法全解](/note/附录/shared-util) 中查看 `makeMap` 方法。

##### isSVG

* 源码如下：

```js
// this map is intentionally selective, only covering SVG elements that may
// contain child elements.
export const isSVG = makeMap(
  'svg,animate,circle,clippath,cursor,defs,desc,ellipse,filter,font-face,' +
  'foreignObject,g,glyph,image,line,marker,mask,missing-glyph,path,pattern,' +
  'polygon,polyline,rect,switch,symbol,text,textpath,tspan,use,view',
  true
)
```

* 描述：检查是否是SVG标签

* 源码分析

`isSVG` 是一个使用 `makeMap` 生成的函数，可以在 [shared/util.js 文件工具方法全解](/note/附录/shared-util) 中查看 `makeMap` 方法。

##### isPreTag

* 源码如下：

```js
export const isPreTag = (tag: ?string): boolean => tag === 'pre'
```

* 描述：检查给定的标签是否是 `pre` 标签

* 源码分析

通过 `tag === 'pre'` 进行判断。

##### isReservedTag

* 源码如下：

```js
export const isReservedTag = (tag: string): ?boolean => {
  return isHTMLTag(tag) || isSVG(tag)
}
```

* 描述：检查给定的标签是否是保留的标签

* 源码分析

通过如下代码：

```js
isHTMLTag(tag) || isSVG(tag)
```

判断一个标签是否是保留标签，我们可以知道，如果一个标签是 `html` 标签，或者是 `svg` 标签，那么这个标签即使保留标签。

##### getTagNamespace

* 源码如下：

```js
export function getTagNamespace (tag: string): ?string {
  if (isSVG(tag)) {
    return 'svg'
  }
  // basic support for MathML
  // note it doesn't support other MathML elements being component roots
  if (tag === 'math') {
    return 'math'
  }
}
```

* 描述：获取元素(标签)的命名空间

* 参数：
    * `{String} tag` 标签名

* 返回值：`{String | undefined}` 如果一个标签满足 `isSVG(tag)`，则返回 `'svg'`，如果标签为 `math` 则返回 `'math'`，其他情况返回 `undefined`。


#### style.js 文件