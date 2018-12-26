# Vue 的编译器初探

至此，我们对 `Vue.prototype._init` 方法所做的初始化工作基本全部讲解到了，在讲解渲染函数的观察者时，我们也讲解了渲染函数是如何生成的以及渲染函数的作用。接下来我们将开启新的篇章，即看一看渲染函数是如何通过编译器生成的。我们打开 `src/platforms/web/entry-runtime-with-compiler.js` 文件，找到 `$mount` 方法，该方法中有这样一段代码：

```js
const { render, staticRenderFns } = compileToFunctions(template, {
  shouldDecodeNewlines,
  shouldDecodeNewlinesForHref,
  delimiters: options.delimiters,
  comments: options.comments
}, this)
options.render = render
options.staticRenderFns = staticRenderFns
```

我们知道渲染函数 `render` 就是通过 `compileToFunctions` 函数生成的，传递给该函数的第一个参数就是模板字符串，`compileToFunctions` 函数会把模板字符串编译为渲染函数，本章的内容将以 `compileToFunctions` 函数为切入点研究编译器。

## 寻找 compileToFunctions

接下来我们的主要工作，就是搞清楚 `compileToFunctions` 函数，根据 `platforms/web/entry-runtime-with-compiler.js` 文件头部的 `import` 引用关系可知，`compileToFunctions` 函数来自于当前目录下的 `./compiler/index.js` 文件，打开 `./compiler/index.js` 文件，可以发现这样一句代码：

```js
const { compile, compileToFunctions } = createCompiler(baseOptions)
```

上面的代码中 `compileToFunctions` 函数是从 `createCompiler` 函数的返回值中解构出来的。

由此可知 `compileToFunctions` 函数是通过以 `baseOptions` 为参数调用 `createCompiler` 函数创建出来的。`createCompiler` 函数顾名思义他的作用就是创建一个编译器，那么到底是怎么创建出来的呢？想搞清楚这个问题我们就需要具体看一下 `createCompiler` 函数了，根据引用关系可知 `createCompiler` 函数来自于 `compiler/index.js` 文件，注意这里的 `compiler/index.js` 可不是 `./compiler/index.js`，这里的 `compiler/index.js` 指的是 `src/compiler/index.js` 文件，我们打开这个文件看一下：

```js
/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options)
  optimize(ast, options)
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

以上是 `src/compiler/index.js` 文件的全部代码，可知这个文件唯一的作用就是导出一个函数，即 `createCompiler` 函数，该函数就是用来创建编译器的，或者我们可以称该函数为 `编译器的创建者`。那么 `createCompiler` 函数的内容是什么呢？仔细查看代码，我们发现 `createCompiler` 函数也是通过一个函数创建出来的，这个函数就是 `createCompilerCreator`，并且传递了 `baseCompile` 函数作为参数。也就说 `createCompiler` 函数的内容是 `createCompilerCreator` 函数的返回值，其实这么看的话我们倒是可以把 `createCompilerCreator` 函数称作 `'编译器创建者' 的创建者`，我们整理一下思路如下图：

![](http://ovjvjtt4l.bkt.clouddn.com/2017-11-09-073724.jpg)

接下来我们需要看一看 `'编译器创建者' 的 创建者` 是怎么创建出编译器创建者的，也就是 `createCompilerCreator` 函数的内容，该函数来自于 `create-compiler.js` 文件，打开该文件找到 `createCompilerCreator` 函数如下：

```js
/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {
    // ...
  }
}
```

以上代码是 `create-compiler.js` 文件的全部内容，只不过做了简化，去掉了 `createCompiler` 函数的函数体。我们可以发现 `createCompilerCreator` 函数直接返回了 `createCompiler` 函数，而这个函数就是我们所说的 `编译器的创建者`。那么传递给 `createCompilerCreator` 函数的参数 `baseCompile` 在哪里调用的呢？肯定是在 `createCompiler` 函数体内调用的。

现在我们再回到 `src/compiler/index.js` 文件，再次查看如下代码：

```js
// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options)
  optimize(ast, options)
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

我们已经知道一件事，那就是这里的 `createCompiler` 就是 `createCompilerCreator` 函数的返回值，也就是 `src/compiler/create-compiler.js` 文件内的 `createCompiler` 函数：

```js
export function createCompilerCreator (baseCompile: Function): Function {
  // 也就是这个 createCompiler 函数
  return function createCompiler (baseOptions: CompilerOptions) {
    // ...
  }
}
```

那么现在再看 `platforms/web/compiler/index.js` 文件下的这句代码：

```js
const { compile, compileToFunctions } = createCompiler(baseOptions)
```

其实这里调用的 `createCompiler` 也就是 `src/compiler/create-compiler.js` 文件的 `createCompiler` 函数。我们查看一下  `src/compiler/create-compiler.js` 文件的 `createCompiler` 函数如下：

```js
export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      // ...
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
```

可以发现 `createCompiler` 函数的返回值就是一个包含 `compileToFunctions` 属性的对象：

```js
return {
  compile,
  compileToFunctions: createCompileToFunctionFn(compile)
}
```

而这里的 `compileToFunctions` 属性就是 `platforms/web/compiler/index.js` 文件中解构出来的 `compileToFunctions`：

```js
// 这里通过 createCompiler 函数的返回值解构出 compileToFunctions
const { compile, compileToFunctions } = createCompiler(baseOptions)
```

