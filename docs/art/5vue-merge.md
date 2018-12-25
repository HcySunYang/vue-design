# Vue 选项的合并

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

这段代码的第一句和最后一句说明了 `mergeOptions` 函数的的确确返回了一个新的对象，因为第一句代码定义了一个常量 `options`，而最后一句代码将其返回，所以我们自然可以预估到中间的代码是在充实 `options` 常量，而 `options` 常量就应该是最终合并之后的选项，我们看看它是怎么产生的。

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
      KeepAlive,
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

那么 `key` 就应该分别是：`components`、`directives`、`filters` 以及 `_base`，除了 `_base` 其他的字段都可以理解为是 `Vue` 提供的选项的名字。

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

其中 `hasOwn` 函数来自于 `shared/util.js` 文件，可以在 [shared/util.js 文件工具方法全解](../appendix/shared-util.md) 中查看其详解，其作用是用来判断一个属性是否是对象自身的属性(不包括原型上的)。所以这个判断语句的意思是，如果 `child` 对象的键也在 `parent` 上出现，那么就不要再调用 `mergeField` 了，因为在上一个 `for in` 循环中已经调用过了，这就避免了重复调用。

总之这两个 `for in` 循环的目的就是使用在 `parent` 或者 `child` 对象中出现的 `key(即选项的名字)` 作为参数调用 `mergeField` 函数，真正合并的操作实际在 `mergeField` 函数中。

`mergeField` 代码如下：

```js
function mergeField (key) {
  const strat = strats[key] || defaultStrat
  options[key] = strat(parent[key], child[key], vm, key)
}
```

`mergeField` 函数只有两句代码，第一句代码定义了一个常量 `strat`，它的值是通过指定的 `key` 访问 `strats` 对象得到的，而当访问的属性不存在时，则使用 `defaultStrat` 作为值。

这里我们就要明确了，`strats` 是什么？想弄明白这个问题，我们需要从整体角度去看一下 `options.js` 文件，首先看文件顶部的一堆 `import` 语句下的第一句代码：

```js
/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
const strats = config.optionMergeStrategies
```

