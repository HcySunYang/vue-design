# Vue 实例的设计

这里是对 `Vue` 实例的整理，有利于我们直观地观察 `Vue`

```js
// Vue.prototype._init
vm._uid = uid++     // 每个Vue实例都拥有一个唯一的 id
vm._isVue = true    // 这个表示用于避免Vue实例对象被观测(observed)
vm.$options         // 当前 Vue 实例的初始化选项，注意：这是经过 mergeOptions() 后的
vm._renderProxy = vm    // 渲染函数作用域代理
vm._self = vm       // 实例本身

// initLifecycle(vm)    src/core/instance/lifecycle.js **************************************************
vm.$parent = parent
vm.$root = parent ? parent.$root : vm

vm.$children = []
vm.$refs = {}

vm._watcher = null
vm._inactive = null
vm._directInactive = false
vm._isMounted = false
vm._isDestroyed = false
vm._isBeingDestroyed = false

// initEvents(vm)   src/core/instance/events.js **************************************************
vm._events = Object.create(null)
vm._hasHookEvent = false

// initRender(vm)   src/core/instance/render.js **************************************************
vm._vnode = null // the root of the child tree
vm._staticTrees = null // v-once cached trees

vm.$vnode
vm.$slots
vm.$scopedSlots

vm._c
vm.$createElement

vm.$attrs
vm.$listeners

// initState(vm)   src/core/instance/state.js **************************************************
vm._watchers = []
vm._data

// mountComponent()   src/core/instance/lifecycle.js
vm.$el

// initComputed()   src/core/instance/state.js
vm._computedWatchers = Object.create(null)

// initProps()    src/core/instance/state.js
vm._props = {}

// initProvide()    src/core/instance/inject.js
vm._provided
```