所以上面代码中执行的 `createCompiler` 函数实际上就是 `compiler/create-compiler.js` 文件中的 `createCompiler` 函数，该函数的返回值包含了真正的编译器 `compileToFunctions`，接下来我们就看看 `createCompiler` 都做了什么，打开 `compiler/create-compiler.js` 文件找到 `createCompiler` 函数如下：

```js
export function createCompilerCreator (baseCompile: Function): Function {
  // createCompiler 函数作为 createCompilerCreator 函数的返回值
  return function createCompiler (baseOptions: CompilerOptions) {
    // 定义 compile 函数
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      // ...
    }

    // 返回 compile 和 compileToFunctions
    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
```

从上面的代码可以看到 `createCompiler` 函数的内容其实很简单，就是定义了 `compile` 函数，然后返回一个对象，这个对象包含了 `compile` 函数本身，同时包含了 `compileToFunctions` 函数。这就是 `createCompiler` 所做的内容，但是这就完了吗？还没有，因为我们发现 `compileToFunctions` 这个函数是通过以 `compile` 函数作为参数调用 `createCompileToFunctionFn` 函数生成的，所以我们一直所说的 `compileToFunctions` 函数其实准确的讲它应该是 `createCompileToFunctionFn` 函数的返回值，那么我们看看 `createCompileToFunctionFn` 函数都干了什么，根据引用关系可知 `createCompileToFunctionFn` 函数在 `src/compiler/to-function.js` 文件中，打开这个文件找到该函数：

```js
export function createCompileToFunctionFn (compile: Function): Function {
  const cache = Object.create(null)

  return function compileToFunctions (
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {
    ...
  }
}
```

以上是 `createCompileToFunctionFn` 函数的代码，我们发现这个函数的返回值是一个函数，该函数才是我们真正想要的 `compileToFunctions`，在返回这个函数之前定义了常量 `cache`，所以 `cache` 常量肯定是被 `compileToFunctions` 函数引用的，那么这里可以理解为创建了一个闭包，其实如果大家留意的话，在上面的讲解中我们已经遇到了很多利用闭包引用变量的场景，还是拿上面的代码为例，`createCompileToFunctionFn` 函数接收一个参数 `compile`，而这个参数其实也是被 `compileToFunctions` 闭包引用的。

至此我们经历了一波三折，终于找到了 `compileToFunctions` 函数，`src/platforms/web/entry-runtime-with-compiler.js` 文件中执行的 `compileToFunctions` 函数，其实就是在执行 `src/compiler/to-function.js` 文件中 `createCompileToFunctionFn` 函数返回的 `compileToFunctions` 函数。

## compileToFunctions 的作用

经过前面的讲解，我们已经知道了 `entry-runtime-with-compiler.js` 文件中调用的 `compileToFunctions` 的真正来源，可以说为了创建 `compileToFunctions` 函数经历了一波三折，现在大家也许会有疑问，比如为什么要弄的这么复杂？我们在本章的最后为大家解答这个问题。

这个小节我们就以 `entry-runtime-with-compiler.js` 文件中调用的 `compileToFunctions` 开始，去探索其背后所做的事情。打开 `entry-runtime-with-compiler.js` 文件找到这段代码：

```js
const { render, staticRenderFns } = compileToFunctions(template, {
  shouldDecodeNewlines,
  shouldDecodeNewlinesForHref,
  delimiters: options.delimiters,
  comments: options.comments
}, this)
```

上面这段代码存在于 `Vue.prototype.$mount` 函数体内，我们已经知道 `compileToFunctions` 函数的作用是把传入的模板字符串(`template`)编译成渲染函数(`render`)的。所以传递给 `compileToFunctions` 的第一个参数就是模板字符串(`template`)，而第二个参数则是一些选项(`options`)，接下来我们先把这里传递的选项对象搞清楚，选项对象如下：

```js
{
  shouldDecodeNewlines,
  shouldDecodeNewlinesForHref,
  delimiters: options.delimiters,
  comments: options.comments
}
```

其中 `shouldDecodeNewlines` 和 `shouldDecodeNewlinesForHref` 这两个常量来自于 `platforms/web/util/compat.js` 文件，大家可以在附录 [platforms/web/util 目录下的工具方法全解](../appendix/web-util.md) 中查看这两个常量的作用，其目的是对浏览器的怪癖做兼容，具体在附录中都有讲到，并且这两个常量的类型都是布尔值。

对于 `options.delimiters` 和 `options.comments`，其中 `options` 就是当前 `Vue` 实例的 `$options` 属性，并且 `delimiters` 和 `comments` 都是 `Vue` 提供的选项。所以这里只是简单的将这两个选项透传了过去。

另外 `delimiters` 和 `comments` 这两个选项大家在 `Vue` 的官方文档都能够找到讲解。而这里我要强调的是在 `Vue` 官方文档中有特殊说明，即这两个选项只在完整版的 `Vue` 中可用。这是为什么呢？可能有的同学已经知道了，其原因是这两个选项只有在创建完整版 `Vue` 的时候才会用到，大家不要忘了 `entry-runtime-with-compiler.js` 这个文件是完整版 `Vue` 的入口，也就是说运行时版的 `Vue` 压根不存在这些内容所以自然不会起作用。

