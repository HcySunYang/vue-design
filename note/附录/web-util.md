## platforms/web/util 目录下的工具方法全解

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
