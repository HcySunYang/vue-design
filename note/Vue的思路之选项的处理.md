## Vue 的思路之选项的处理

这一小节我们继续前面的讨论，看一看 `mergeOptions` 都做了些什么。根据 `core/instance/init.js` 顶部的引用关系可知，`mergeOptions` 函数来自于 `core/util/options.js` 文件，事实上不仅仅是 `mergeOptions` 函数，整个文件所做的一切都为了一件事：选项的合并。

不过在我们深入 `core/util/options.js` 文件之前，我们有必要搞清楚一件事，就是如下代码中：

```js
vm.$options = mergeOptions(
    resolveConstructorOptions(vm.constructor),
    options || {},
    vm
)
```

传递给 `mergeOptions` 函数的三个参数到底是什么。

其中第一个参数是通过调用一个函数得到的，这个函数叫做 `resolveConstructorOptions`，并将 `vm.constructor` 作为参数传递进去。第二个参数 `options` 就是我们调用 `Vue` 构造函数时透传进来的对象，第三个参数是当前 `Vue` 实例，现在我们逐一去看。

`resolveConstructorOptions` 是一个函数，这个函数就声明在 `core/instance/init.js` 文件中，如下：

```js
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      console.log(options)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}
```

在具体去看代码之前，大家能否通过这个函数的名字猜一猜这个函数的作用呢？其名字 `resolve Constructor Options` 那么这个函数是不是用来*解析构造者的 `options`*的呢？答案是：对，就是干这个的。接下来我们就具体看一下它是怎么做的，首先第一句：

```js
let options = Ctor.options
```

其中 `Ctor` 即传递进来的参数 `vm.constructor`，在我们的例子中他就是 `Vue` 构造函数，可能有的同学会问：难道它还有不是 `Vue` 构造函数的时候吗？当然，当你使用 `Vue.extend` 创造一个子类并使用子类创造实例时，那么 `vm.constructor` 就不是 `Vue` 构造函数，而是子类，比如：

```js
const Sub = Vue.extend()
const s = new Sub()
```

那么 `s.constructor` 自然就是 `Sub` 而非 `Vue`，大家知道这一点即可，但在我们的例子中，这里的 `Ctor` 就是 `Vue` 构造函数，而有关于 `Vue.extend` 的东西，我们后面会专门讨论的。

所以，`Ctor.options` 就是 `Vue.options`，然后我们再看 `resolveConstructorOptions` 的返回值是什么？如下：

```js
return options
```

也就是把 `Vue.options` 返回回去了，所以这个函数的确就像他的名字那样，用来获取构造者的 `options` 的。不过同学们可能注意到了，`resolveConstructorOptions` 函数的第一句和最后一句代码中间还有一坨包裹在 `if` 语句中的代码，那么这坨代码是干什么的呢？

我可以很明确的告诉大家，这里水稍微有那么点深，比如 `if` 语句的判断条件 `Ctor.super`，`super` 这是子类才有的属性，如下：

```js
const Sub = Vue.extend()
console.log(Sub.super)  // Vue
```

也就是说，`super` 这个属性是与 `Vue.extend` 有关系的，事实也的确如此。除此之外判断分支内的第一句代码：

```js
const superOptions = resolveConstructorOptions(Ctor.super)
```

我们发现，又递归的调用了 `resolveConstructorOptions` 函数，只不过此时的参数是构造者的父类，之后的代码中，还有一些关于父类的 `options` 属性是否被改变过的判断和操作，并且大家注意这句代码：

```js
// check if there are any late-modified/attached options (#4976)
const modifiedOptions = resolveModifiedOptions(Ctor)
```

不过这次有点不同，不同的是，我们要注意的是注释，有兴趣的同学可以根据注释中括号内的 `issue` 索引去搜一下相关的问题，这句代码是用来解决 `vue-hot-reload-api` 或者 `vue-loader` 时产生的一个 `bug` 的。

现在大家知道这里的水有多深了吗？关于这些问题，我们在将 `Vue.extend` 中都会给大家一一解答，不过有一个因素从来没有变，那就是 `resolveConstructorOptions` 这个函数的作用永远都是用来获取当前实例构造者的 `options` 属性的，即使 `if` 判断分支内也不例外，因为 `if` 分支只不过是处理了 `options`，最终返回的永远都是 `options`。

所以根据我们的例子，`resolveConstructorOptions` 函数目前并不会走里面的判断分支，即此时这个函数相当于：

```js
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  return options
}
```

所以，根据我们的例子，此时的 `mergeOptions` 函数的第一个参数就是 `Vue.options`，那么大家还记得 `Vue.options` 长成什么样子吗？不记得也没关系，这就得益于我们整理的 [附录/Vue构造函数整理-全局API](/note/附录/Vue构造函数整理-全局API) 了，通过查看我们可知 `Vue.options` 如下：

```js
Vue.options = {
	components: {
		KeepAlive
		Transition,
    	TransitionGroup
	},
	directives: Object.create(null),
	directives:{
	    model,
        show
	},
	filters: Object.create(null),
	_base: Vue
}
```





