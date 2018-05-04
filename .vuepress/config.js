module.exports = {
  title: '走进Vue源码',
  description: '逐行级别的 Vue 源码分析',
  markdown: {
    toc: {
      includeLevel: [2, 3, 4, 5, 6]
    }
  },
  themeConfig: {
    sidebarDepth: 0,
    sidebar: [
      {
        title: '正文',
        children: [
          ['/', '概览'],
          ['/note/0前言', '前言'],
          ['/note/1了解Vue这个项目', '了解 Vue 这个项目'],
          ['/note/2Vue构造函数', 'Vue 构造函数'],
          ['/note/3Vue的思路之以一个例子为线索', 'Vue 的思路之以一个例子为线索'],
          ['/note/4Vue选项的规范化', 'Vue 选项的规范化'],
          ['/note/5Vue选项的合并', 'Vue 选项的合并'],
          ['/note/6Vue的初始化之开篇', 'Vue 的初始化之开篇'],
          ['/note/7Vue的初始化之数据响应系统', 'Vue 的初始化之数据响应系统'],
          ['/note/8Vue的编译器初探', 'Vue 的编译器初探'],
          ['/note/9Vue中的html-parser', 'Vue 的html-parser'],
          ['/note/10编译器之parser', '编译器之parser'],
          ['/note/Vue的编译器', 'Vue的编译器']
        ]
      },
      {
        title: '附录',
        children: [
          ['/note/附录/Vue构造函数整理-原型', 'Vue 构造函数整理-原型'],
          ['/note/附录/Vue构造函数整理-全局API', 'Vue 构造函数整理-全局API'],
          ['/note/附录/Vue实例的设计', 'Vue 实例的设计'],
          ['/note/附录/core-util', 'core/util 目录下的工具方法全解'],
          ['/note/附录/web-util', 'platforms/web/util 目录下的工具方法全解'],
          ['/note/附录/shared-util', 'shared/util.js 文件工具方法全解'],
          ['/note/附录/compiler-options', '编译器选项整理']
        ]
      },
      {
        title: '扩展阅读',
        children: [
          ['/note/扩展阅读/Vue中创建高阶组件', 'Vue 中创建高阶组件']
        ]
      }
    ]
  }
}
