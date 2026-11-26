package app.onionpod;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** Per-podcast speed and intro skip, copied from the web layer so queued episodes use them too. */
final class ShowSettings {
    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("show-settings", Context.MODE_PRIVATE);
    }

    static void save(Context context, JSONObject settings) {
        prefs(context).edit().putString("json", settings.toString()).apply();
    }

    private static JSONObject all(Context context) {
        try { return new JSONObject(prefs(context).getString("json", "{}")); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    private static JSONObject show(JSONObject settings, String feed) {
        JSONObject shows = settings.optJSONObject("shows");
        JSONObject show = shows == null ? null : shows.optJSONObject(feed);
        return show == null ? new JSONObject() : show;
    }

    static float rate(Context context, String feed) {
        JSONObject settings = all(context);
        double rate = show(settings, feed).optDouble("rate", settings.optDouble("defaultRate", 1));
        return (float) Math.max(0.5, Math.min(3, rate));
    }

    static long introMs(Context context, String feed) {
        return Math.max(0, Math.min(600, show(all(context), feed).optLong("intro", 0))) * 1000;
    }
}
