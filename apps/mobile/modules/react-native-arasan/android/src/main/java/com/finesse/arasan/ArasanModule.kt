package com.finesse.arasan

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule

import kotlinx.coroutines.*
import java.io.File

@ReactModule(name = ArasanModule.NAME)
class ArasanModule(reactContext: ReactApplicationContext) :
  NativeArasanSpec(reactContext) {

  private val engineScope = CoroutineScope(Dispatchers.Default)
  // Readers BLOCK in JNI on the native line queues (no polling delay — unlike
  // the Stockfish wrapper this was forked from, which polled one line per
  // 100ms and made the UCI handshake take seconds). Dispatchers.IO tolerates
  // long-blocked threads.
  private val readerScope = CoroutineScope(Dispatchers.IO)

  external fun main()
  external fun stdoutRead(): String?
  external fun stderrRead(): String?
  external fun stdinWrite(command: String)

  override fun getName(): String {
    return NAME
  }

  init {
    System.loadLibrary("react-native-arasan")
  }

  override fun setupNetwork(promise: Promise) {
    readerScope.launch {
      try {
        val target = File(reactApplicationContext.filesDir, NETWORK_ASSET)
        val assetSize = reactApplicationContext.assets.open(NETWORK_ASSET).use { input ->
          input.available().toLong()
        }
        if (!target.exists() || target.length() != assetSize) {
          reactApplicationContext.assets.open(NETWORK_ASSET).use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
          }
        }
        promise.resolve(target.absolutePath)
      } catch (e: Exception) {
        promise.reject("E_ARASAN_NETWORK", "Failed to install NNUE network: ${e.message}", e)
      }
    }
  }

  override fun startEngine() {
    engineScope.launch {
      delay(100L)
      main()
    }
    readerScope.launch {
      while (isActive) {
        val output = stdoutRead() ?: break // null = stream closed for good
        emit("arasan-output", output)
      }
    }
    readerScope.launch {
      while (isActive) {
        val output = stderrRead() ?: break
        emit("arasan-error", output)
      }
    }
  }

  override fun sendCommand(command: String) {
    stdinWrite(command)
  }

  private fun emit(event: String, payload: String) {
    try {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, payload)
    } catch (_: Exception) {
      // React instance torn down — drop the line rather than crash the reader.
    }
  }

  companion object {
    const val NAME = "Arasan"
    const val NETWORK_ASSET = "arasanv8-20260622.nnue"
  }
}
