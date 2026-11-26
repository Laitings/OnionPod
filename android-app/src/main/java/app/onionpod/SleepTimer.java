package app.onionpod;

import android.os.SystemClock;

/** Shared by the activity and the playback service, which run in one process on the main thread. */
final class SleepTimer {
    private static long deadline;
    private static boolean atEnd;

    /** Minutes to play before pausing, 0 to cancel, or -1 to stop when the episode ends. */
    static void set(int minutes) {
        atEnd = minutes < 0;
        deadline = minutes > 0 ? SystemClock.elapsedRealtime() + minutes * 60_000L : 0;
    }

    /** Seconds left, -1 for end of episode, or 0 when off. */
    static long remaining() {
        if (atEnd) return -1;
        return deadline == 0 ? 0 : Math.max(1, (deadline - SystemClock.elapsedRealtime()) / 1000);
    }

    static boolean expire() {
        if (deadline == 0 || SystemClock.elapsedRealtime() < deadline) return false;
        deadline = 0;
        return true;
    }

    static boolean consumeEnd() {
        boolean stop = atEnd;
        atEnd = false;
        return stop;
    }
}