这句代码就定义了 `strats` 变量，且它是一个常量，这个常量的值为 `config.optionMergeStrategies`，这个 `config` 对象是全局配置对象，来自于 `core/config.js` 文件，此时 `config.optionMergeStrategies` 还只是一个空的对象。注意一下这里的一段注释：*选项覆盖策略是处理如何将父选项值和子选项值合并到最终值的函数*。也就是说 `config.optionMergeStrategies` 是一个合并选项的策略对象，这个对象下包含很多函数，这些函数就可以认为是合并特定选项的策略。这样不同的选项使用不同的合并策略，如果你使用自定义选项，那么你也可以自定义该选项的合并策略，只需要在 `Vue.config.optionMergeStrategies` 对象上添加与自定义选项同名的函数就行。而这就是 `Vue` 文档中提过的全局配置：[optionMergeStrategies](https://vuejs.org/v2/api/#optionMergeStrategies)。

## 选项 el、propsData 的合并策略

那么接下来我们就看看这个选项合并策略对象都有哪些策略，首先是下面这段代码：

```js
/**
 * Options with restrictions
 */
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}
```

非生产环境下在 `strats` 策略对象上添加两个策略(两个属性)分别是 `el` 和 `propsData`，且这两个属性的值是一个函数。通过这两个属性的名字可知，这两个策略函数是用来合并 `el` 选项和 `propsData` 选项的。与其说“合并”不如说“处理”，因为其本质上并没有做什么合并工作。那么我们看看这个策略函数的具体内容，了解一下它是怎么处理 `el` 和 `propsData` 选项的。

首先是一段 `if` 判断分支，判断是否有传递 `vm` 参数：

```js
if (!vm) {
  warn(
    `option "${key}" can only be used during instance ` +
    'creation with the `new` keyword.'
  )
}
```

如果没有传递这个参数，那么便会给你一个警告，提示你 `el` 选项或者 `propsData` 选项只能在使用 `new` 操作符创建实例的时候可用。比如下面的代码：

```js
// 子组件
var ChildComponent = {
  el: '#app2',
  created: function () {
    console.log('child component created')
  }
}

// 父组件
new Vue({
  el: '#app',
  data: {
    test: 1
  },
  components: {
    ChildComponent
  }
})
```

上面的代码中我们在父组件中使用 `el` 选项，这并没有什么问题，但是在子组件中也使用了 `el` 选项，这就会得到如上警告。这说明了一个问题，即在策略函数中如果拿不到 `vm` 参数，那说明处理的是子组件选项。所以问题来了，为什么通过判断 `vm` 是否存在，就能判断出是否是子组件呢？那首先我们要搞清楚策略函数中的 `vm` 参数是哪里来的。首先我们还是看一下 `mergeField` 函数：

```js
function mergeField (key) {
  const strat = strats[key] || defaultStrat
  options[key] = strat(parent[key], child[key], vm, key)
}
```

函数体的第二句代码中在调用策略函数的时候，第三个参数 `vm` 就是我们在策略函数中使用的那个 `vm`，那么这里的 `vm` 是谁呢？它实际上是从 `mergeOptions` 函数透传过来的，因为 `mergeOptions` 函数的第三个参数就是 `vm`。我们知道在 `_init` 方法中调用 `mergeOptions` 函数时第三个参数就是当前 `Vue` 实例：

```js
// _init 方法中调用 mergeOptions 函数，第三个参数是 Vue 实例
vm.$options = mergeOptions(
  resolveConstructorOptions(vm.constructor),
  options || {},
  vm
)
```

所以我们可以理解为：策略函数中的 `vm` 来自于 `mergeOptions` 函数的第三个参数。所以当调用 `mergeOptions` 函数且不传递第三个参数的时候，那么在策略函数中就拿不到 `vm` 参数。所以我们可以猜测到一件事，那就是 `mergeOptions` 函数除了在 `_init` 方法中被调用之外，还在其他地方被调用，且没有传递第三个参数。那么到底是在哪里被调用的呢？这里可以先明确地告诉大家，就是在 `Vue.extend` 方法中被调用的，大家可以打开 `core/global-api/extend.js` 文件找到 `Vue.extend` 方法，其中有这么一段代码：

```js
Sub.options = mergeOptions(
  Super.options,
  extendOptions
)
```

可以发现，此时调用 `mergeOptions` 函数就没有传递第三个参数，也就是说通过 `Vue.extend` 创建子类的时候 `mergeOptions` 会被调用，此时策略函数就拿不到第三个参数。

所以现在就比较明朗了，在策略函数中通过判断是否存在 `vm` 就能够得知 `mergeOptions` 是在实例化时调用(使用 `new` 操作符走 `_init` 方法)还是在继承时调用(`Vue.extend`)，而子组件的实现方式就是通过实例化子类完成的，子类又是通过 `Vue.extend` 创造出来的，所以我们就能通过对 `vm` 的判断而得知是否是子组件了。

所以最终的结论就是：*如果策略函数中拿不到 `vm` 参数，那么处理的就是子组件的选项*，花了大量的口舌解释了策略函数中判断 `vm` 的意义，实际上这些解释是必要的。

我们接着看 `strats.el` 和 `strats.propsData` 策略函数的代码，在 `if` 判断分支下面，直接调用了 `defaultStrat` 函数并返回：

```js
return defaultStrat(parent, child)
```

`defaultStrat` 函数就定义在 `options.js` 文件内，源码如下：

```js
/**
 * Default strategy.
 */
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}
```

实际上 `defaultStrat` 函数就如同它的名字一样，它是一个默认的策略，当一个选项不需要特殊处理的时候就使用默认的合并策略，它的逻辑很简单：只要子选项不是 `undefined` 那么就是用子选项，否则使用父选项。

但是大家还要注意一点，`strats.el` 和 `strats.propsData` 这两个策略函数是只有在非生产环境才有的，在生产环境下访问这两个函数将会得到 `undefined`，那这个时候 `mergeField` 函数的第一句代码就起作用了：

```js
// 当一个选项没有对应的策略函数时，使用默认策略
const strat = strats[key] || defaultStrat
```

所以在生产环境将直接使用默认的策略函数 `defaultStrat` 来处理 `el` 和 `propsData` 这两个选项。

## 选项 data 的合并策略

下面我们接着按照顺序看 `options.js` 文件的代码，接下来定义了两个函数：`mergeData` 以及 `mergeDataOrFn`，我们暂且不关注这两个函数的作用。暂且跳过继续看下面的代码，接下来的代码如下：

```js
strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    return mergeDataOrFn(parentVal, childVal)
  }

  return mergeDataOrFn(parentVal, childVal, vm)
}
```

这段代码的作用是在 `strats` 策略对象上添加 `data` 策略函数，用来合并处理 `data` 选项。我们看看这个策略函数的内容，首先是一个判断分支：

```js
if (!vm) {
  ...
}
```

与 `el` 和 `propsData` 这两个策略函数相同，先判断是否传递了 `vm` 这个参数，我们知道当没有 `vm` 参数时，说明处理的是子组件的选项，那我们就看看对于子组件的选项它是如何处理的，`if` 判断语句块内的代码如下：

```js
if (childVal && typeof childVal !== 'function') {
  process.env.NODE_ENV !== 'production' && warn(
    'The "data" option should be a function ' +
    'that returns a per-instance value in component ' +
    'definitions.',
    vm
  )

  return parentVal
}
return mergeDataOrFn(parentVal, childVal)
```

首先判断是否传递了子组件的 `data` 选项(即：`childVal`)，并且检测 `childVal` 的类型是不是 `function`，如果 `childVal` 的类型不是 `function` 则会给你一个警告，也就是说 `childVal` 应该是一个函数，如果不是函数会提示你 `data` 的类型必须是一个函数，这就是我们知道的：*子组件中的 `data` 必须是一个返回对象的函数*。如果不是函数，除了给你一段警告之外，会直接返回 `parentVal`。

如果 `childVal` 是函数类型，那说明满足了子组件的 `data` 选项需要是一个函数的要求，那么就直接返回 `mergeDataOrFn` 函数的执行结果：

```js
return mergeDataOrFn(parentVal, childVal)
```

上面的情况是在 `strats.data` 策略函数拿不到 `vm` 参数时的情况，如果拿到了 `vm` 参数，那么说明处理的选项不是子组件的选项，而是正常使用 `new` 操作符创建实例时的选项，这个时候则直接返回 `mergeDataOrFn` 的函数执行结果，但是会多透传一个参数 `vm`：

```js
return mergeDataOrFn(parentVal, childVal, vm)
```

通过上面的分析我们得知一件事，即 `strats.data` 策略函数无论合并处理的是子组件的选项还是非子组件的选项，其最终都是调用 `mergeDataOrFn` 函数进行处理的，并且以 `mergeDataOrFn` 函数的返回值作为策略函数的最终返回值。有一点不同的是在处理非子组件选项的时候所调用的 `mergeDataOrFn` 函数多传递了一个参数 `vm`。所以接下来我们要做的事儿就是看看 `mergeDataOrFn` 的代码，看一看它的返回值是什么，因为它的返回值就等价于 `strats.data` 策略函数的返回值。`mergeDataOrFn` 函数的源码如下：

```js
/**
 * Data
 */
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}
```

这个函数整体由 `if` 判断分支语句块组成，首先对 `vm` 进行判断，我们知道无论是子组件选项还是非子组件选项 `strats.data` 策略函数都是通过调用 `mergeDataOrFn` 函数来完成处理的，且处理非子组件选项的时候要比处理子组件选项时多传递了一个参数 `vm`，这就使得 `mergeDataOrFn` 也能通过是否有 `vm` 来区分处理的是不是子组件选项。如果没有拿到 `vm` 参数的话，那说明处理的是子组件选项，程序会走 `if` 分支，实际上我们可以看到这里有段注释：

```js
// in a Vue.extend merge, both should be functions
```

这段注释的意思是：选项是在调用 `Vue.extend` 函数时进行合并处理的，此时父子 `data` 选项都应该是函数。

这再次说明了，当拿不到 `vm` 这个参数的时候，合并操作是在 `Vue.extend` 中进行的，也就是在处理子组件的选项。而且此时 `childVal` 和 `parentVal` 都应该是函数，那么这里真的能保证 `childVal` 和 `parentVal` 都是函数了吗？其实是可以的，我们后面会讲到。

在这句注释的下面是这段代码：

```js
if (!childVal) {
  return parentVal
}
if (!parentVal) {
  return childVal
}
```

我们看第一个 `if` 语句块，如果没有 `childVal`，也就是说子组件的选项中没有 `data` 选项，那么直接返回 `parentVal`，比如下面的代码：

```js
Vue.extend({})
```

我们使用 `Vue.extend` 函数创建子类的时候传递的子组件选项是一个空对象，即没有 `data` 选项，那么此时 `parentVal` 实际上就是 `Vue.options`，由于 `Vue.options` 上也没有 `data` 这个属性，所以压根就不会执行 `strats.data` 策略函数，也就更不会执行 `mergeDataOrFn` 函数，有的同学可能会问：既然都没有执行，那么这里的 `return parentVal` 是不是多余的？当然不多余，因为 `parentVal` 存在有值的情况。那么什么时候才会出现 `childVal` 不存在但是 `parentVal` 存在的情况呢？看下面的代码：

```js
const Parent = Vue.extend({
  data: function () {
    return {
      test: 1
    }
  }
})

const Child = Parent.extend({})
```

上面的代码中 `Parent` 类继承了 `Vue`，而 `Child` 又继承了 `Parent`，关键就在于我们使用 `Parent.extend` 创建 `Child` 子类的时候，对于 `Child` 类来讲，`childVal` 不存在，因为我们没有传递 `data` 选项，但是 `parentVal` 存在，即 `Parent.options` 下的 `data` 选项，那么 `Parent.options` 是哪里来的呢？实际就是 `Vue.extend` 函数内使用 `mergeOptions` 生成的，所以此时 `parentVal` 必定是个函数，因为 `strats.data` 策略函数在处理 `data` 选项后返回的始终是一个函数。

所以现在再看这段代码就清晰多了：

```js
if (!childVal) {
  return parentVal
}
if (!parentVal) {
  return childVal
}
```

由于 `childVal` 和 `parentVal` 必定会有其一，否则便不会执行 `strats.data` 策略函数，所以上面判断的意思就是：*如果没有子选项则使用父选项，没有父选项就直接使用子选项，且这两个选项都能保证是函数*，如果父子选项同时存在，则代码继续进行，将执行下面的代码：

```js
// when parentVal & childVal are both present,
// we need to return a function that returns the
// merged result of both functions... no need to
// check if parentVal is a function here because
// it has to be a function to pass previous merges.
return function mergedDataFn () {
  return mergeData(
    typeof childVal === 'function' ? childVal.call(this, this) : childVal,
    typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
  )
}
```

也就是说，当父子选项同时存在，那么就返回一个函数 `mergedDataFn`，注意：此时代码运行就结束了，因为函数已经返回了(`return`)，至于 `mergedDataFn` 函数里面又返回了 `mergeData` 函数的执行结果这句代码目前还没有执行。

以上就是 `strats.data` 策略函数在处理子组件的 `data` 选项时所做的事，我们可以发现 `mergeDataOrFn` 函数在处理子组件选项时返回的总是一个函数，这也就间接导致 `strats.data` 策略函数在处理子组件选项时返回的也总是一个函数。

说完了处理子组件选项的情况，我们再看看处理非子组件选项的情况，也就是使用 `new` 操作符创建实例时的情况，此时程序直接执行 `strats.data` 函数的最后一句代码：

```js
return mergeDataOrFn(parentVal, childVal, vm)
```

我们发现同样是调用 `mergeDataOrFn` 函数，只不过这个时候传递了 `vm` 参数，也就是说这将会执行 `mergeDataOrFn` 的 `else` 分支：

```js
if (!vm) {
  ...
} else {
  return function mergedInstanceDataFn () {
    // instance merge
    const instanceData = typeof childVal === 'function'
      ? childVal.call(vm, vm)
      : childVal
    const defaultData = typeof parentVal === 'function'
      ? parentVal.call(vm, vm)
      : parentVal
    if (instanceData) {
      return mergeData(instanceData, defaultData)
    } else {
      return defaultData
    }
  }
}
```

如果走了 `else` 分支的话那么就直接返回 `mergedInstanceDataFn` 函数，注意此时的 `mergedInstanceDataFn` 函数同样还没有执行，它是 `mergeDataOrFn` 函数的返回值，所以这再次说明了一个问题：*`mergeDataOrFn` 函数永远返回一个函数*。

也就是说，假如以我们的例子为例：

```js
let v = new Vue({
  el: '#app',
  data: {
    test: 1
  }
})
```

我们的 `data` 选项在经过 `mergeOptions` 处理之后将变成一个函数，且根据我们的分析，它应该就是 `mergedInstanceDataFn` 函数，我们可以在控制台打印如下信息：

```js
console.log(v.$options)
```

输出如下图：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-10-20-102839.jpg)

