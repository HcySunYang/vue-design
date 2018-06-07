module.exports = {
  base: '/vue-design/',
  title: '走进Vue源码',
  description: '逐行级别的 Vue 源码分析',
  markdown: {
    toc: {
      includeLevel: [2, 3, 4, 5, 6]
    }
  },
  themeConfig: {
    sidebarDepth: 3,
    nav: [
      {
        text: '正文',
        link: '/art/',
      },
      {
        text: '附录',
        link: '/appendix/'
      },
      {
        text: '扩展阅读',
        link: '/more/'
      }
    ],
    sidebar: {
      '/art/': [
        {
          title: '正文',
          children: [
            '',
            '1start-learn',
            '2vue-constructor',
            '3vue-example',
            '4vue-normalize',
            '5vue-merge',
            '6vue-init-start',
            '7vue-reactive',
            '8vue-reactive-dep-watch',
            '9vue-state-init',
            '80vue-compiler-start',
            '81vue-parse-ast',
            '82vue-parsing',
            '83vue-codegen',
            '84vue-vdom',
            '85vue-vdom-patch'
          ]
        }
      ],
      '/appendix/': [
        {
          title: '附录',
          children: [
            '',
            'vue-prototype',
            'vue-global-api',
            'vue-ins',
            'core-util',
            'web-util',
            'shared-util',
            'compiler-options'
          ]
        }
      ],
      '/more/': [
        {
          title: '扩展阅读',
          children: [
            '',
            'vue-hoc'
          ]
        }
      ]
    }
  }
}
