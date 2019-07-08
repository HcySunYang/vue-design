const { resolve } = require('path')

module.exports = {
  base: '/vue-design/',
  locales: {
    '/': {
      lang: 'en-US',
      title: 'renderer',
      description: 'Detailed renderer'
    },
    '/zh/': {
      lang: 'zh-CN',
      title: '渲染器',
      description: '也许是讲渲染器相关内容中最细最全的了吧'
    }
  },
  themeConfig: {
    displayAllHeaders: true,
    sidebarDepth: 2,
    locales: {
      '/': {
        label: 'English',
        sidebar: [
          '/'
        ]
      },
      '/zh/': {
        label: '简体中文',
        editLinkText: '在 GitHub 上编辑此页',
        sidebar: [
          ['/zh/essence-of-comp', '组件的本质'],
          ['/zh/vnode', '先设计 VNode 吧'],
          ['/zh/h', '辅助创建 VNode 的 h 函数'],
          ['/zh/renderer', '渲染器之挂载'],
          ['/zh/renderer-patch', '渲染器之patch'],
          ['/zh/renderer-diff', '渲染器的核心 Diff 算法'],
          ['/zh/renderer-advanced', '自定义渲染器']
          // ['/zh/stateful-component', '有状态组件的设计'],
          // ['/zh/observer', '基于 Proxy 的响应系统'],
          // ['/zh/component-expand', '组件的拓展']
        ],
        nav: [
          { text: '捐赠者名单', link: '/zh/donor-list' },
        ]
      }
    },
    repo: 'HcySunYang/vue-design',
    docsDir: 'docs',
    editLinks: true,
    sidebar: 'auto'
  },
  configureWebpack: {
    resolve: {
      alias: {
        '@as': resolve(__dirname, './assets'),
        '@imgs': resolve(__dirname, './assets/imgs')
      }
    }
  }
}