我们可以发现 `data` 选项确实被 `mergeOptions` 处理成了一个函数，且当 `data` 选项为非子组件的选项时，该函数就是 `mergedInstanceDataFn`。

一个简单的总结，现在我们了解到了一个事实，即 `data` 选项最终被 `mergeOptions` 函数处理成了一个函数，当合并处理的是子组件的选项时 `data` 函数可能是以下三者之一：

* 1、就是 `data` 本身，因为子组件的 `data` 选项本身就是一个函数，即如下 `mergeDataOrFn` 函数的代码段所示：

```js
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    ...
    // 返回子组件的 data 选项本身
    if (!parentVal) {
      return childVal
    }
    ...
  } else {
    ...
  }
}
```

* 2、父类的 `data` 选项，如下代码段所示：：

```js
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    ...
    // 返回父类的 data 选项
    if (!childVal) {
      return parentVal
    }
    ...
  } else {
    ...
  }
}
```

* 3、`mergedDataFn` 函数，如下代码段所示：

```js
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    ...
    // 返回 mergedDataFn 函数
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    ...
  }
}
```

当合并处理的是非子组件的选项时 `data` 函数为 `mergedInstanceDataFn` 函数，如下代码段所示：

```js
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    ...
  } else {
    // 当合并处理的是非子组件的选项时 `data` 函数为 `mergedInstanceDataFn` 函数
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}
```

所以这就是我们一直强调的：*`data` 选项最终被处理为一个函数*。但是根据我们之前的分析可知，函数分几种情况，但它们都有一个共同的特点，即：*这些函数的执行结果就是最终的数据*。

我们可以发现 `mergedDataFn` 和 `mergedInstanceDataFn` 这两个函数有一个共同的特点，内部都调用了 `mergeData` 处理数据并返回，我们先看一下 `mergedDataFn` 函数，其源码如下：

