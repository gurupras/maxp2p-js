<script lang="ts" setup>
import { computed, ref } from 'vue'
import Deferred from '@gurupras/deferred'
import { SpeedCalculator } from '../speed-calculator'

const props = withDefaults(defineProps<{
  packetSize?: number,
  size: number,
  maxBufferedAmount?: number
}>(), {
  packetSize: 16384,
  size: 1 * 1024 * 1024 * 1024,
  maxBufferedAmount: 1 * 1024 * 1024
})

const speedCalculator = ref<SpeedCalculator>(new SpeedCalculator(500))

const received = ref<number>(0)
const running = ref<boolean>(false)

const progress = computed(() => {
  return (100 * received.value) / props.size
})

const onStart = async () => {
  received.value = 0
  running.value = true

  const pc1 = new RTCPeerConnection()
  const dc1 = pc1.createDataChannel('dc')
  
  dc1.binaryType = 'arraybuffer'

  const dc1Ready = new Promise(resolve => {
    dc1.onopen = () => {
      resolve(dc1)
    }
  })

  const pc2 = new RTCPeerConnection()
  const dc2Ready = new Promise<RTCDataChannel>(resolve => {
    pc2.ondatachannel = e => {
      e.channel.binaryType = 'arraybuffer'
      e.channel.onopen = () => {
        resolve(e.channel)
      }
    }
  })

  pc1.onicecandidate = e => {
    if (e.candidate) {
      pc2.addIceCandidate(e.candidate!)
    }
  }
  pc2.onicecandidate = e => {
    if (e.candidate) {
      pc1.addIceCandidate(e.candidate!)
    }
  }

  const pc1Ready = new Promise<void>(resolve => {
    pc1.addEventListener('connectionstatechange', async function once (e) {
      if (pc1.connectionState === 'connected') {
        pc1.removeEventListener('connectionstatechange', once)
        await dc1Ready
        resolve()
      }
    })
  })

  const pc2Ready = new Promise<void>(resolve => {
    pc2.addEventListener('connectionstatechange', async function once(e) {
      if (pc2.connectionState === 'connected') {
        pc2.removeEventListener('connectionstatechange', once)
        await dc2Ready
        resolve()
      }
    })
  })

  const offer = await pc1.createOffer()
  await pc1.setLocalDescription(offer)
  await pc2.setRemoteDescription(offer)
  const answer = await pc2.createAnswer()
  await pc2.setLocalDescription(answer)
  await pc1.setRemoteDescription(answer)

  await Promise.all([pc1Ready, pc2Ready])

  const dc2 = await dc2Ready
  dc2.addEventListener('message', e => {
    const data = e.data as ArrayBuffer
    received.value += data.byteLength
    speedCalculator.value.update(data.byteLength)
    if (received.value === props.size) {
      running.value = false
      pc1.close()
      pc2.close()
      speedCalculator.value.summary()
    }
  })

  let drain: Deferred<void> | undefined
  dc1.onbufferedamountlow = () => {
    if (drain) {
      drain.resolve()
    }
  }

  let sent = 0
  const bytes = new Uint8Array(Array.from({ length: props.packetSize }, () => Math.random() * 255 | 0))
  while (sent < props.size) {
    const chunkSize = Math.min(props.size - sent, props.packetSize)
    let chunkBytes = bytes
    if (chunkSize < bytes.length) {
      chunkBytes = bytes.subarray(0, chunkSize)
    }
    dc1.send(chunkBytes)
    if (dc1.bufferedAmount > props.maxBufferedAmount) {
      drain = new Deferred()
      await drain
    }
    sent += chunkSize
  }
}
</script>

<template>
  <div>
    <button class="button is-primary" :disabled="running" @click="onStart">Start</button>

    <div v-show="running" class="columns">
      <div class="column is-11">
        <progress class="progress is-primary" :value="received === 0 ? 0 : progress" max="100"></progress>
      </div>
      <div class="column">
        <span>{{ speedCalculator.speed }}</span>
      </div>
    </div>
  </div>
</template>