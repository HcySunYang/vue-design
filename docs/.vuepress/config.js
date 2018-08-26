module.exports = {
  base: '/vue-design/',
  title: 'Vue技术内幕',
  ga: 'UA-120533817-1',
  description: '逐行级别的 Vue 源码分析',
  head: [
    ['script', { async: '', src: 'http://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js' }],
    ['link', { rel: 'icon', href: '/logo.png' }]
  ],
  markdown: {
    toc: {
      includeLevel: [2, 3, 4, 5, 6]
    }
  },
  themeConfig: {
    repo: 'HcySunYang/vue-design',
    docsDir: 'docs',
    editLinks: true,
    editLinkText: '错别字纠正',
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
      },
      {
        text: '辅助工具',
        link: '/tools/'
      },
      {
        text: '人之初',
        link: '/donate/'
      },
      {
        text: '关于',
        link: '/about/'
      }
    ],
    sidebar: {
      '/art/': [
        {
          title: '正文(持续更新...)',
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
            '81vue-lexical-analysis',
            '82vue-parsing',
            '83vue-parsing-2',
            '84vue-codegen',
            '85vue-vdom',
            '86vue-vdom-patch'
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
            'compiler-options',
            'ast'
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