现在我们知道了传递给 `compileToFunctions` 的选项参数都包括些什么了，同时我们也知道这里的 `compileToFunctions` 函数实际上就是 `src/compiler/to-function.js` 文件中的 `compileToFunctions`，所以下一步我们将视线转移到 `src/compiler/to-function.js` 文件中的 `compileToFunctions` 函数，不过在这之前我还要啰嗦一句，大家注意 `compileToFunctions` 函数是接收三个参数的，第三个参数是当前 `Vue` 实例。

打开 `src/compiler/to-function.js` 文件，找到 `compileToFunctions` 函数，首先是这三行代码：

```js
// 使用 extend 函数将 options 的属性混合到新的对象中并重新赋值 options
options = extend({}, options)
// 检查选项参数中是否包含 warn，如果没有则使用 baseWarn
const warn = options.warn || baseWarn
// 将 options.warn 属性删除
delete options.warn
```

首先，使用 `extend` 函数将选项参数混合到一个新的对象中，然后定义了 `warn` 常量，其值为 `options.warn` 或 `baseWarn`，如果选项参数中没有 `warn` 则使用 `baseWarn`，其中 `baseWarn` 是来自于 `core/util/debug.js` 文件中 `warn` 的别名，最后将 `options.warn` 移除。这三行代码的作用主要是用来处理一下选项参数 `options` 并定义 `warn` 常量。

接下来是这段代码：

```js
/* istanbul ignore if */
if (process.env.NODE_ENV !== 'production') {
  // detect possible CSP restriction
  try {
    new Function('return 1')
  } catch (e) {
    if (e.toString().match(/unsafe-eval|CSP/)) {
      warn(
        'It seems you are using the standalone build of Vue.js in an ' +
        'environment with Content Security Policy that prohibits unsafe-eval. ' +
        'The template compiler cannot work in this environment. Consider ' +
        'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
        'templates into render functions.'
      )
    }
  }
}
```

首先这段代码是在非生产环境下执行的，然后使用 `try catch` 语句块对 `new Function('return 1')` 这句代码进行错误捕获，如果有错误发生且错误的内容中包含诸如 `'unsafe-eval'` 或者 `'CSP'` 这些字样的信息时就会给出一个警告。我们知道 `CSP` 全称是内容安全策略，如果你的策略比较严格，那么 `new Function()` 将会受到影响，从而不能够使用。但是将模板字符串编译成渲染函数又依赖 `new Function()`，所以解决方案有两个：

* 1、放宽你的CSP策略
* 2、预编译

总之这段代码的作用就是检测 `new Function()` 是否可用，并在某些情况下给你一个有用的提示。

接下来是这段代码：

```js
// check cache
const key = options.delimiters
  ? String(options.delimiters) + template
  : template
if (cache[key]) {
  return cache[key]
}
```

首先定义常量 `key`，其值为一个字符串，我们知道 `options.delimiters` 是一个数组，如果 `options.delimiters` 存在，则使用 `String` 方法将其转换成字符串并与 `template` 拼接作为 `key` 的值，否则直接使用 `template` 字符串作为 `key` 的值，然后判断 `cache[key]` 是否存在，如果存在直接返回 `cache[key]`。这么做的目的是缓存字符串模板的编译结果，防止重复编译，提升性能，我们再看一下 `compileToFunctions` 函数的最后一句代码：

```js
return (cache[key] = res)
```

这句代码在返回编译结果的同时，将结果缓存，这样下一次发现如果 `cache` 中存在相同的 `key` 则不需要再次编译，直接使用缓存的结果就可以了。

那么 `cache` 这个变量是哪里来的？这个变量定义在 `compileToFunctions` 的前面，也就是 `createCompileToFunctionFn` 函数的开头，如下：

```js
const cache = Object.create(null)
```

可知 `cache` 就是一个通过 `Object.create(null)` 创建出来的空对象而已。

接下来是这句代码：

```js
// compile
const compiled = compile(template, options)
```

可以说这句代码才是整个函数最核心的代码，虽然它只要一句，但是它做的事情最多。`compile` 是通过闭包引用了来自 `createCompileToFunctionFn` 函数的形参，所以这里的 `compile` 就是调用 `createCompileToFunctionFn` 函数时传递过来的函数，打开 `src/compiler/create-compiler.js` 文件如下：

```js
export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      // 函数体...
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
```

其实前面我们已经提到过，传递给 `createCompileToFunctionFn` 函数的 `compile` 参数，就是定义在 `createCompiler` 函数开头的 `compile` 函数。所以：

```js
// compile
const compiled = compile(template, options)
```

这里的 `compile` 函数就是定义在 `src/compiler/create-compiler.js` 文件中 `createCompiler` 函数开头的 `compile` 函数。

现在大家只需要知道真正的编译工作是依托于 `compile` 函数的即可，我们后面会详细解析 `compile`。接下来我们继续查看 `compileToFunctions` 代码，下面是这段：

```js
// check compilation errors/tips
if (process.env.NODE_ENV !== 'production') {
  if (compiled.errors && compiled.errors.length) {
    warn(
      `Error compiling template:\n\n${template}\n\n` +
      compiled.errors.map(e => `- ${e}`).join('\n') + '\n',
      vm
    )
  }
  if (compiled.tips && compiled.tips.length) {
    compiled.tips.forEach(msg => tip(msg, vm))
  }
}
```

