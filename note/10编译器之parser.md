# 目录

[[toc]]

## 编译器之 parser

在 [7Vue的编译器初探](/note/7Vue的编译器初探.md) 这一章节中，我们对 `Vue` 如何创建编译器，以及在这个过程中经历过的几个重要的函数做了分析，比如 `compileToFunctions` 函数以及 `compile` 函数，并且我们知道真正对模板进行编译工作的实际是 `baseCompile` 函数，而接下来我们任务就是搞清楚 `baseCompile` 函数的内容。

`baseCompile` 函数是在 `src/compiler/index.js` 中作为 `createCompilerCreator` 函数参数使用的，代码如下：

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

可以看到 `baseCompile` 函数接收两个参数，分别是字符串模板(`template`)和选项参数(`options`)，其中选项参数 `options` 我们已经分析过了，并且我们有对应的附录专门整理编译器的选项参数，可以在 [编译器选项整理](/note/附录/compiler-options.md) 中查看。

`baseCompile` 函数很简短，由三句代码和一个 `return` 语句组成，这三句代码的作用如以下：

```js
// 调用 parse 函数将字符串模板解析成抽象语法树(AST)
const ast = parse(template.trim(), options)
// 调用 optimize 函数优化 ast
optimize(ast, options)
// 调用 generate 函数将 ast 编译成渲染函数
const code = generate(ast, options)
```

最终 `baseCompile` 的返回值如下：

```js
return {
  ast,
  render: code.render,
  staticRenderFns: code.staticRenderFns
}
```

可以看到，其最终返回了抽象语法树(`ast`)，渲染函数(`render`)，静态渲染函数(`staticRenderFns`)，且 `render` 的值为 `code.render`，`staticRenderFns` 的值为 `code.staticRenderFns`，也就是说通过 `generate` 处理 `ast` 之后得到的返回值 `code` 是一个对象，该对象的属性中包含了渲染函数（**注意以上提到的渲染函数，都以字符串的形式存在，因为真正变成函数的过程是在 `compileToFunctions` 中使用 `new Function()` 来完成的**）。

而接下来我们将会花费很大的篇幅来聚焦在一句代码上，即下面这句代码：

```js
const ast = parse(template.trim(), options)
```

也就是 `Vue` 的 `parser`，它是如何将字符串模板解析为抽象语法树的(`AST`)。

#### 对 parser 简单介绍

在说 `parser` 之前，我们先了解一下编译器的概念，科班出身的你，应该对编译器的概念有所了解，简单的讲编译器就是将 `源代码` 转换成 `目标代码` 的工具。详细一点如下(引用自维基百科)：

> 它主要的目的是将便于人编写、阅读、维护的高级计算机语言所写作的 `源代码` 程序，翻译为计算机能解读、运行的低阶机器语言的程序。`源代码` 一般为高阶语言（High-level language），如Pascal、C、C++、C# 、Java等，而目标语言则是汇编语言或目标机器的目标代码（Object code）。

编译器所包含的概念很多，比如 词法分析，语义分析，类型检查/推导，代码优化，代码生成...等等，且大学中已有专门的课程，而我们这里要将的 `parser` 就是编译器中的一部分，准确的说，`parser` 是编译器对源代码处理的第一步。

说点题外话，看到这里的同学，如果你不是科班出身，请不要对自己产生怀疑，一个对你最简单有效鼓励方式是：这套系列文章的作者，也就是我本人也不是科班出身的。如果这对你的鼓励不够，那我再换一种方式：`Vue` 的作者也不是科班出身的，这次够了吗？知识是死的但人是活的，知识就摆在那里，你学了多了就会了多少。

回到正题，我们说 `parser` 是编译器处理源代码的第一步，原因是什么呢？接下来我们讲一讲什么是 `parser`。

`parser` 是把某种特定格式的文本转换成某种数据结构的程序，其中“特定格式的文本”可以理解为普通的字符串，而 `parser` 的作用就是将这个字符串转换成一种数据结构，并且这个数据结构是编译器能够理解的，因为编译器的后续步骤，比如上面提到的 语义分析，类型检查/推导，代码优化，代码生成 等等都依赖于该数据结构，正因如此我们才说 `parser` 是编译器处理源代码的第一步，并且这种数据结构是抽象的，我们常称其为抽象语法树，即 `AST`。








