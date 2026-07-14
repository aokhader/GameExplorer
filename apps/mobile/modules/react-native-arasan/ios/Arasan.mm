// iOS side of react-native-arasan. Mirrors the Android module: engine on a
// background thread, blocking reader threads draining the native line queues
// (no polling timers). NOT yet device-tested — first exercised at the EAS iOS
// build milestone.
#import <React/RCTLog.h>
#import <Foundation/Foundation.h>
#import "Arasan.h"

@implementation Arasan {
    NSThread *engineThread;
}

RCT_EXPORT_MODULE(Arasan);

- (NSArray<NSString *> *)supportedEvents {
    return @[@"arasan-output", @"arasan-error"];
}

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

RCT_EXPORT_METHOD(setupNetwork:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    // Bundle resources are readable in place on iOS — resolve the path only.
    NSString *path = [[NSBundle mainBundle] pathForResource:@"arasanv8-20260622"
                                                     ofType:@"nnue"];
    if (path == nil) {
        // Pod resources may land in the pod's resource bundle instead.
        NSBundle *podBundle = [NSBundle bundleForClass:[self class]];
        path = [podBundle pathForResource:@"arasanv8-20260622" ofType:@"nnue"];
    }
    if (path != nil) {
        resolve(path);
    } else {
        reject(@"E_ARASAN_NETWORK", @"NNUE network not found in app bundle", nil);
    }
}

RCT_EXPORT_METHOD(startEngine) {
    if (engineThread && engineThread.isExecuting) {
        RCTLogInfo(@"Arasan is already running. Ignoring start request.");
        return;
    }

    engineThread = [[NSThread alloc] initWithTarget:self
                                           selector:@selector(runEngine)
                                             object:nil];
    engineThread.stackSize = 4 * 1024 * 1024;
    [engineThread start];

    [NSThread detachNewThreadSelector:@selector(drainStdout) toTarget:self withObject:nil];
    [NSThread detachNewThreadSelector:@selector(drainStderr) toTarget:self withObject:nil];
}

- (void)runEngine {
    @autoreleasepool {
        reactnativearasan::arasan_main();
    }
}

- (void)drainStdout {
    for (;;) {
        char *output = reactnativearasan::arasan_stdout_read(); // blocks
        if (output == nullptr) return;
        NSString *line = @(output);
        dispatch_async(dispatch_get_main_queue(), ^{
            [self sendEventWithName:@"arasan-output" body:line];
        });
    }
}

- (void)drainStderr {
    for (;;) {
        char *output = reactnativearasan::arasan_stderr_read(); // blocks
        if (output == nullptr) return;
        NSString *line = @(output);
        dispatch_async(dispatch_get_main_queue(), ^{
            [self sendEventWithName:@"arasan-error" body:line];
        });
    }
}

RCT_EXPORT_METHOD(sendCommand:(NSString *)command) {
    reactnativearasan::arasan_stdin_write([command UTF8String]);
}

@end
