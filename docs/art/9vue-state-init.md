# 其他重要选项的初始化

## props 的初始化及实现

`Vue` 的 `props` 初始化主要逻辑为属性的校验和属性的赋值。

我们来看一下它的源码：

```js
function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  const keys = vm.$options._propKeys = []
  
  ...
  
  for (const key in propsOptions) {
    keys.push(key)
 
    //站位: props 校验和赋值

    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  
  ...
}
```

*这里隐去了校验和初始化的细节，留在后面讲解。*

 `propsData` 是 `Vue` 组件中 `prop` 属性规范化后的结果，用来定义组件 `props` 的**原型**，而 `vm._props` 则是用来存放组件具体的 `props` **值**。整体的逻辑就是循环属性选项的每一项，检验和取值，再讲其访问代理到组件实例上，使我们可以通过 `this.a` 直接访问特定属性的值。`const keys = vm.$options._propKeys = []` 这行代码在当前上下文中没有具体作用，它是为后续父组件更新子组件时遍历 `props` 做的优化，因为迭代一个数组比枚举对象的 `key` 要快。

我们重点来看校验和初始化：

```js
// 是否根组件
if (!isRoot) {
  toggleObserving(false)
}
for (const key in propsOptions) {
  // validateProp 会校验属性的值类型是否满足要求，并返回提供的值或缺省值。
  const value = validateProp(key, propsOptions, propsData, vm)
  if (process.env.NODE_ENV !== 'production') {
    const hyphenatedKey = hyphenate(key)
    if (isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)) {
      warn(
        `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
        vm
      )
    }
    defineReactive(props, key, value, () => {
      if (!isRoot && !isUpdatingChildComponent) {
        warn(
          `Avoid mutating a prop directly since the value will be ` +
          `overwritten whenever the parent component re-renders. ` +
          `Instead, use a data or computed property based on the prop's ` +
          `value. Prop being mutated: "${key}"`,
          vm
        )
      }
    })
  } else {
    defineReactive(props, key, value)
  }
}
toggleObserving(true)
```

在数据响应章节中我们知道 `Vue` 通过 `observe` 方法创建响应式数据，`toggleObserving` 通过设置**可观察标记**可以控制 `observe` 方法开启或关闭。根据是否为root组件，启用或禁用对所有 `props` 的值(即代码片段中的 `value` ) 的响应式功能，这里要强调一下，禁用的是每个 `props` 的*值*，其*本身*还是响应式的。
让我们通过例子来理解根组件与其他组件的区别。

首先定义一个组件：
```js
const Comp = Vue.extend({
  name: 'Foo',
  props: ['msg', 'deepMsg'],
  render(h) {
    return h('div', [this.msg, '&', this.deepMsg.msg]);
  },
});
```

### 作为根组件
```js
vm = new Comp({
  el: '#app',
  propsData: {
    msg: 'hello',
    deepMsg: {
      msg: 'world',
    },
  },
});

vm.msg = 'hello,'; // 触发 render
vm.deepMsg.msg = 'vue design'; // 触发 render
```

`msg` 和 `deepMsg` 作为组件的属性，本身是响应式的，所以改变它们的值会触发 `render`。又因为是根组件，所以其属性值 `{ msg: 'world' }` 也是响应式的，我们改变 `deepMsg.msg` 的值也会触发 `render`。

### 作为子组件
```js
vm = new Vue({
  el: '#app',
  render(h) {
    return h(Comp, {
      ref: 'child',
      props: {
        msg: 'hello',
        deepMsg: {
          msg: 'deep hello',
        },
      },
    });
  },
});

vm.msg = 'hello,'; // 触发 render，console 会显示 warn 信息
vm.deepMsg.msg = 'vue design'; // 什么都不会触发
```

`Vue` 组件的 `props` 值应该只由 `Vue` 内部在特定阶段（通过代码可以得知 `Vue` 此时会设置 `isUpdatingChildComponent` 为 `true` 来压制警告）更新，所以在开发环境 `Vue` 会拦截不期待的用户 `set` 操作, 并发送相应的警告。

`Vue` 对根组件做特殊处理是由于组件的 `props` 值只能由父组件为其更新，而根组件没有父组件，所以允许通过实例直接更新值。

## methods 选项的初始化及实现
方法的初始化主要涉及一些检查和调用上下文的绑定（使方法内 `this` 指向当前组件实例）。我们通过注释过的代码来理解这一过程。

```js
function initMethods (vm: Component, methods: Object) {
  // 获取 prop 配置
  const props = vm.$options.props

  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      // 警告存在却未赋值的方法
      if (methods[key] == null) {
        warn(
          `Method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      // 警告与 props 中的属性冲突
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }

      // 警告与 vue 的保留属性冲突
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }

    // 将方法中的 this 绑定为 vm
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
  }
}
```

## provide 选项的初始化及实现
源码：
```js
export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}
```

`provide` 的初始化非常简单，判断选项类型是函数则取其返回值，否则直接将其值存储到 `vm._provided` 中。

## inject 选项的初始化及实现
`inject` 的初始化可以分为两部分，解析值，代理值。

### 解析值
`Vue` 通过 `resolveInject` 函数来解析需要被注入的值，那具体是怎么做的呢？`Vue` 在实例化组件时，会通过 `$parent` 维持其父组件的引用，`$children` 来存放所有子组件实例。在上一节中，我们知道 `provide` 选项会被存储在组件实例的 `_provided`属性中，`resolveInject` 会从当前实例沿着 `$parent` 属性向上查找，直到找到满足条件的 `_provided` 对象，从其中取到所需的值。具体的代码如下：

```js
// key 为被注入值挂载到当前实例下的名称
const key = keys[i]

// 从注入选项中获取提供注入的属性
const provideKey = inject[key].from

// source 设置为当前实例
let source = vm

while (source) {
  // 满足条件，存储结果并结束查找
  if (source._provided && hasOwn(source._provided, provideKey)) {
    result[key] = source._provided[provideKey]
    break
  }
  // 沿着 $parent 向上查找
  source = source.$parent
}
```

### 代理值
注入后的值可以通过实例直接访问，这已经不是 `Vue` 第一次这么做了，在 `data`, `props` 等选择初始化中也是这么做的，此处的代码大同小异:

```js
toggleObserving(false)
Object.keys(result).forEach(key => {
  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, key, result[key], () => {
      warn(
        `Avoid mutating an injected value directly since the changes will be ` +
        `overwritten whenever the provided component re-renders. ` +
        `injection being mutated: "${key}"`,
        vm
      )
    })
  } else {
    defineReactive(vm, key, result[key])
  }
})
toggleObserving(true)
```

出于设计意图，通过 `inject` 选项注入的值不会被进行响应式转换，对其直接赋值是不期待的，`Vue` 会为这些 `set` 操作发送警告。另外我们要知道，`inject` 的值只会在初始时被解析并注入，所以后续是无法通过修改 `provide` 来通知 `inject` 更新的。我们可以直接提供一个**响应式数据**，这样相应的 `inject` 组件会在注入的*响应式数据*发送变化时触发重新渲染。