我们知道，在使用 `compile` 函数对模板进行编译后会返回一个结果 `compiled`，通过上面这段代码我们能够猜到，返回结果 `compiled` 是一个对象且这个对象可能包含两个属性 `errors` 和 `tips`。通过这两个属性的名字可知，这两个属性分别包含了编译过程中的错误和提示信息。所以上面那段代码的作用就是用来检查使用 `compile` 对模板进行编译的过程中是否存在错误和提示的，如果存在那么需要将其打印出来。

另外，这段代码也是运行在非生产环境的，且错误信息 `compiled.errors` 和提示信息 `compiled.tips` 都是数组，需要遍历打印，不同的是错误信息使用 `warn` 函数进行打印，而提示信息使用 `tip` 函数进行打印，其中 `tip` 函数也来自于 `core/util/debug.js` 文件。

再往下是这样一段代码：

```js
// turn code into functions
const res = {}
const fnGenErrors = []
res.render = createFunction(compiled.render, fnGenErrors)
res.staticRenderFns = compiled.staticRenderFns.map(code => {
  return createFunction(code, fnGenErrors)
})
```

定义了两个常量 `res` 以及 `fnGenErrors`，其中 `res` 是一个空对象且它就是最终的返回值，`fnGenErrors` 是一个空数组。然后在 `res` 对象上添加一个 `render` 属性，这个 `render` 属性，实际上就是最终生成的渲染函数，它的值是通过 `createFunction` 创建出来的，其中 `createFunction` 函数就定义在 `to-function.js` 文件的开头，源码如下：

```js
function createFunction (code, errors) {
  try {
    return new Function(code)
  } catch (err) {
    errors.push({ err, code })
    return noop
  }
}
```

`createFunction` 函数接收两个参数，第一个参数 `code` 为函数体字符串，该字符串将通过 `new Function(code)` 的方式创建为函数。第二个参数 `errors` 是一个数组，作用是当采用 `new Function(code)` 创建函数发生错误时用来收集错误的。我们再查看一下调用 `createFunction` 那句代码：

```js
res.render = createFunction(compiled.render, fnGenErrors)
```

可知，传递给 `createFunction` 函数的第一个参数是 `compiled.render`，所以 `compiled.render` 应该是一个函数体字符串，且我们知道 `compiled` 是 `compile` 函数的返回值，这说明：*`compile` 函数编译模板字符串后所得到的是字符串形式的函数体*。传递给 `createFunction` 函数的第二个参数是之前声明的 `fnGenErrors` 常量，也就是说当创建函数出错时的错误信息被 `push` 到这个数组里了。

在这句代码之后，又在 `res` 对象上添加了 `staticRenderFns` 属性：

```js
res.staticRenderFns = compiled.staticRenderFns.map(code => {
  return createFunction(code, fnGenErrors)
})
```

由这段代码可知 `res.staticRenderFns` 是一个函数数组，是通过对 `compiled.staticRenderFns` 遍历生成的，这说明：*`compiled` 除了包含 `render` 字符串外，还包含一个字符串数组 `staticRenderFns`，且这个字符串数组最终也通过 `createFunction` 转为函数。* `staticRenderFns` 的主要作用是渲染优化，我们后面详细讲解。

再接下来就是 `compileToFunctions` 函数的最后一段代码：

```js
// check function generation errors.
// this should only happen if there is a bug in the compiler itself.
// mostly for codegen development use
/* istanbul ignore if */
if (process.env.NODE_ENV !== 'production') {
  if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
    warn(
      `Failed to generate render function:\n\n` +
      fnGenErrors.map(({ err, code }) => `${err.toString()} in\n\n${code}\n`).join('\n'),
      vm
    )
  }
}
```

这段代码同样是在非生产环境下执行的，这段代码主要的作用是用来打印在生成渲染函数过程中的错误，也就是上面定义的常量 `fnGenErrors` 中所收集的错误。注释中写的很清楚，这段代码的作用主要是用于开发 `codegen` 功能时使用，一般是编译器本身的错误，所以对于我们来讲基本用不到。

最后一句代码我们前面已经讲过：`return (cache[key] = res)` 返回结果的同时将结果缓存。

现在我们回顾一下 `src/compiler/to-function.js` 文件的整个内容，可以发现这个文件的主要作用有以下几点：

* 1、缓存编译结果，通过 `createCompileToFunctionFn` 函数内声明的 `cache` 常量实现。
* 2、调用 `compile` 函数将模板字符串转成渲染函数字符串
* 3、调用 `createFunction` 函数将渲染函数字符串转成真正的渲染函数
* 4、打印编译错误，包括：模板字符串 -> 渲染函数字符串 以及 渲染函数字符串 -> 渲染函数 这两个阶段的错误

最后，真正的 `模板字符串` 到 `渲染函数字符串` 的编译工作实际上是通过调用 `compile` 函数来完成的，所以接下来我们的任务就是弄清楚 `compile` 函数。

## compile 的作用

回顾一下 `src/compiler/to-function.js` 文件中的 `compileToFunctions` 函数调用 `compile` 函数的方式：

```js
const compiled = compile(template, options)
```

很简单的一段代码，其中模板字符串 `template` 被透传了过去，选项参数 `options` 经过简单处理后继续作为第二个参数传递给 `compile` 函数，前面我们分析过，这里传递过去的 `options` 如下：

```js
{
  shouldDecodeNewlines,
  shouldDecodeNewlinesForHref,
  delimiters,
  comments,
  warn  // 被 delete
}
```

