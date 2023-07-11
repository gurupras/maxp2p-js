<script lang="ts" setup>
// @ts-ignore
import { MaxP2P } from '@gurupras/maxp2p'
import { computed, ref } from 'vue';
import { SpeedCalculator } from '../speed-calculator'

const props = withDefaults(defineProps<{
  numConnections: number
  packetSize?: number,
  size: number,
  maxBufferedAmount?: number
}>(), {
  packetSize: 16384,
  size: 1 * 1024 * 1024 * 1024,
  maxBufferedAmount: 1 * 1024 * 1024
})

const received = ref<number>(0)
const running = ref<boolean>(false)

const realPacketSize = computed(() => props.packetSize - 80)

const progress = computed(() => {
  return (100 * received.value) / props.size
})

const speedCalculator = ref<SpeedCalculator>(new SpeedCalculator(500))

const onStart = async () => {
  received.value = 0
  running.value = true

  const pc1 = new MaxP2P('pc1', 'pc2', {
    sendICECandidate (dest: string, connectionID: string, candidate: RTCIceCandidate) {
      pc2.onICECandidate(connectionID, candidate)
    },
    sendSDP (dest: string, connectionID: string, sdp: RTCSessionDescription) {
      pc2.onOffer(connectionID, sdp)
    }
  }, null, props.maxBufferedAmount)

  const pc2 = new MaxP2P('pc1', 'pc2', {
    sendICECandidate(dest: string, connectionID: string, candidate: RTCIceCandidate) {
      pc1.onICECandidate(connectionID, candidate)
    },
    sendSDP(dest: string, connectionID: string, sdp: RTCSessionDescription) {
      pc1.onAnswer(connectionID, sdp)
    }
  }, null, props.maxBufferedAmount)

  pc2.onData ((data: Uint8Array) => {
    received.value += data.length
    speedCalculator.value.update(data.length)
    if (received.value === props.size) {
      running.value = false
      pc1.close()
      pc2.close()
      speedCalculator.value.summary()
    }
  })

  await pc1.start(props.numConnections)

  let sent = 0
  const bytes = new Uint8Array(Array.from({ length: realPacketSize.value }, () => Math.random() * 255 | 0))
  while (sent < props.size) {
    const chunkSize = Math.min(props.size - sent, realPacketSize.value)
    let chunkBytes = bytes
    if (chunkSize < bytes.length) {
      chunkBytes = bytes.subarray(0, chunkSize)
    }
    await pc1.send(chunkBytes)
    sent += chunkSize
  }

  console.log(pc1.stats())
  console.log(pc2.stats())
}
</script>

<template>
  <div>
    <button class="button is-primary" :disabled="running" @click="onStart">Start</button>

    <div v-show="running" class="columns">
      <div class="column is-10">
        <progress class="progress is-primary" :value="received === 0 ? 0 : progress" max="100"></progress>
      </div>
      <div class="column">
        <span>{{ speedCalculator.speed }}</span>
      </div>
    </div>
  </div>
</template>