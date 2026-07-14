#include <jni.h>
#include <cstring>
#include "react-native-arasan.h"

#define STR_SIZE 4096
static char conv_buffer[STR_SIZE + 1];
static char err_conv_buffer[STR_SIZE + 1];

extern "C" JNIEXPORT jdouble JNICALL
Java_com_gameexplorer_arasan_ArasanModule_main(JNIEnv *env, jclass type)
{
    return reactnativearasan::arasan_main();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_gameexplorer_arasan_ArasanModule_stdinWrite(JNIEnv *env, jclass type, jstring command)
{
    jboolean isCopy;
    const char *str = env->GetStringUTFChars(command, &isCopy);
    ssize_t result = reactnativearasan::arasan_stdin_write(str);
    env->ReleaseStringUTFChars(command, str);
    return result < 0 ? JNI_FALSE : JNI_TRUE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_gameexplorer_arasan_ArasanModule_stdoutRead(JNIEnv *env, jclass type)
{
    char *output = reactnativearasan::arasan_stdout_read();
    if (output == nullptr)
    {
        return nullptr;
    }
    std::strncpy(conv_buffer, output, STR_SIZE);
    conv_buffer[STR_SIZE] = 0;
    return env->NewStringUTF(conv_buffer);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_gameexplorer_arasan_ArasanModule_stderrRead(JNIEnv *env, jclass type)
{
    char *output = reactnativearasan::arasan_stderr_read();
    if (output == nullptr)
    {
        return nullptr;
    }
    std::strncpy(err_conv_buffer, output, STR_SIZE);
    err_conv_buffer[STR_SIZE] = 0;
    return env->NewStringUTF(err_conv_buffer);
}