其中 `warn` 属性被 `delete` 操作符删除。这里只是给大家做一个简短的回顾，并且我们对 `Vue` 的编译器所接收的参数进行归纳，并整理了附录 [编译器选项整理](../appendix/compiler-options.md)，后面遇到的任何编译器选项都会整理到该附录里，大家可以在这里查阅 `Vue` 编译器所接收的选项。

知道了这些我们就可以去看 `compile` 函数的代码了，我们知道 `compile` 函数是 `createCompileToFunctionFn` 函数的形参，也就是说，`compile` 函数是被从其他地方传递过来了，其实前面我们都分析过，这里的 `compile` 函数就是 `src/compiler/create-compiler.js` 文件中定义在 `createCompiler` 函数内的 `compile` 函数，如下：

```js
export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {
    // 就是这个 compile 函数
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      // 函数体 ...
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
```

可以发现，`compile` 函数接收两个参数，分别是模板字符串(`template`)和选项参数(`options`)。我们顺序的查看其函数体代码，首先是这句代码：

```js
const finalOptions = Object.create(baseOptions)
```

这句代码通过 `Object.create` 函数以 `baseOptions` 为原型创建 `finalOptions` 常量，`finalOptions` 才是最终的编译选项参数。这里的 `baseOptions` 是 `createCompiler` 函数的形参，也就是在 `src/platforms/web/compiler/index.js` 文件中调用 `createCompiler` 传递过来的参数：

```js
import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

const { compile, compileToFunctions } = createCompiler(baseOptions)
```

可以看到 `baseOptions` 来自于 `src/platforms/web/compiler/options.js` 文件，下面是该文件的全部代码：

```js
/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,
  directives,
  isPreTag,
  isUnaryTag,
  mustUseProp,
  canBeLeftOpenTag,
  isReservedTag,
  getTagNamespace,
  staticKeys: genStaticKeys(modules)
}
```

还是比较简短的，这个文件的主要作用就是导出一个对象，即我们说到的 `baseOptions`，所以下面我们就把 `baseOptions` 这个对象的内容搞清楚。

对象如下：

```js
{
  expectHTML: true,
  modules,
  directives,
  isPreTag,
  isUnaryTag,
  mustUseProp,
  canBeLeftOpenTag,
  isReservedTag,
  getTagNamespace,
  staticKeys: genStaticKeys(modules)
}
```

我们一个一个看，第一个属性 `expectHTML` 被设置为 `true`。第二个属性是 `modules`，根据引用关系可知它来自于 `platforms/web/compiler/modules/index.js` 文件，打开这个文件：

```js
import klass from './class'
import style from './style'
import model from './model'

export default [
  klass,
  style,
  model
]
```

以上是该文件的全部代码，可以发现 `modules` 实际上就是一个数组，数组有三个元素 `klass`、`style` 以及 `model`，并且这三个元素来自于当前目录下的三个相应名称的 `js` 文件。简单查看这三个文件的输出，如下：

```js
// klass.js 的输出
export default {
  staticKeys: ['staticClass'],
  transformNode,
  genData
}
// style.js 的输出
export default {
  staticKeys: ['staticStyle'],
  transformNode,
  genData
}
// model.js 的输出
export default {
  preTransformNode
}
```

可以看到这三个文件输出的都是对象，且 `class.js` 文件与 `style.js` 文件的输出基本相同，只有 `staticKeys` 字段有所区别，而 `model.js` 文件输出的对象只包含 `preTransformNode` 属性。最终 `platforms/web/compiler/modules/index.js` 文件将这三个文件的输出综合为一个数组进行输出，所以其输出的内容为：

```js
[
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
]
```

以上就是 `baseOptions` 对象第二个属性 `modules` 的内容。`baseOptions` 对象的第三个属性是 `directives`，类似 `modules` 只不过 `directives` 来自于 `platforms/web/compiler/directives/index.js` 文件，该文件源码如下：

```js
import model from './model'
import text from './text'
import html from './html'

export default {
  model,
  text,
  html
}
```

同样类似于 `modules` 输出，只不过 `directives` 最终输出的不是数组，而是一个对象，这个对象包含三个属性 `model`、`text` 以及 `html`，这三个属性同样来自于当前目录下的三个文件：`model.js`、`text.js` 以及 `html.js` 文件，我们分别查看这三个文件的输出：

```js
// model.js 的输出
export default function model (
  el: ASTElement,
  dir: ASTDirective,
  _warn: Function
): ?boolean {
  // 函数体...
}
// html.js 的输出
export default function html (el: ASTElement, dir: ASTDirective) {
  if (dir.value) {
    addProp(el, 'innerHTML', `_s(${dir.value})`)
  }
}
// text.js 的输出
export default function text (el: ASTElement, dir: ASTDirective) {
  if (dir.value) {
    addProp(el, 'textContent', `_s(${dir.value})`)
  }
}
```

可以发现，这个三个文件分别输出了三个函数，所以最终 `baseOptions` 对象的 `directives` 属性如下：

```js
{
  model: function(){},
  html: function(){},
  text: function(){}
}
```

它是一个包含三个属性的对象，且属性的值都是函数。

`baseOptions` 的第四个属性是 `isPreTag`，它是一个函数，可以在附录 [platforms/web/util 目录下的工具方法全解](../appendix/web-util.md) 中查看其实现讲解，其作用是通过给定的标签名字检查标签是否是 `'pre'` 标签。

