<script setup lang="ts">
// This starter template is using Vue 3 <script setup> SFCs
// Check out https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup
import RTCPeerConnection from './components/RTCPeerConnection.vue'
import MaxP2P from './components/MaxP2P.vue'
import { ref } from 'vue';

const packetSize = 1024
const numMaxP2PConnections = 4
const transferSize = 0.1 * 1024 * 1024 * 1024
const maxBufferedAmount = 1 * 1024 * 1024
</script>

<template>
<div>
  <div class="container">
    <div class="section">
      <div class="columns">
        <div class="column">
          <h2 class="title is-2">RTCPeerConnection</h2>
          <RTCPeerConnection :packet-size="packetSize" :size="transferSize" :max-buffered-amount="maxBufferedAmount"/>
        </div>
  
        <div class="column">
          <h2 class="title is-2">MaxP2P ({{ numMaxP2PConnections }})</h2>
          <MaxP2P :num-connections="numMaxP2PConnections" :packet-size="packetSize" :size="transferSize" :max-buffered-amount="maxBufferedAmount"/>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<style lang="scss" scoped>
</style>
