## 编译器之 parser

在 [7Vue的编译器初探](/note/7Vue的编译器初探) 这一章节中，我们对 `Vue` 如何创建编译器，以及在这个过程中经历过的几个重要的函数做了分析，比如 `compileToFunctions` 函数以及 `compile` 函数，并且我们知道真正对模板进行编译工作的实际是 `baseCompile` 函数，而接下来我们任务就是搞清楚 `baseCompile` 函数的内容。