`baseOptions` 的第五个属性是 `isUnaryTag`，它来自于与 `options.js` 文件同级目录下的 `util.js` 文件，即 `src/platforms/web/compiler/util.js` 文件，打开这个文件，找到 `isUnaryTag` 如下：

```js
export const isUnaryTag = makeMap(
  'area,base,br,col,embed,frame,hr,img,input,isindex,keygen,' +
  'link,meta,param,source,track,wbr'
)
```

可以看到 `isUnaryTag` 是一个通过 `makeMap` 生成的函数，该函数的作用是检测给定的标签是否是一元标签。

`baseOptions` 的第六个属性是 `mustUseProp`，它是一个函数，可以在附录 [platforms/web/util 目录下的工具方法全解](../appendix/web-util.md) 中查看其实现讲解，其作用是用来检测一个属性在标签中是否要使用 `props` 进行绑定。

`baseOptions` 的第七个属性是 `canBeLeftOpenTag`，它也是一个函数，来自于 `src/platforms/web/compiler/util.js` 文件，源码如下：

```js
// Elements that you can, intentionally, leave open
// (and which close themselves)
export const canBeLeftOpenTag = makeMap(
  'colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr,source'
)
```

该函数也是一个使用 `makeMap` 生成的函数，它的作用是检测一个标签是否是那些虽然不是一元标签，但却可以自己补全并闭合的标签。比如 `p` 标签是一个双标签，你需要这样使用 `<p>Some content</p>`，但是你依然可以省略闭合标签，直接这样写：`<p>Some content`，且浏览器会自动补全。但是有些标签你不可以这样用，它们是严格的双标签。

`baseOptions` 的第八个属性是 `isReservedTag`，它是一个函数，可以在附录 [platforms/web/util 目录下的工具方法全解](../appendix/web-util.md) 中查看其实现讲解，其作用是检查给定的标签是否是保留的标签。

`baseOptions` 的第九个属性是 `getTagNamespace`，它也是一个函数，同样可以在附录 [platforms/web/util 目录下的工具方法全解](../appendix/web-util.md) 中查看其实现讲解，其作用是获取元素(标签)的命名空间。

`baseOptions` 的第十个属性是 `staticKeys`，它的值是通过以 `modules` 为参数调用 `genStaticKeys` 函数的返回值得到的。其中 `modules` 就是 `baseOptions` 的第二个属性，而 `genStaticKeys` 来自于 `src/shared/util.js` 文件，大家可以在附录 [shared/util.js 文件工具方法全解](../appendix/shared-util.md) 中查看该函数的讲解，其作用是根据编译器选项的 `modules` 选项生成一个静态键字符串。

现在我们已经弄清楚 `baseOptions` 对象的各个属性都是什么了，这些属性作为编译器的基本参数选项，但是我们还不清楚其各个属性的意义，比如 `modules` 数组和 `directives` 对象等，不过不急，随着后面的深入，这些疑惑都将慢慢解开。

现在我们再回到 `compile` 继续看下面的代码，在创建完 `finalOptions` 属性之后，又定义了两个常量：`errors` 和 `tips` 且它们的值都是数组：

```js
const errors = []
const tips = []
```

在这之后，是这样一段代码：

```js
finalOptions.warn = (msg, tip) => {
  (tip ? tips : errors).push(msg)
}
```

上面的代码在 `finalOptions` 上添加了 `warn` 函数，该函数接收两个参数：1、`msg` 错误或提示的信息，2、`tip` 用来标示 `msg` 是错误还是提示。可以猜想的到 `warn` 选项主要用在编译过程中的错误和提示收集，如果收集的信息是错误信息就将错误信息添加到前面定义的 `errors` 数组里，如果是提示信息就将其添加到 `tips` 数组里。

再往下，是这段代码：

```js
if (options) {
  // merge custom modules
  if (options.modules) {
    finalOptions.modules =
      (baseOptions.modules || []).concat(options.modules)
  }
  // merge custom directives
  if (options.directives) {
    finalOptions.directives = extend(
      Object.create(baseOptions.directives || null),
      options.directives
    )
  }
  // copy other options
  for (const key in options) {
    if (key !== 'modules' && key !== 'directives') {
      finalOptions[key] = options[key]
    }
  }
}
```

这段代码检查 `options` 是否存在，这里的 `options` 就是使用编译器编译模板时传递的选项参数，或者可以简单理解为调用 `compileToFunctions` 函数时传递的选项参数。其实我们可以把 `baseOptions` 理解为编译器的默认选项或者基本选项，而 `options` 是用来提供定制能力的扩展选项。而上面这段代码的作用，就是将 `options` 对象混合到 `finalOptions` 中，我们看一下它具体是如何做的。

首先检查 `options.modules` 是否存在：

```js
// merge custom modules
if (options.modules) {
  finalOptions.modules =
    (baseOptions.modules || []).concat(options.modules)
}
```

如果存在，就在 `finalOptions` 对象上添加 `modules` 属性，其值为 `baseOptions.modules` 和 `options.modules` 这两个数组合并后的新数组。

然后检查是否有 `options.directives`：

```js
// merge custom directives
if (options.directives) {
  finalOptions.directives = extend(
    Object.create(baseOptions.directives || null),
    options.directives
  )
}
```

