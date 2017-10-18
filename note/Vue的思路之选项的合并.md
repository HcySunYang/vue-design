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

其中 `hasOwn` 函数来自于 `shared/util.js` 文件，可以再 [shared/util.js 文件工具方法全解](/note/附录/shared-util) 中查看其详解，其作用是用来判断一个属性是否是对象自身的属性(不包括原型上的)。所以这个判断语句的意思是，如果 `child` 对象的键也在 `parent` 上出现，那么就不要再调用 `mergeField` 的了，因为在上一个 `for in` 循环中已经调用过了，这就避免了重复调用。

总之这两个 `for in` 循环的目的就是使用在 `parent` 或者 `child` 对象中出现的 `key(即选项的名字)` 作为参数调用 `mergeField` 函数，真正合并的操作实际在 `mergeField` 函数中。

`mergeField` 代码如下：

```js
function mergeField (key) {
  const strat = strats[key] || defaultStrat
  options[key] = strat(parent[key], child[key], vm, key)
}
```

`mergeField` 函数只有两句代码，第一句代码定义了一个常量 `start`，它的值是通过指定的 `key` 访问 `strats` 对象得到的，而当访问的属性不存在时，则使用 `defaultStrat` 作为值。

这里我们就要明确了，`starts` 是什么？想弄明白这个问题，我们需要从整体角度去看一下 `options.js` 文件，首先看文件顶部的一堆 `import` 语句下的第一句代码：

```js
/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
const strats = config.optionMergeStrategies
```

这句代码就定义了 `strats` 变量，且它是一个常量，这个常量的值为 `config.optionMergeStrategies`，这个 `config` 对象是全局配置对象，来自于 `core/config.js` 文件，此时 `config.optionMergeStrategies` 还只是一个空的对象。注意一下这里的一段注释：*选项覆盖策略是处理如何将父选项值和子选项值合并到最终值的函数*。也就是说 `config.optionMergeStrategies` 是一个合并选项的策略对象，这个对象下包含很多函数，这些函数就可以认为是合并特定选项的策略。这样不同的选项使用不同的合并策略，如果你使用自定义选项，那么你也可以自定义该选项的合并策略，只需要在 `Vue.config.optionMergeStrategies` 对象上添加与自定义选项同名的函数就行。而这就是 `Vue` 文档中提过的全局配置：[optionMergeStrategies](https://vuejs.org/v2/api/#optionMergeStrategies)。

##### 选项 el、propsData 的合并策略

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

非生产环境下在 `strats` 策略对象上添加两个策略(两个属性)分别是 `el` 和 `propsData`，且这两个属性的值是一个函数。通过这两个属性的名字可知，这两个策略函数是用来合并 `el` 选项和 `propsData` 选项的。与其说“合并”不如说“处理”，因为其本质上并没有做什么合并工作。那么我们看看这个策略函数的具体内容，了解一下它是怎么处理的 `el` 和 `propsData` 选项的。

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

所以我们可以理解为：策略函数中的 `vm` 来自于 `mergeOptions` 函数的第三个参数。所以当调用 `mergeOptions` 函数且不传递第三个参数的时候，那么在策略函数中就拿不到 `vm` 参数。所以我们可以猜测到一件事，那就是 `mergeOptions` 函数除了在 `_init` 方法中被调用之外，还在其他地方被调用，且没有传递第三个参数。那么到底是在哪里被调用的呢？这里可以先明确的告诉大家，就在 `Vue.extend` 方法中被调用的，大家可以打开 `core/global-api/extend.js` 文件找到 `Vue.extend` 方法，其中有这么一段代码：

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

实际上 `defaultStrat` 函数就如同它的名字一样，它是一个默认的策略，当一个选项不需要特殊处理的时候就是用默认的合并策略，它的逻辑很简单：只要子选项不是 `undefined` 那么就是用子选项，否则使用父选项。

但是大家还要注意一点，`strats.el` 和 `strats.propsData` 这两个策略函数是只有在非生产环境才有的，在生产环境下访问这两个函数将会得到 `undefined`，那这个时候 `mergeField` 函数的第一句代码就起作用了：

```js
// 当一个选项没有对应的策略函数时，使用默认策略
const strat = strats[key] || defaultStrat
```

所以在生产环境将直接使用默认的策略函数 `defaultStrat` 来处理 `el` 和 `propsData` 这两个选项。

##### 选项 data 的合并策略

下面我们接着按照顺序看 `options.js` 文件的代码，接下来定义了两个函数：`mergeData` 以及 `mergeDataOrFn`。我们暂且不关注这两个函数的作用，我们继续看下面的代码，接下来的代码如下：

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
    return mergeDataOrFn.call(this, parentVal, childVal)
  }

  return mergeDataOrFn(parentVal, childVal, vm)
}
```

这段代码的作用是在 `strats` 策略对象上添加 `data` 策略函数，用来合并 `data` 选项的。我们看看这个策略函数的内容，首先是一个判断分支：

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
return mergeDataOrFn.call(this, parentVal, childVal)
```

首先判断是否传递了子组件选项(`childVal`)，并且检测 `childVla` 的类型是不是 `function`，如果 `childVla` 的类型不是 `function` 则会给你一个警告，也就是说 `childVla` 应该是一个函数，如果不是函数会提示你 `data` 的类型必须是一个函数，这就是我们知道的：*子组件中的 `data` 必须是一个返回对象的函数*。如果不是函数，除了给你一段警告之外，会直接返回 `parentVal`。

如果 `childVal` 是函数类型，那说明满足了子组件的 `data` 选项需要是一个函数的要求，那么就直接返回 `mergeDataOrFn` 函数的执行结果：

