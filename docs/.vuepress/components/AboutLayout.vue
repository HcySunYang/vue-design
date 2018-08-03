<template>
  <div class="container">
    <p class="protocol">本套文章采用 <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/deed.zh">署名-非商业性使用-禁止演绎 4.0 国际</a> 许可协议。</p>
    <div class="desc-box">
      <div class="desc-name">
        <img src="https://avatars2.githubusercontent.com/u/14146560">
        <p>作者</p>
      </div>
      <div class="desc-text">
        <p><span>大名：</span>HcySunYang</p>
        <p><span>小名：</span>人柱力</p>
        <p><span>职业：</span>无业游民</p>
        <p><a href="https://github.com/HcySunYang">Github</a><a href="http://hcysun.me">Blog</a><a href="https://www.zhihu.com/people/huo-chun-yang-77/activities">知乎</a><a href="http://weibo.com/5316956357">微博</a></p>
      </div>
    </div>
    <div class="desc-box">
      <div class="desc-name">
        <img src="https://avatars2.githubusercontent.com/u/7609249">
        <p>酱油</p>
      </div>
      <div class="desc-text">
        <p><span>大名：</span>zhangxiao</p>
        <p><span>小名：</span>peter</p>
        <p><span>职业：</span>美团小前端</p>
        <p><a href="https://github.com/zhang-xiao">Github</a><a href="http://varnull.cn">Blog</a><a href="https://www.zhihu.com/people/zhangxiaopeter/activities">知乎</a></p>
      </div>
    </div>
    <div class="desc-box">
      <div class="desc-name">
        <img :src="$withBase('/logo.png')">
        <p>团队</p>
      </div>
      <div class="desc-text">
        <p><span>大名：</span>美团外卖商业增值部的前端组</p>
        <p><span>小名：</span>WMADFE</p>
        <p><span>火热招聘中：</span>点击 <a href="https://m.zhipin.com/weijd/v2/job/3ec48e9afd5dc9281nNy39W-GVY~?aid=4504cda0d2b51aa93nVy3dm5&sid=wxs-152765366890566759&from=timeline&isappinstalled=0">JD</a></p>
      </div>
    </div>
  </div>
</template>
<style lang="stylus" scoped>
.container
  padding 40px 20px
  max-width 960px
  margin 0 auto
  .protocol
    margin-bottom 40px
  .desc-box
    display flex
    align-items center
    padding 20px
    box-shadow 0 2px 6px 0 #e3e7f6
    border-radius 4px
    &:not(:last-child)
      margin-bottom 40px
    .desc-text
      p
       margin 5px
       a
        padding-right 10px
        margin-right 10px
        &:not(:last-child)
          border-right 1px solid #e5e5e5
    .desc-name
      width 100px
      margin-right 20px
      padding 20px
      text-align center
      border-right 1px solid #e4e4e4
      img
        width 40px
        height 40px
        border-radius 20px
      p
        margin 0
</style>
