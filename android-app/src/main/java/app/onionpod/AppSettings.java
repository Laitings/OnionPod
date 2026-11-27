package app.onionpod;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** Skip and rewind lengths chosen in Settings, copied from the web layer so the playback service can read them. */
final class AppSettings {
    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("app-settings", Context.MODE_PRIVATE);
    }

    static void save(Context context, JSONObject settings) {
        prefs(context).edit()
            .putInt("skipBack", clamp(settings.optInt("skipBack", 15), 5, 60))
            .putInt("skipForward", clamp(settings.optInt("skipForward", 30), 10, 90))
            .putInt("disconnectRewind", clamp(settings.optInt("disconnectRewind", 15), 0, 60))
            .putInt("callRewind", clamp(settings.optInt("callRewind", 5), 0, 30))
            .apply();
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    static long skipBackMs(Context context) { return prefs(context).getInt("skipBack", 15) * 1000L; }
    static long skipForwardMs(Context context) { return prefs(context).getInt("skipForward", 30) * 1000L; }
    static long disconnectRewindMs(Context context) { return prefs(context).getInt("disconnectRewind", 15) * 1000L; }
    static long callRewindMs(Context context) { return prefs(context).getInt("callRewind", 5) * 1000L; }
}
