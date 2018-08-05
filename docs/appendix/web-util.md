# platforms/web/util 目录下的工具方法全解

## index.js 文件

### query

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

* 返回值：`{Element} el` DOM 元素 

* 源码分析：

如果参数是字符串，那么将该字符串作为 `css` 选择符并使用 `document.querySelector()` 函数查询元素，如果查找到该元素则返回该元素，否则在非生产环境下会打印警告信息并返回一个新创建的 `div`。

如果参数不是一个字符串，则原封不动地返回参数。

## attrs.js 文件

### isReservedAttr

* 源码如下：

```js
// these are reserved for web because they are directly compiled away
// during template compilation
export const isReservedAttr = makeMap('style,class')
```

* 描述：`isReservedAttr` 函数是通过 `makeMap` 生成的，用来检测一个属性是否是保留属性(web平台的保留属性)，由源码可知，保留属性有两个：`style` 和 `class`。

### mustUseProp

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

* 描述：用来检测一个属性在标签中是否要使用元素对象原生的 `prop` 进行绑定，注意：**这里的 `prop` 指的是元素对象的属性，而非 `Vue` 中的 `props` 概念**。

举个例子，如下：

```js
const el = document.createElement('div')
el.innerHTML  // 这里的 el.innerHTML 属性就是元素对象的属性
```

* 参数：
    * `{String} tag` 标签名
    * `{String} type` 标签的 `type` 属性，多用于如 `<input type="button"/>`
    * `{String} attr` 属性名

* 返回值：如果给定的属性 `attr` 在标签 `tag` 中要使用元素对象原生的 `prop` 进行绑定，那么就返回 `true`，否则返回 `false`。

* 源码分析：

首先定义一个函数 `acceptValue`，这是一个使用 `makeMap` 生成的函数，用来检测标签是否是以下标签之一：`input,textarea,option,select,progress`。

`mustUseProp` 的函数体就是一个由多个判断组成的语句：

```js
return (
    // `input,textarea,option,select,progress` 这些标签的 value 属性都应该使用元素对象的原生的 prop 绑定（除了 type === 'button' 之外）
    (attr === 'value' && acceptValue(tag)) && type !== 'button' ||
    // option 标签的 selected 属性应该使用元素对象的原生的 prop 绑定
    (attr === 'selected' && tag === 'option') ||
    // input 标签的 checked 属性应该使用元素对象的原生的 prop 绑定
    (attr === 'checked' && tag === 'input') ||
    // video 标签的 muted 属性应该使用元素对象的原生的 prop 绑定
    (attr === 'muted' && tag === 'video')
)
```

总结为：属于以下几种情况之一的，应该使用元素对象的原生 `prop` 绑定：

* `input,textarea,option,select,progress` 这些标签的 `value` 属性都应该使用元素对象的原生的 `prop` 绑定（除了 `type === 'button'` 之外）
* `option` 标签的 `selected` 属性应该使用元素对象的原生的 `prop` 绑定
* `input` 标签的 `checked` 属性应该使用元素对象的原生的 `prop` 绑定
* `video` 标签的 `muted` 属性应该使用元素对象的原生的 `prop` 绑定


## class.js 文件

## compat.js 文件

`compat.js` 文件的全部代码如下：

```js
import { inBrowser } from 'core/util/index'

// check whether current browser encodes a char inside attribute values
let div
function getShouldDecode (href: boolean): boolean {
  div = div || document.createElement('div')
  div.innerHTML = href ? `<a href="\n"/>` : `<div a="\n"/>`
  return div.innerHTML.indexOf('&#10;') > 0
}

// #3663: IE encodes newlines inside attribute values while other browsers don't
export const shouldDecodeNewlines = inBrowser ? getShouldDecode(false) : false
// #6828: chrome encodes content in a[href]
export const shouldDecodeNewlinesForHref = inBrowser ? getShouldDecode(true) : false
```

该文件主要导出两个变量，分别是 `shouldDecodeNewlines` 和 `shouldDecodeNewlinesForHref`，这两个变量都是布尔值，那么这两个变量是干嘛的呢？我们看一个例子就知道了，假设我们有如下 `DOM`：

```html
<div id="link-box">
  <!-- 注意 href 属性值，链接后面加了一个换行 -->
  <a href="http://hcysun.me
  ">aaaa</a>
  <!-- 注意 href 属性值，链接后面加了一个Tab -->
  <a href="http://hcysun.me	">bbbb</a>
</div>
```