```js
return function mergedDataFn () {
  return mergeData(
    typeof childVal === 'function' ? childVal.call(this, this) : childVal,
    typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
  )
}
```

这个函数直接返回了 `mergeData` 函数的执行结果，再看看 `mergedInstanceDataFn` 函数，其源码如下：

```js
return function mergedInstanceDataFn () {
  // instance merge
  const instanceData = typeof childVal === 'function'
    ? childVal.call(vm, vm)
    : childVal
  const defaultData = typeof parentVal === 'function'
    ? parentVal.call(vm, vm)
    : parentVal
  if (instanceData) {
    return mergeData(instanceData, defaultData)
  } else {
    return defaultData
  }
}
```

我们注意到 `mergedDataFn` 和 `mergedInstanceDataFn` 这两个函数都有类似这样的代码：

```js
typeof childVal === 'function' ? childVal.call(this, this) : childVal
typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
```

我们知道 `childVal` 要么是子组件的选项，要么是使用 `new` 操作符创建实例时的选项，无论是哪一种，总之 `childVal` 要么是函数，要么就是一个纯对象。所以如果是函数的话就通过执行该函数从而获取到一个纯对象，所以类似上面那段代码中判断 `childVal` 和 `parentVal` 的类型是否是函数的目的只有一个，获取数据对象(纯对象)。所以 `mergedDataFn` 和 `mergedInstanceDataFn` 函数内部调用 `mergeData` 方法时传递的两个参数就是两个纯对象(当然你可以简单的理解为两个JSON对象)。

所以说既然知道了 `mergeData` 函数接收的两个参数就是两个纯对象，那么再看 `mergeData` 函数的代码就轻松多了，它才是终极合并策略，其源码如下：

```js
/**
 * Helper that recursively merges two data objects together.
 */
function mergeData (to: Object, from: ?Object): Object {
  // 没有 from 直接返回 to
  if (!from) return to
  let key, toVal, fromVal
  const keys = Object.keys(from)
  // 遍历 from 的 key
  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    toVal = to[key]
    fromVal = from[key]
    // 如果 from 对象中的 key 不在 to 对象中，则使用 set 函数为 to 对象设置 key 及相应的值
    if (!hasOwn(to, key)) {
      set(to, key, fromVal)
    // 如果 from 对象中的 key 也在 to 对象中，且这两个属性的值都是纯对象则递归进行深度合并
    } else if (isPlainObject(toVal) && isPlainObject(fromVal)) {
      mergeData(toVal, fromVal)
    }
    // 其他情况什么都不做
  }
  return to
}
```

`mergeData` 函数接收两个参数 `to` 和 `from`，根据 `mergeData` 函数被调用时参数的传递顺序我们知道，`to` 对应的是 `childVal` 产生的纯对象，`from` 对应 `parentVal` 产生的纯对象，我们看 `mergeData` 第一句代码：

```js
if (!from) return to
```

如果没有 `from` 则直接返回 `to`，也就是说如果没有 `parentVal` 产生的值，就直接使用 `childVal` 产生的值。

如果有 `parentVal` 产生的值，则代码继续向下运行，我们看 `mergeData` 最后的返回值：

```js
return to
```

其返回的仍是 `to` 对象，所以你应该能猜的到 `mergeData` 函数的作用，可以简单理解为：*将 `from` 对象的属性混合到 `to` 对象中，也可以说是将 `parentVal` 对象的属性混合到 `childVal` 中*，最后返回的是处理后的 `childVal` 对象。

`mergeData` 的具体做法就是像上面 `mergeData` 函数的代码段中所注释的那样，对 `from` 对象的 `key` 进行遍历：

* 如果 `from` 对象中的 `key` 不在 `to` 对象中，则使用 `set` 函数为 `to` 对象设置 `key` 及相应的值。

* 如果 `from` 对象中的 `key` 在 `to` 对象中，且这两个属性的值都是纯对象则递归地调用 `mergeData` 函数进行深度合并。

* 其他情况不做处理。

上面提到了一个 `set` 函数，根据 `options.js` 文件头部的引用关系可知：这个函数来自于 `core/observer/index.js` 文件，实际上这个 `set` 函数就是 `Vue` 暴露给我们的全局API `Vue.set`。在这里由于我们还没有讲到 `set` 函数的具体实现，所以你就可以简单理解为 `set` 函数的功能与我们前面遇到过的 `extend` 工具函数功能相似即可。

所以我们知道了 `mergeData` 函数的执行结果才是真正的数据对象，由于 `mergedDataFn` 和 `mergedInstanceDataFn` 这两个函数的返回值就是 `mergeData` 函数的执行结果，所以 `mergedDataFn` 和 `mergedInstanceDataFn` 函数的执行将会得到数据对象，我们还知道 `data` 选项会被 `mergeOptions` 处理成函数，比如处理成 `mergedInstanceDataFn`，所以：*最终得到的 `data` 选项是一个函数，且该函数的执行结果就是最终的数据对象*。

最后我们对大家经常会产生疑问的地方做一些补充：

### 一、为什么最终 `strats.data` 会被处理成一个函数？

这是因为，通过函数返回数据对象，保证了每个组件实例都有一个唯一的数据副本，避免了组件间数据互相影响。后面讲到 `Vue` 的初始化的时候大家会看到，在初始化数据状态的时候，就是通过执行 `strats.data` 函数来获取数据并对其进行处理的。

### 二、为什么不在合并阶段就把数据合并好，而是要等到初始化的时候再合并数据？

这个问题是什么意思呢？我们知道在合并阶段 `strats.data` 将被处理成一个函数，但是这个函数并没有被执行，而是到了后面初始化的阶段才执行的，这个时候才会调用 `mergeData` 对数据进行合并处理，那这么做的目的是什么呢？

其实这么做是有原因的，后面讲到 `Vue` 的初始化的时候，大家就会发现 `inject` 和 `props` 这两个选项的初始化是先于 `data` 选项的，这就保证了我们能够使用 `props` 初始化 `data` 中的数据，如下：

```js
// 子组件：使用 props 初始化子组件的 childData 
const Child = {
  template: '<span></span>',
  data () {
    return {
      childData: this.parentData
    }
  },
  props: ['parentData'],
  created () {
    // 这里将输出 parent
    console.log(this.childData)
  }
}

var vm = new Vue({
    el: '#app',
    // 通过 props 向子组件传递数据
    template: '<child parent-data="parent" />',
    components: {
      Child
    }
})
```