由于 `directives` 是对象而不是数组，所以不能采用与 `modules` 相同的处理方式，对于 `directives` 采用原型链的原理实现扩展属性对基本属性的覆盖。首先通过 `Object.create(baseOptions.directives || null)` 创建一个以 `baseOptions.directives` 对象为原型的新对象，然后使用 `extend` 方法将 `options.directives` 的属性混合到新创建出来的对象中，并将该对象作为 `finalOptions.directives` 的值。

最后对于 `options` 中既不是 `modules` 又不是 `directives` 的其他属性，采用直接复制过去的方式进行处理：

```js
// copy other options
for (const key in options) {
  if (key !== 'modules' && key !== 'directives') {
    finalOptions[key] = options[key]
  }
}
```

经过以上步骤，最终的 `finalOptions` 就已经成型了，我们再看接下来的这句代码：

```js
const compiled = baseCompile(template, finalOptions)
```

上面的代码调用了 `baseCompile` 函数，并分别将字符串模板(`template`)，以及最终的编译器选项(`finalOptions`)传递了过去。这说明什么？这说明 `compile` 函数对模板的编译是委托 `baseCompile` 完成的。`baseCompile` 函数是 `createCompilerCreator` 函数的形参，是在 `src/compiler/index.js` 文件中调用 `createCompilerCreator` 创建 `'编译器创建者' 的创建者时` 传递过来的：

```js
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options)
  optimize(ast, options)
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

如上代码 `baseCompile` 作为 `createCompilerCreator` 的参数传递过来。不过现在还不是具体查看 `baseCompile` 代码的时候，我们还是回到 `compile` 继续查看剩余的代码，再调用 `baseCompile` 函数之后是这样一段代码：

```js
if (process.env.NODE_ENV !== 'production') {
  errors.push.apply(errors, detectErrors(compiled.ast))
}
```

`compiled` 是 `baseCompile` 对模板的编译结果，该结果中包含了模板编译后的抽象语法树(AST)，可以通过 `compiled.ast` 访问该语法树，所以上面这段代码的作用是用来通过抽象语法树来检查模板中是否存在错误表达式的，通过 `detectErrors` 函数实现，将 `compiled.ast` 作为参数传递给 `detectErrors` 函数，该函数最终返回一个数组，该数组中包含了所有错误的收集，最终通过这句代码将错误添加到 `errors` 数组中：

```js
errors.push.apply(errors, detectErrors(compiled.ast))
```

最后的一段代码如下：

```js
compiled.errors = errors
compiled.tips = tips
return compiled
```

将收集到的错误(`errors`)和提示(`tips`)添加到 `compiled` 上并返回。至此 `compile` 函数的工作就结束了。我们做一个简短的回顾，通过上面的分析我们可以明白 `compile` 函数的作用，它的作用主要有三个：

* 1、生成最终编译器选项 `finalOptions`
* 2、对错误的收集
* 3、调用 `baseCompile` 编译模板

补充：上面的分析中，我们并没有深入讲解 `detectErrors` 函数是如何根据抽象语法树(AST)检查模板中是否存在表达式错误的，这是因为现在对于大家来讲还不清楚抽象语法树的模样，且这并不会对大家的理解造成障碍，所以我们将这部分的讲解后移，等我们对 AST 心知肚明之后再来看这部分内容也不迟。

## 理解编译器代码的组织方式

如果你看到了这里，也许心里还有一个疑问，好好的代码为什么感觉如此繁琐。实际上你之所以会有繁琐的感觉，是因为你还没有理解源码为什么这么做的原因，当你明白了源码的动机之后就不会有这种感觉了。而本节的内容就是让你进一步理解为什么这样创建编译器。

首先我们来看一下 `Vue` 源码中编译器的目录结构：

```
├── src
│   ├── compiler -------------------------- 编译器代码的存放目录
│   ├── ├── codegen ----------------------- 根据AST生成目标平台代码
│   ├── ├── parser ------------------------ 解析原始代码并生成AST
```

如上目录结构中有两个比较重要的目录，一个是 `codegen` 目录，另一个是 `parser` 目录。其中 `parser` 目录内主要会导出一个叫做 `parse` 的函数，该函数是一个解析器，它的作用是将模板字符串解析为对应的抽象语法树(`AST`)，通常我们会像如下代码这样使用 `parse` 函数：

```js
// 从 parser 目录下的 index.js 文件中导入 parse 函数
import { parse } from './parser/index'

// 使用 parse 函数将模板解析为 AST
const ast = parse(template.trim(), options)
```

有了 `AST` 之后我们就可以根据这个 `AST` 生成不同平台的目标代码，而 `codegen` 目录内的代码就是用来做这件事情的，`codegen` 目录内的代码会导出一个叫做 `generate` 的函数，这个函数的作用就是根据给定的AST生成最终的目标平台的代码，通常我们会像如下代码这样使用 `generate` 函数：

```js
// 从 codegen 目录下的 index.js 文件中导入 generate 函数
import { generate } from './codegen/index'