上面的 `DOM` 看上去貌似没有什么奇特的地方，关键点在于 `<a>` 标签的 `href` 属性，我们在第一个 `<a>` 标签的 `href` 属性值后面添加了换行符，在第二个 `<a>` 标签的 `href` 属性值后面添加了制表符。那么这么做会有什么影响呢？执行下面的代码就显而易见了：

```js
console.log(document.getElementById('link-box').innerHTML)
```

上面的代码中我们打印了 `id` 为 `link-box` 的 `innerHTML`，如下图：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-11-15-123008.jpg)

注意，只有在 `chrome` 浏览器下才能获得如上效果，可以发现，在获取的内容中换行符和制表符分别被转换成了 `&#10` 和 `&#9`。实际上，这算是浏览器的怪癖行为。在 `IE` 中，不仅仅是 `a` 标签的 `href` 属性值，任何属性值都存在这个问题。这就会影响 `Vue` 的编译器在对模板进行编译后的结果，导致莫名奇妙的问题，为了避免这些问题 `Vue` 需要知道什么时候要做兼容工作，这就是 `shouldDecodeNewlines` 和 `shouldDecodeNewlinesForHref` 这两个变量的作用。

下面我们看一下具体实现，首先定义了一个函数 `getShouldDecode`：

```js
let div
function getShouldDecode (href: boolean): boolean {
  div = div || document.createElement('div')
  div.innerHTML = href ? `<a href="\n"/>` : `<div a="\n"/>`
  return div.innerHTML.indexOf('&#10;') > 0
}
```

该函数的作用是判断当前浏览器是否会对属性值中所包含的换行符进行编码，如果是则返回真，否则返回假。其实现原理分三步：

* 1、创建一个 `div`
* 2、设置这个 `div` 的 `innerHTML` 为 `<a href="\n"/>` 或者 `<div a="\n"/>`
* 3、获取该 `div` 的 `innerHTML` 并检测换行符是否被编码

`getShouldDecode` 接收一个布尔值参数 `href`，如果该参数为 `true` 意味着要监测的是 `a` 标签的 `href` 属性，否则检测任意属性。

有了上面的函数再实现 `shouldDecodeNewlines` 和 `shouldDecodeNewlinesForHref` 这两个变量就容易多了：

```js
export const shouldDecodeNewlines = inBrowser ? getShouldDecode(false) : false
export const shouldDecodeNewlinesForHref = inBrowser ? getShouldDecode(true) : false
```

最终如果 `shouldDecodeNewlines` 为 `true`，意味着 `Vue` 在编译模板的时候，要对属性值中的换行符或制表符做兼容处理。而 `shouldDecodeNewlinesForHref` 为 `true` 意味着 `Vue` 在编译模板的时候，要对 `a` 标签的 `href` 属性值中的换行符或制表符做兼容处理。当然，一切都是以在浏览器中为前提的，因为上面的代码中存在一个 `inBrowser` 的判断。

最后再啰嗦一句，为什么只在浏览器中才需要判断是否需要做此兼容处理呢？那是因为，只有完整版(包括编译器)的 `Vue`才会遇到这个问题，因为只有完整版的 `Vue` 才会在浏览器中对模板进行编译，才有可能在获取模板的时候使用 `innerHTML` 获取模板内容。

## element.js 文件

### isHTMLTag

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

`isHTMLTag` 是一个使用 `makeMap` 生成的函数，可以在 [shared/util.js 文件工具方法全解](./shared-util) 中查看 `makeMap` 方法。

### isSVG

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

`isSVG` 是一个使用 `makeMap` 生成的函数，可以在 [shared/util.js 文件工具方法全解](./shared-util) 中查看 `makeMap` 方法。

### isPreTag

* 源码如下：

```js
export const isPreTag = (tag: ?string): boolean => tag === 'pre'
```

* 描述：检查给定的标签是否是 `pre` 标签

* 源码分析

通过 `tag === 'pre'` 进行判断。

### isReservedTag

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

判断一个标签是否是保留标签，我们可以知道，如果一个标签是 `html` 标签，或者是 `svg` 标签，那么这个标签即是保留标签。

### getTagNamespace

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


## style.js 文件