如上例所示，子组件的数据 `childData` 的初始值就是 `parentData` 这个 `props`。而之所以能够这样做的原因有两个

* 1、由于 `props` 的初始化先于 `data` 选项的初始化
* 2、`data` 选项是在初始化的时候才求值的，你也可以理解为在初始化的时候才使用 `mergeData` 进行数据合并。

### 三、你可以这么做。

在上面的例子中，子组件的 `data` 选项我们是这么写的：

```js
data () {
  return {
    childData: this.parentData
  }
}
```

但你知道吗，你也可以这么写：

```js
data (vm) {
  return {
    childData: vm.parentData
  }
}
// 或者使用更简单的解构赋值
data ({ parentData }) {
  return {
    childData: parentData
  }
}
```

我们可以通过解构赋值的方式，也就是说 `data` 函数的参数就是当前实例对象。那么这个参数是在哪里传递进来的呢？其实有两个地方，其中一个地方我们前面见过了，如下面这段代码：

```js
return function mergedDataFn () {
  return mergeData(
    typeof childVal === 'function' ? childVal.call(this, this) : childVal,
    typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
  )
}
```

注意这里的 `childVal.call(this, this)` 和 `parentVal.call(this, this)`，关键在于 `call(this, this)`，可以看到，第一个 `this` 指定了 `data` 函数的作用域，而第二个 `this` 就是传递给 `data` 函数的参数。

当然了仅仅在这里这么做是不够的，比如 `mergedDataFn` 前面的代码：

```js
if (!childVal) {
  return parentVal
}
if (!parentVal) {
  return childVal
}
```

在这段代码中，直接将 `parentVal` 或 `childVal` 返回了，我们知道这里的 `parentVal` 和 `childVal` 就是 `data` 函数，由于被直接返回，所以并没有指定其运行的作用域，且也没有传递当前实例作为参数，所以我们必然还是在其他地方做这些事情，而这个地方就是我们说的第二个地方，它在哪里呢？当然是初始化的时候，后面我们会讲到的，如果这里大家没有理解也不用担心。

## 生命周期钩子选项的合并策略

现在我们看完了 `strats.data` 策略函数，我们继续按照 `options.js` 文件的顺序看代码，接下来的一段代码如下：

```js
/**
 * Hooks and props are merged as arrays.
 */
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  return childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal
}

LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})
```

看上去，这段代码貌似是用来合并生命周期钩子的，事实上的确是这样，我们看看它是怎么做的，首先上面的代码由两部分组成：`mergeHook` 函数和一个 `forEach` 语句。我们先看下面的 `forEach` 语句：

```js
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})
```

使用 `forEach` 遍历 `LIFECYCLE_HOOKS` 常量，那说明这个常量应该是一个数组，我们根据 `options.js` 文件头部的引用关系可知 `LIFECYCLE_HOOKS` 常量来自于 `shared/constants.js` 文件，我们打开这个文件找到 `LIFECYCLE_HOOKS` 常量如下：

```js
export const LIFECYCLE_HOOKS = [
  'beforeCreate',
  'created',
  'beforeMount',
  'mounted',
  'beforeUpdate',
  'updated',
  'beforeDestroy',
  'destroyed',
  'activated',
  'deactivated',
  'errorCaptured'
]
```

可以发现 `LIFECYCLE_HOOKS` 常量实际上是由与生命周期钩子同名的字符串组成的数组。

所以现在再回头来看那段 `forEach` 语句可知，它的作用就是在 `strats` 策略对象上添加用来合并各个生命周期钩子选项的策略函数，并且这些生命周期钩子选项的策略函数相同：*都是 `mergeHook` 函数*。

那么 `mergeHook` 函数是怎样合并生命周期选项的呢？我们看看 `mergeHook` 函数的代码，如下：

```js
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  return childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal
}
```

整个函数体由三组*三目运算符*组成，有一点值得大家学习的就是这里写三目运算符的方式，是不是感觉非常地清晰易读？那么这段代码的分析我们同样使用与上面代码相同的格式来写：

```js
return (是否有 childVal，即判断组件的选项中是否有对应名字的生命周期钩子函数)
  ? 如果有 childVal 则判断是否有 parentVal
    ? 如果有 parentVal 则使用 concat 方法将二者合并为一个数组
    : 如果没有 parentVal 则判断 childVal 是不是一个数组
      ? 如果 childVal 是一个数组则直接返回
      : 否则将其作为数组的元素，然后返回数组
  : 如果没有 childVal 则直接返回 parentVal
```

如上就是对 `mergeHook` 函数的解读，我们可以发现，在经过 `mergeHook` 函数处理之后，组件选项的生命周期钩子函数被合并成一个数组。第一个三目运算符需要注意，它判断是否有 `childVal`，即组件的选项是否写了生命周期钩子函数，如果没有则直接返回了 `parentVal`，这里有个问题：`parentVal` 一定是数组吗？答案是：*如果有 `parentVal` 那么其一定是数组，如果没有 `parentVal` 那么 `strats[hooks]` 函数根本不会执行*。我们以 `created` 生命周期钩子函数为例：

如下代码：

```js
new Vue({
  created: function () {
    console.log('created')
  }
})
```

如果以这段代码为例，那么对于 `strats.created` 策略函数来讲(注意这里的 `strats.created` 就是 `mergeHooks`)，`childVal` 就是我们例子中的 `created` 选项，它是一个函数。`parentVal` 应该是 `Vue.options.created`，但 `Vue.options.created` 是不存在的，所以最终经过 `strats.created` 函数的处理将返回一个数组：

```js
options.created = [
  function () {
    console.log('created')
  }  
]
```

再看下面的例子：

```js
const Parent = Vue.extend({
  created: function () {
    console.log('parentVal')
  }
})

const Child = new Parent({
  created: function () {
    console.log('childVal')
  }
})
```

其中 `Child` 是使用 `new Parent` 生成的，所以对于 `Child` 来讲，`childVal` 是：

```js
created: function () {
  console.log('childVal')
}
```

而 `parentVal` 已经不是 `Vue.options.created` 了，而是 `Parent.options.created`，那么 `Parent.options.created` 是什么呢？它其实是通过 `Vue.extend` 函数内部的 `mergeOptions` 处理过的，所以它应该是这样的：

