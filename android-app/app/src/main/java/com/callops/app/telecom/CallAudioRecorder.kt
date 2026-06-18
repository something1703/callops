package com.callops.app.telecom

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder.AudioSource
import android.util.Log
import java.io.File

/**
 * Best-effort call audio recorder.
 *
 * AudioSource.VOICE_CALL is restricted on most Android 10+ devices.
 * This class tries it, catches any exception silently, and exposes
 * recordingFile = null if recording is not available — no crash, no missing call.
 *
 * The agent sees a small "Recording unavailable" chip on the in-call screen.
 */
class CallAudioRecorder(private val cacheDir: File) {

    companion object {
        private const val TAG = "CallAudioRecorder"
        private const val SAMPLE_RATE = 8000   // 8kHz — voice quality, smaller files
        private const val CHANNEL = android.media.AudioFormat.CHANNEL_IN_MONO
        private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT
    }

    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private var outputFile: File? = null
    private var isRecording = false

    /** True if recording successfully started on this device. */
    var isActive: Boolean = false
        private set

    fun start(callId: String) {
        val file = File(cacheDir, "call_${callId}.pcm")
        outputFile = file

        try {
            val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING)
            if (minBuffer == AudioRecord.ERROR_BAD_VALUE || minBuffer == AudioRecord.ERROR) {
                Log.w(TAG, "Cannot create AudioRecord — device does not support VOICE_CALL source")
                return
            }

            @Suppress("MissingPermission")
            val recorder = AudioRecord(
                AudioSource.VOICE_CALL,
                SAMPLE_RATE,
                CHANNEL,
                ENCODING,
                minBuffer * 4,
            )

            if (recorder.state != AudioRecord.STATE_INITIALIZED) {
                recorder.release()
                Log.w(TAG, "AudioRecord failed to initialise (VOICE_CALL source blocked)")
                return
            }

            audioRecord = recorder
            recorder.startRecording()
            isRecording = true
            isActive = true

            recordingThread = Thread({
                val buffer = ByteArray(minBuffer * 4)
                file.outputStream().buffered().use { out ->
                    while (isRecording) {
                        val read = recorder.read(buffer, 0, buffer.size)
                        if (read > 0) out.write(buffer, 0, read)
                    }
                }
            }, "CallAudioRecorder").also { it.start() }

            Log.i(TAG, "Recording started → ${file.absolutePath}")

        } catch (e: SecurityException) {
            Log.w(TAG, "RECORD_AUDIO permission denied — no recording for this call", e)
        } catch (e: IllegalStateException) {
            Log.w(TAG, "AudioRecord illegal state — VOICE_CALL source unavailable", e)
        } catch (e: Exception) {
            Log.w(TAG, "Unexpected error starting recorder", e)
        }
    }

    /**
     * Stop recording and return the output file, or null if recording was not active.
     */
    fun stop(): File? {
        isRecording = false
        isActive = false
        try {
            recordingThread?.join(2000)
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping AudioRecord", e)
        }
        return outputFile?.takeIf { it.exists() && it.length() > 0 }
    }
}
