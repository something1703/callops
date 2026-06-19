package com.callops.app.telecom

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder.AudioSource
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Robust call audio recorder.
 *
 * Tries multiple AudioSources (VOICE_CALL, VOICE_COMMUNICATION, MIC) to bypass OS restrictions.
 * Automatically wraps recorded raw PCM bytes in a WAV container (.wav) so HTML5 players can play it natively.
 */
class CallAudioRecorder(private val cacheDir: File) {

    companion object {
        private const val TAG = "CallAudioRecorder"
        private const val SAMPLE_RATE = 8000   // 8kHz — voice quality, smaller files
        private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
        private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT
    }

    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private var tempPcmFile: File? = null
    private var outputFile: File? = null
    private var isRecording = false

    private val _isActive = MutableStateFlow(false)
    val isActive: StateFlow<Boolean> = _isActive.asStateFlow()

    fun start(callId: String) {
        tempPcmFile = File(cacheDir, "call_${callId}.temp.pcm")
        outputFile = File(cacheDir, "call_${callId}.wav")

        try {
            val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING)
            if (minBuffer == AudioRecord.ERROR_BAD_VALUE || minBuffer == AudioRecord.ERROR) {
                Log.w(TAG, "Cannot get min buffer size for AudioRecord")
                return
            }

            val sources = intArrayOf(
                AudioSource.VOICE_CALL,
                AudioSource.VOICE_COMMUNICATION,
                AudioSource.MIC
            )

            var recorder: AudioRecord? = null
            for (source in sources) {
                try {
                    @Suppress("MissingPermission")
                    val r = AudioRecord(
                        source,
                        SAMPLE_RATE,
                        CHANNEL,
                        ENCODING,
                        minBuffer * 4,
                    )
                    if (r.state == AudioRecord.STATE_INITIALIZED) {
                        recorder = r
                        Log.i(TAG, "AudioRecord initialized successfully with source: $source")
                        break
                    } else {
                        r.release()
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to initialize AudioRecord with source $source: ${e.message}")
                }
            }

            if (recorder == null) {
                Log.e(TAG, "All audio sources failed to initialize (VOICE_CALL / VOICE_COMMUNICATION / MIC blocked)")
                return
            }

            audioRecord = recorder
            recorder.startRecording()
            isRecording = true
            _isActive.value = true

            recordingThread = Thread({
                val buffer = ByteArray(minBuffer * 4)
                try {
                    tempPcmFile?.outputStream()?.buffered()?.use { out ->
                        while (isRecording) {
                            val read = recorder.read(buffer, 0, buffer.size)
                            if (read > 0) out.write(buffer, 0, read)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error writing raw PCM file", e)
                }
            }, "CallAudioRecorder").also { it.start() }

            Log.i(TAG, "Recording raw audio → ${tempPcmFile?.absolutePath}")

        } catch (e: SecurityException) {
            Log.w(TAG, "RECORD_AUDIO permission denied — no recording for this call", e)
        } catch (e: Exception) {
            Log.w(TAG, "Unexpected error starting recorder", e)
        }
    }

    /**
     * Stop recording, wrap PCM with a WAV header, and return the output file.
     */
    fun stop(): File? {
        isRecording = false
        _isActive.value = false
        try {
            recordingThread?.join(2000)
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping AudioRecord", e)
        }

        val pcm = tempPcmFile
        val wav = outputFile
        if (pcm != null && pcm.exists() && pcm.length() > 0 && wav != null) {
            Log.i(TAG, "Converting raw PCM to WAV container...")
            convertPcmToWav(pcm, wav)
            pcm.delete()
            return wav
        }

        return null
    }

    private fun convertPcmToWav(pcmFile: File, wavFile: File) {
        val totalAudioLen = pcmFile.length()
        val totalDataLen = totalAudioLen + 36
        val channels = 1
        val sampleRate = SAMPLE_RATE.toLong()
        val byteRate = sampleRate * channels * 2

        try {
            FileInputStream(pcmFile).use { input ->
                FileOutputStream(wavFile).use { output ->
                    writeWavHeader(output, totalAudioLen, totalDataLen, sampleRate, channels, byteRate)
                    val buffer = ByteArray(4096)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to convert PCM to WAV", e)
        }
    }

    private fun writeWavHeader(
        out: java.io.OutputStream,
        totalAudioLen: Long,
        totalDataLen: Long,
        longSampleRate: Long,
        channels: Int,
        byteRate: Long
    ) {
        val header = ByteArray(44)
        header[0] = 'R'.code.toByte() // RIFF
        header[1] = 'I'.code.toByte()
        header[2] = 'F'.code.toByte()
        header[3] = 'F'.code.toByte()
        header[4] = (totalDataLen and 0xff).toByte()
        header[5] = ((totalDataLen shr 8) and 0xff).toByte()
        header[6] = ((totalDataLen shr 16) and 0xff).toByte()
        header[7] = ((totalDataLen shr 24) and 0xff).toByte()
        header[8] = 'W'.code.toByte() // WAVE
        header[9] = 'A'.code.toByte()
        header[10] = 'V'.code.toByte()
        header[11] = 'E'.code.toByte()
        header[12] = 'f'.code.toByte() // 'fmt ' chunk
        header[13] = 'm'.code.toByte()
        header[14] = 't'.code.toByte()
        header[15] = ' '.code.toByte()
        header[16] = 16 // 4 bytes: size of 'fmt ' chunk
        header[17] = 0
        header[18] = 0
        header[19] = 0
        header[20] = 1 // format = 1 (PCM)
        header[21] = 0
        header[22] = channels.toByte()
        header[23] = 0
        header[24] = (longSampleRate and 0xff).toByte()
        header[25] = ((longSampleRate shr 8) and 0xff).toByte()
        header[26] = ((longSampleRate shr 16) and 0xff).toByte()
        header[27] = ((longSampleRate shr 24) and 0xff).toByte()
        header[28] = (byteRate and 0xff).toByte()
        header[29] = ((byteRate shr 8) and 0xff).toByte()
        header[30] = ((byteRate shr 16) and 0xff).toByte()
        header[31] = ((byteRate shr 24) and 0xff).toByte()
        header[32] = (channels * 2).toByte()
        header[33] = 0
        header[34] = 16 // bits per sample
        header[35] = 0
        header[36] = 'd'.code.toByte() // 'data' chunk
        header[37] = 'a'.code.toByte()
        header[38] = 't'.code.toByte()
        header[39] = 'a'.code.toByte()
        header[40] = (totalAudioLen and 0xff).toByte()
        header[41] = ((totalAudioLen shr 8) and 0xff).toByte()
        header[42] = ((totalAudioLen shr 16) and 0xff).toByte()
        header[43] = ((totalAudioLen shr 24) and 0xff).toByte()
        out.write(header, 0, 44)
    }
}