```js
Parent.options.created = [
  created: function () {
    console.log('parentVal')
  }
]
```

所以这个例子最终的结果就是既有 `childVal`，又有 `parentVal`，那么根据 `mergeHooks` 函数的逻辑：

```js
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  return childVal
    ? parentVal
      // 这里，合并且生成一个新数组
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal
}
```

关键在这句：`parentVal.concat(childVal)`，将 `parentVal` 和 `childVal` 合并成一个数组。所以最终结果如下：

```js
[
  created: function () {
    console.log('parentVal')
  },
  created: function () {
    console.log('childVal')
  }
]
```

另外我们注意第三个三目运算符：

```js
: Array.isArray(childVal)
  ? childVal
  : [childVal]
```

它判断了 `childVal` 是不是数组，这说明什么？说明了生命周期钩子是可以写成数组的，虽然 `Vue` 的文档里没有，不信你可以试试：

```js
new Vue({
  created: [
    function () {
      console.log('first')
    },
    function () {
      console.log('second')
    },
    function () {
      console.log('third')
    }
  ]
})
```

钩子函数将按顺序执行。

## 资源(assets)选项的合并策略

在 `Vue` 中 `directives`、`filters` 以及 `components` 被认为是资源，其实很好理解，指令、过滤器和组件都是可以作为第三方应用来提供的，比如你需要一个模拟滚动的组件，你当然可以选用超级强大的第三方组件 [scroll-flip-page](https://github.com/HcySunYang/scroll-flip-page)，所以这样看来 [scroll-flip-page](https://github.com/HcySunYang/scroll-flip-page) 就可以认为是资源，除了组件之外指令和过滤器也都是同样的道理。

而我们接下来要看的代码就是用来合并处理 `directives`、`filters` 以及 `components` 等资源选项的，看如下代码：

```js
/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  const res = Object.create(parentVal || null)
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    return extend(res, childVal)
  } else {
    return res
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})
```

与生命周期钩子的合并处理策略基本一致，以上代码段也分为两部分：`mergeAssets` 函数以及一个 `forEach` 语句。我们同样先看 `forEach` 语句，这个 `forEach` 循环用来遍历 `ASSET_TYPES` 常量，根据 `options.js` 文件头部的引用关系可知 `ASSET_TYPES` 常量来自于 `shared/constants.js` 文件，我们打开 `shared/constants.js` 文件找到 `ASSET_TYPES` 常量如下：

```js
export const ASSET_TYPES = [
  'component',
  'directive',
  'filter'
]
```

我们发现 `ASSET_TYPES` 其实是由与资源选项“同名”的三个字符串组成的数组，注意所谓的“同名”是带引号的，因为数组中的字符串与真正的资源选项名字相比要少一个字符 `s`。

| ASSET_TYPES   | 资源选项名字   |
| ------------- |:-------------:|
| component     | component`s`  |
| directive     | directive`s`  |
| filter        | filter`s`     |

所以我们再看一下那段 `forEach` 语句：

```js
ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})
```

我们发现在循环内部它有手动拼接上一个 `'s'`，所以最终的结果就是在 `strats` 策略对象上添加与资源选项名字相同的策略函数，用来分别合并处理三类资源。所以接下来我们就看看它是怎么处理的，`mergeAssets` 代码如下：

```js
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  const res = Object.create(parentVal || null)
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    return extend(res, childVal)
  } else {
    return res
  }
}
```

上面的代码本身逻辑很简单，首先以 `parentVal` 为原型创建对象 `res`，然后判断是否有 `childVal`，如果有的话使用 `extend` 函数将 `childVal` 上的属性混合到 `res` 对象上并返回。如果没有 `childVal` 则直接返回 `res`。

举个例子，大家知道任何组件的模板中我们都可以直接使用 `<transition/>` 组件或者 `<keep-alive/>` 等，但是我们并没有在我们自己的组件实例的 `components` 选项中显式地声明这些组件。那么这是怎么做到的呢？其实答案就在 `mergeAssets` 函数中。以下面的代码为例：

```js
var v = new Vue({
  el: '#app',
  components: {
    ChildComponent: ChildComponent
  }
})
```

上面的代码中，我们创建了一个 `Vue` 实例，并注册了一个子组件 `ChildComponent`，此时 `mergeAssets` 方法内的 `childVal` 就是例子中的 `components` 选项：

```js
components: {
  ChildComponent: ChildComponent
}
```

而 `parentVal` 就是 `Vue.options.components`，我们知道 `Vue.options` 如下：

```js
Vue.options = {
	components: {
	  KeepAlive,
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

所以 `Vue.options.components` 就应该是一个对象：

```js
{
  KeepAlive,
  Transition,
  TransitionGroup
}
```

也就是说 `parentVal` 就是如上包含三个内置组件的对象，所以经过如下这句话之后：

```js
const res = Object.create(parentVal || null)
```

你可以通过 `res.KeepAlive` 访问到 `KeepAlive` 对象，因为虽然 `res` 对象自身属性没有 `KeepAlive`，但是它的原型上有。

然后再经过 `return extend(res, childVal)` 这句话之后，`res` 变量将被添加 `ChildComponent` 属性，最终 `res` 如下：

```js
res = {
  ChildComponent
  // 原型
  __proto__: {
    KeepAlive,
    Transition,
    TransitionGroup
  }
}
```

所以这就是为什么我们不用显式地注册组件就能够使用一些内置组件的原因，同时这也是内置组件的实现方式，通过 `Vue.extend` 创建出来的子类也是一样的道理，一层一层地通过原型进行组件的搜索。

最后说一下 `mergeAssets` 函数中的这句话：

```js
process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
```

在非生产环境下，会调用 `assertObjectType` 函数，这个函数其实是用来检测 `childVal` 是不是一个纯对象的，如果不是纯对象会给你一个警告，其源码很简单，如下：

```js
function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}
```

就是使用 `isPlainObject` 进行判断。上面我们都在以 `components` 进行讲解，对于指令(`directives`)和过滤器(`filters`)也是一样的，因为他们都是用 `mergeAssets` 进行合并处理。

## 选项 watch 的合并策略

接下来我们要看的代码就是这一段了：

```js
/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  if (!childVal) return Object.create(parentVal || null)
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = {}
  extend(ret, parentVal)
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  return ret
}
```

这一段代码的作用是在 `strats` 策略对象上添加 `watch` 策略函数。所以 `strats.watch` 策略函数应该是合并处理 `watch` 选项的。我们先看函数体开头的两句代码：

```js
// work around Firefox's Object.prototype.watch...
if (parentVal === nativeWatch) parentVal = undefined
if (childVal === nativeWatch) childVal = undefined
```

其中 `nativeWatch` 来自于 `core/util/env.js` 文件，大家可以在 [core/util 目录下的工具方法全解](../appendix/core-util.md) 中查看其作用。在 `Firefox` 浏览器中 `Object.prototype` 拥有原生的 `watch` 函数，所以即便一个普通的对象你没有定义 `watch` 属性，但是依然可以通过原型链访问到原生的 `watch` 属性，这就会给 `Vue` 在处理选项的时候造成迷惑，因为 `Vue` 也提供了一个叫做 `watch` 的选项，即使你的组件选项中没有写 `watch` 选项，但是 `Vue` 通过原型访问到了原生的 `watch`。这不是我们想要的，所以上面两句代码的目的是一个变通方案，当发现组件选项是浏览器原生的 `watch` 时，那说明用户并没有提供 `Vue` 的 `watch` 选项，直接重置为 `undefined`。

然后是这句代码：

```js
if (!childVal) return Object.create(parentVal || null)
```

检测了是否有 `childVal`，即组件选项是否有 `watch` 选项，如果没有的话，直接以 `parentVal` 为原型创建对象并返回(如果有 `parentVal` 的话)。

如果组件选项中有 `watch` 选项，即 `childVal` 存在，则代码继续执行，接下来将执行这段代码：

```js
if (process.env.NODE_ENV !== 'production') {
  assertObjectType(key, childVal, vm)
}
if (!parentVal) return childVal
```

由于此时 `childVal` 存在，所以在非生产环境下使用 `assertObjectType` 函数对 `childVal` 进行类型检测，检测其是否是一个纯对象，我们知道 `Vue` 的 `watch` 选项需要是一个纯对象。接着判断是否有 `parentVal`，如果没有的话则直接返回 `childVal`，即直接使用组件选项的 `watch`。

如果存在 `parentVal`，那么代码继续执行，此时 `parentVal` 以及 `childVal` 都将存在，那么就需要做合并处理了，也就是下面要执行的代码：

```js
// 定义 ret 常量，其值为一个对象
const ret = {}
// 将 parentVal 的属性混合到 ret 中，后面处理的都将是 ret 对象，最后返回的也是 ret 对象
extend(ret, parentVal)
// 遍历 childVal
for (const key in childVal) {
  // 由于遍历的是 childVal，所以 key 是子选项的 key，父选项中未必能获取到值，所以 parent 未必有值
  let parent = ret[key]
  // child 是肯定有值的，因为遍历的就是 childVal 本身
  const child = childVal[key]
  // 这个 if 分支的作用就是如果 parent 存在，就将其转为数组
  if (parent && !Array.isArray(parent)) {
    parent = [parent]
  }
  ret[key] = parent
    // 最后，如果 parent 存在，此时的 parent 应该已经被转为数组了，所以直接将 child concat 进去
    ? parent.concat(child)
    // 如果 parent 不存在，直接将 child 转为数组返回
    : Array.isArray(child) ? child : [child]
}
// 最后返回新的 ret 对象
return ret
```

上面的代码段中写了很详细的注释。首先定义了 `ret` 常量，最后返回的也是 `ret` 常量，所以中间的代码是在充实 `ret` 常量。之后使用 `extend` 函数将 `parentVal` 的属性混合到 `ret` 中。然后开始一个 `for in` 循环遍历 `childVal`，这个循环的目的是：*检测子选项中的值是否也在父选项中，如果在的话将父子选项合并到一个数组，否则直接把子选项变成一个数组返回*。

举个例子：

```js
// 创建子类
const Sub = Vue.extend({
  // 检测 test 的变化
  watch: {
    test: function () {
      console.log('extend: test change')
    }
  }
})