// 根据给定的AST生成目标平台的代码
const code = generate(ast, options)
```

有了这些我们就可以封装一个编译器函数供外部使用：

```js
export function myCompiler (template: string, options: CompilerOptions) {
  const ast = parse(template.trim(), options)
  const code = generate(ast, options)

  return code
}
```

当然了，在编译的过程中可能会收集一些错误，我们还需要对错误进行处理，所以我们可能会在上面的代码中添加一些用来处理编译错误的代码：

```js {5}
export function myCompiler (template: string, options: CompilerOptions) {
  const ast = parse(template.trim(), options)
  const code = generate(ast, options)

  // 一些处理编译错误的代码

  return code
}
```

这样我们封装的 `myCompiler` 函数就可以导出供给其他部分的代码使用了，假设我们的 `myCompiler` 函数用来将模板编译为可以在 `web` 平台下运行的代码，但是突然有一天你想要根据同样的AST生成其他平台的代码，这时你可以选择再创建一个函数，假设它叫 `otherCompiler`：

```js {3}
export function otherCompiler (template: string, options: CompilerOptions) {
  const ast = parse(template.trim(), options)
  const code = otherGenerate(ast, options)

  // 一些处理编译错误的代码

  return code
}
```

如上高亮的代码所示，既然要生成其他平台的代码，那么代码生成部分就需要重写，比如上面的代码中我们使用 `otherGenerate` 函数代替了原来的 `generate` 函数。但是AST还是原来的AST，并且用来处理编译错误的代码可能也不会变动，这时 `myCompiler` 函数和 `otherCompiler` 函数中就存在了冗余的代码，为了解决这个问题，我们可以封装一个叫做 `createCompilerCreator` 函数，把通用的代码封装起来，如下：

```js
function createCompilerCreator (baseCompile) {
  return function customCompiler (template: string, options: CompilerOptions) {

    // 一些处理编译错误的代码

    return baseCompile(template, options)
  }
}
```

这样我们就可以使用 `createCompilerCreator` 函数创建出针对于不同平台的编译器了，如下代码所示：

```js
// 创建 web 平台的编译器
const webCompiler = createCompilerCreator(function baseCompile (template, options) {
  const ast = parse(template.trim(), options)
  const code = generate(ast, options)
  return code
})

// 创建其他平台的编译器
const otherCompiler = createCompilerCreator(function baseCompile (template, options) {
  const ast = parse(template.trim(), options)
  const code = otherGenerate(ast, options)
  return code
})
```

看到这里相信聪明的你已经明白了为什么会有 `src/compiler/create-compiler.js` 文件的存在，以及它的作用，实际上该文件中的 `createCompilerCreator` 函数与我们如上例子中的 `createCompilerCreator` 函数作用一致。

现在我们再来看 `src/compiler/index.js` 文件中的如下这段代码：

```js
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

实际上这段代码所创建的就是 `web` 平台下的编译器，大家可以打开 `src/server/optimizing-compiler/index.js` 文件，你会看到如下这段代码：

```js
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options)
  optimize(ast, options)
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

而这段代码是用来创建服务端渲染环境的编译器，注意如上代码中的 `generate` 函数和 `optimize` 函数已经是来自 `src/server` 目录下的相关文件了。

另外与我们前面举的例子不同，`/src/compiler/create-compiler.js` 文件中的 `createCompilerCreator` 函数所返回的函数接收的参数是 `baseOptions`，所以 `src/compiler/index.js` 文件中导出的 `createCompiler` 函数就会接收 `baseOptions` 参数，这就是为什么在 `src/platforms/web/compiler/index.js` 会像如下这样调用 `createCompiler` 函数：

```js
const { compile, compileToFunctions } = createCompiler(baseOptions)
```

如上代码中传递的 `baseOptions` 将作为编译器的基本参数，另外我们注意如上代码中 `createCompiler` 函数的返回值，它返回的是一个对象，对象中包含两个元素，分别是 `compile` 和 `compileToFunctions`，实际上 `compile` 函数与 `compileToFunctions` 函数的区别就在于 **`compile` 函数生成的是字符串形式的代码，而 `compileToFunctions` 生成的才是真正可执行的代码**，并且 `compileToFunctions` 函数本身是使用 `src/compiler/to-function.js` 文件中的 `createCompileToFunctionFn` 函数根据 `compile` 生成的：

```js
return {
  compile,
  compileToFunctions: createCompileToFunctionFn(compile)
}
```

而且 `compileToFunctions` 函数中调用了 `compile` 函数，如下：

```js {12}
export function createCompileToFunctionFn (compile: Function): Function {
  const cache = Object.create(null)

  return function compileToFunctions (
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {
    
    // compile
    const compiled = compile(template, options)

  }
}
```

如上高亮的代码所示，在调用 `compile` 函数时传递了 `template` 参数和 `options` 参数。这两个参数都是通过 `compileToFunctions` 函数传递过来的。我们找到 `src/platforms/web/entry-runtime-with-compiler.js` 文件，注意如下代码：

```js
const { render, staticRenderFns } = compileToFunctions(template, {
  shouldDecodeNewlines,
  shouldDecodeNewlinesForHref,
  delimiters: options.delimiters,
  comments: options.comments
}, this)
```

大家注意如上代码中调用 `compileToFunctions` 函数时传递的第二个选项参数，还记得在 `src/platforms/web/compiler/index.js` 中创建 `compileToFunctions` 函数时传递的基本选项吗：

```js
const { compile, compileToFunctions } = createCompiler(baseOptions)
```

所以看到这里，你应该知道的是：**在创建编译器的时候传递了基本编译器选项参数，当真正使用编译器编译模板时，依然可以传递编译器选项，并且新的选项和基本选项会以合适的方式融合或覆盖**。