```js
return mergeDataOrFn.call(this, parentVal, childVal)
```

上面的情况是在 `strats.data` 策略函数拿不到 `vm` 参数时的情况，如果拿到了 `vm` 参数，那么说明处理的选项不是子组件的选项，而是正常使用 `new` 操作符创建实例时的选项，这个时候则直接返回 `mergeDataOrFn` 的函数执行结果，但是会多透传一个参数 `vm`：

```js
return mergeDataOrFn(parentVal, childVal, vm)
```

通过上面的分析我们得知一件事，即 `strats.data` 策略函数无论合并处理的是子组件的选项还是非子组件的选项，其最终都是调用 `mergeDataOrFn` 函数进行处理的，并且以 `mergeDataOrFn` 函数的返回值作为策略函数的最终返回值。有一点不同的是在处理非子组件选项的时候多传递了一个参数 `vm`。所以接下来我们要做的事儿就是看看 `mergeDataOrFn` 的代码，看一看它的返回值是什么，因为它的返回值就等价于 `strats.data` 策略函数的返回值。`mergeDataOrFn` 函数的源码如下：

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
        typeof childVal === 'function' ? childVal.call(this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this) : parentVal
      )
    }
  } else if (parentVal || childVal) {
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm)
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

这个函数整体由 `if` 判断分支语句块组成，首先对 `vm` 进行判断，我们知道无论是子组件选项还是非子组件选项 `strats.data` 策略函数都是通过调用 `mergeDataOrFn` 完成的，且处理非子组件选项的时候要比处理子组件选项时多传递了一个参数 `vm`，这就使得 `mergeDataOrFn` 也能通过是否有 `vm` 来区分处理的是不是子组件选项。如果没有拿到 `vm` 参数的话，那说明处理的是子组件选项奶奶个，程序会走 `if` 分支，实际上我们可以看到这里有段注释：

```js
// in a Vue.extend merge, both should be functions
```

这再次说明了，当拿不到 `vm` 这个参数的时候，合并操作是在 `Vue.extend` 中进行的，也就是在处理子组件的选项。此时 `childVal` 和 `parentVal` 都应该是函数。那么这里真的能保证 `childVal` 和 `parentVal` 都是函数了吗？其实是可以的，我们后面会讲到。

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

我们使用 `Vue.extend` 函数创建子类的时候传递的子组件选项是一个空对象，即没有 `data` 选项，那么此时 `parentVal` 实际上就是 `Vue.options`，由于 `Vue.options` 上也没有 `data` 这个属性，所以压根就不会执行 `strats.data` 策略函数，也就更不会执行 `mergeDataOrFn` 函数。那么什么时候才会出现 `childVal` 不存在但是 `parentVal` 存在的情况呢？看下面的代码：

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

由于 `childVal` 和 `parentVal` 必定会有其一，否则便不会执行 `strats.data` 策略函数，所以上面判断的意思就是：*如果没有子选项则使用父选项，没有父选项就直接使用子选项*，如果父子选项同时存在，则代码继续进行，将执行下面的代码：

```js
// when parentVal & childVal are both present,
// we need to return a function that returns the
// merged result of both functions... no need to
// check if parentVal is a function here because
// it has to be a function to pass previous merges.
return function mergedDataFn () {
  return mergeData(
    typeof childVal === 'function' ? childVal.call(this) : childVal,
    typeof parentVal === 'function' ? parentVal.call(this) : parentVal
  )
}
```

也就是说，当父子选项同时存在，那么就返回一个函数 `mergedDataFn`，注意：此时代码运行就结束了，因为函数已经返回了(`return`)，至于 `mergedDataFn` 函数里面又返回了 `mergeData` 函数的执行结果这句代码目前还没有执行。

以上就是 `strats.data` 策略函数在处理子组件的 `data` 选项时所做的事，我们可以发现 `mergeDataOrFn` 函数在处理子组件选项时返回的总是一个函数，这也就间接导致 `strats.data` 策略函数在处理子组件选项时返回的也总是一个函数。

说完了处理子选项的情况，我们再看看处理非子选项的情况，也就是使用 `new` 操作符创建实例时的情况，此时程序直接执行 `strats.data` 函数的最后一句代码：

```js
return mergeDataOrFn(parentVal, childVal, vm)
```

我们发现同样是调用 `mergeDataOrFn` 函数，只不过这个时候传递了 `vm` 参数，也就是说这将会执行 `mergeDataOrFn` 的 `else if` 分支：

```js
if (!vm) {
  ...
} else if (parentVal || childVal) {
  return function mergedInstanceDataFn () {
    // instance merge
    const instanceData = typeof childVal === 'function'
      ? childVal.call(vm)
      : childVal
    const defaultData = typeof parentVal === 'function'
      ? parentVal.call(vm)
      : parentVal
    if (instanceData) {
      return mergeData(instanceData, defaultData)
    } else {
      return defaultData
    }
  }
}
```

`else if` 分支判断了 `parentVal` 和 `childVal` 二者有其一即可，实际上这个判断是多余的，这二者必然会有其一否则 `strats.data` 策略函数都不会被执行，就更不会执行 `mergeDataOrFn` 这个函数啦。总之，如果走了 `else if` 分支的话那么就直接返回 `mergedInstanceDataFn` 函数，注意此时的 `mergedInstanceDataFn` 函数同样还没有执行，它是 `mergeDataOrFn` 函数的返回值，所以这再次说明了一个问题：*`mergeDataOrFn` 函数永远返回一个函数*。