// 使用子类创建实例
const v = new Sub({
  el: '#app',
  data: {
    test: 1
  },
  // 检测 test 的变化
  watch: {
    test: function () {
      console.log('instance: test change')
    }
  }
})

// 修改 test 的值
v.test = 2
```

上面的代码中，当我们修改 `v.test` 的值时，两个观察 `test` 变化的函数都将被执行。

我们使用子类 `Sub` 创建了实例 `v`，对于实例 `v` 来讲，其 `childVal` 就是组件选项的 `watch`：

```js
watch: {
  test: function () {
    console.log('instance: test change')
  }
}
```

而其 `parentVal` 就是 `Sub.options`，实际上就是：

```js
watch: {
  test: function () {
    console.log('extend: test change')
  }
}
```

最终这两个 `watch` 选项将被合并为一个数组：

```js
watch: {
  test: [
    function () {
      console.log('extend: test change')
    },
    function () {
      console.log('instance: test change')
    }
  ]
}
```

我们可以通过打印实例的 `$options` 属性来确认这一点：

```js
console.log(v.$options)
```

如下图：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-10-26-112916.jpg)

可以发现 `watch.test` 变成了数组，但是 `watch.test` 并不一定总是数组，只有父选项(`parentVal`)也存在时它才是数组，如下：

```js
// 创建实例
const v = new Vue({
  el: '#app',
  data: {
    test: 1
  },
  // 检测 test 的变化
  watch: {
    test: function () {
      console.log('instance: test change')
    }
  }
})

