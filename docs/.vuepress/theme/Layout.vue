<template>
  <Layout>
    <div slot="sidebar-top">
      <ins class="adsbygoogle"
        style="display:inline-block;width:100%;height:120px"
        data-ad-client="ca-pub-4613560834313397"
        data-ad-slot="2465217753">
      </ins>
    </div>
  </Layout>
</template>

<script>
import Layout from '@default-theme/Layout.vue'

export default {
  components: {
    Layout,
  },
  mounted() {
    setTimeout(() => {
      const adsbygoogle = window.adsbygoogle || []
      adsbygoogle.push({})
    }, 0)
  }
}
</script>
<style lang="stylus">
.google-ads
  width 100%
  height 120px
  padding 1.5rem 1.5rem 0
  margin-bottom -.5rem
  font-size .75rem
</style>