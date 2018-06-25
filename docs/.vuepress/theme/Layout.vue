<template>
  <Layout>
    <div slot="sidebar-top">
      <ins class="adsbygoogle"
        style="display:block;box-sizing:border-box;width:100%;height:120px;margin:10px auto 0;"
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
    }, 1000)
  }
}
</script>