// 修改 test 的值
v.test = 2
```

我们直接使用 `Vue` 创建实例，这个时候对于实例 `v` 来说，父选项是 `Vue.options`，由于 `Vue.options` 并没有 `watch` 选项，所以逻辑将直接在 `strats.watch` 函数的这句话中返回：

```js
if (!parentVal) return childVal
```

没有 `parentVal` 即父选项中没有 `watch` 选项，则直接返回 `childVal`，也就是直接返回了子选项的 `watch` 选项，如就是例子中写的对象：

```js
{
  test: function () {
    console.log('instance: test change')
  }
}
```

所以此时 `test` 字段就不再是数组了，而就是一个函数，同样可以通过打印实例的 `$options` 选项证明：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-10-26-113858.jpg)

所以大家应该知道：*被合并处理后的 `watch` 选项下的每个键值，有可能是一个数组，也有可能是一个函数*。

## 选项 props、methods、inject、computed 的合并策略

接下来我们要看的一段代码如下：

```js
/**
 * Other object hashes.
 */
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = Object.create(null)
  extend(ret, parentVal)
  if (childVal) extend(ret, childVal)
  return ret
}
```

这段代码的作用是在 `strats` 策略对象上添加 `props`、`methods`、`inject` 以及 `computed` 策略函数，顾名思义这些策略函数是分别用来合并处理同名选项的，并且所使用的策略相同。

对于 `props`、`methods`、`inject` 以及 `computed` 这四个选项有一个共同点，就是它们的结构都是纯对象，虽然我们在书写 `props` 或者 `inject` 选项的时候可能是一个数组，但是在 [Vue的思路之选项的规范化](./4vue-normalize.md) 一节中我们知道，`Vue` 内部都将其规范化为了一个对象。所以我们看看 `Vue` 是如何处理这些对象散列的。

策略函数内容如下：

```js
// 如果存在 childVal，那么在非生产环境下要检查 childVal 的类型
if (childVal && process.env.NODE_ENV !== 'production') {
  assertObjectType(key, childVal, vm)
}
// parentVal 不存在的情况下直接返回 childVal
if (!parentVal) return childVal
// 如果 parentVal 存在，则创建 ret 对象，然后分别将 parentVal 和 childVal 的属性混合到 ret 中，注意：由于 childVal 将覆盖 parentVal 的同名属性
const ret = Object.create(null)
extend(ret, parentVal)
if (childVal) extend(ret, childVal)
// 最后返回 ret 对象。
return ret
```

首先，会检测 `childVal` 是否存在，即子选项是否有相关的属性，如果有的话在非生产环境下需要使用 `assertObjectType` 检测其类型，保证其类型是纯对象。然后会判断 `parentVal` 是否存在，不存在的话直接返回子选项。

如果 `parentVal` 存在，则使用 `extend` 方法将其属性混合到新对象 `ret` 中，如果 `childVal` 也存在的话，那么同样会再使用 `extend` 函数将其属性混合到 `ret` 中，所以如果父子选项中有相同的键，那么子选项会把父选项覆盖掉。

以上就是 `props`、`methods`、`inject` 以及 `computed` 这四个属性的通用合并策略。

## 选项 provide 的合并策略

最后一个选项的合并策略，就是 `provide` 选项的合并策略，只有一句代码，如下：

```js
strats.provide = mergeDataOrFn
```

也就是说 `provide` 选项的合并策略与 `data` 选项的合并策略相同，都是使用 `mergeDataOrFn` 函数。

## 选项处理小结

现在我们了解了 `Vue` 中是如何合并处理选项的，接下来我们稍微做一个总结：

* 对于 `el`、`propsData` 选项使用默认的合并策略 `defaultStrat`。
* 对于 `data` 选项，使用 `mergeDataOrFn` 函数进行处理，最终结果是 `data` 选项将变成一个函数，且该函数的执行结果为真正的数据对象。
* 对于 `生命周期钩子` 选项，将合并成数组，使得父子选项中的钩子函数都能够被执行
* 对于 `directives`、`filters` 以及 `components` 等资源选项，父子选项将以原型链的形式被处理，正是因为这样我们才能够在任何地方都使用内置组件、指令等。
* 对于 `watch` 选项的合并处理，类似于生命周期钩子，如果父子选项都有相同的观测字段，将被合并为数组，这样观察者都将被执行。
* 对于 `props`、`methods`、`inject`、`computed` 选项，父选项始终可用，但是子选项会覆盖同名的父选项字段。
* 对于 `provide` 选项，其合并策略使用与 `data` 选项相同的 `mergeDataOrFn` 函数。
* 最后，以上没有提及到的选项都将使默认选项 `defaultStrat`。
* 最最后，默认合并策略函数 `defaultStrat` 的策略是：*只要子选项不是 `undefined` 就使用子选项，否则使用父选项*。

至此，我们大概介绍完了 `Vue` 对选项的处理，但留心的同学一定注意到了，`options.js` 文件的代码我们都基本逐行分析，唯独剩下一个函数我们始终没有提到，它就是 `resolveAsset` 函数。这个函数我们暂且不在这里讲，后面随着我们的深入，自然会再次碰到它，到那个时候应该是讲它的最好时机。

## 再看 mixins 和 extends

在 [Vue选项的规范化](./4vue-normalize.md) 一节中，我们讲到了 `mergeOptions` 函数中的如下这段代码：

```js
const extendsFrom = child.extends
if (extendsFrom) {
  parent = mergeOptions(parent, extendsFrom, vm)
}
if (child.mixins) {
  for (let i = 0, l = child.mixins.length; i < l; i++) {
    parent = mergeOptions(parent, child.mixins[i], vm)
  }
}
```

当时候我们并没有深入讲解，因为当时我们还不了解 `mergeOptions` 函数的作用，但是现在我们可以回头来看一下这段代码了。

我们知道 `mixins` 在 `Vue` 中用于解决代码复用的问题，比如混入 `created` 生命周期钩子，用于打印一句话：

```js
const consoleMixin = {
  created () {
    console.log('created:mixins')
  }
}

new Vue ({
  mixins: [consoleMixin],
  created () {
    console.log('created:instance')
  }
})
```

运行以上代码，将打印两句话：

```js
// created:mixins
// created:instance
```

这是因为 `mergeOptions` 函数在处理 `mixins` 选项的时候递归调用了 `mergeOptions` 函数将 `mixins` 合并到了 `parent` 中，并将合并后生成的新对象作为新的 `parent`：

```js
if (child.mixins) {
  for (let i = 0, l = child.mixins.length; i < l; i++) {
    parent = mergeOptions(parent, child.mixins[i], vm)
  }
}
```

上例中我们只涉及到 `created` 生命周期钩子的合并，所以会使用生命周期钩子的合并策略函数进行处理，现在我们已经知道 `mergeOptions` 会把生命周期选项合并为一个数组，所以所有的生命周期钩子都会被执行。那么不仅仅是生命周期钩子，任何写在 `mixins` 中的选项，都会使用 `mergeOptions` 中相应的合并策略进行处理，这就是 `mixins` 的实现方式。

对于 `extends` 选项，与 `mixins` 相同，甚至由于 `extends` 选项只能是一个对象，而不能是数组，反而要比 `mixins` 的实现更为简单，连遍历都不需要。
