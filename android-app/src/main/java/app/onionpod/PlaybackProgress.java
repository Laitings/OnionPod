package app.onionpod;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class PlaybackProgress {
    private static final String AT = "at:";
    private static final String PENDING = "pending:";
    private static final String EPISODE = "episode:";

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("progress", Context.MODE_PRIVATE);
    }

    static long position(Context context, String key) { return prefs(context).getLong(key, 0); }
    static long time(Context context, String key) { return prefs(context).getLong(AT + key, 0); }

    static void save(Context context, String key, long position, JSONObject episode) {
        SharedPreferences prefs = prefs(context);
        if (prefs.getLong(key, 0) == position) return;
        long at = Math.max(System.currentTimeMillis(), prefs.getLong(AT + key, 0) + 1);
        SharedPreferences.Editor edit = prefs.edit().putLong(key, position).putLong(AT + key, at)
            .putBoolean(PENDING + key, true);
        if (episode != null) edit.putString(EPISODE + key, episode.toString());
        edit.apply();
    }

    static JSONArray pending(Context context) throws JSONException {
        Map<String, ?> snapshot = prefs(context).getAll();
        JSONArray events = new JSONArray();
        for (String entry : snapshot.keySet()) {
            if (!entry.startsWith(PENDING) || !Boolean.TRUE.equals(snapshot.get(entry))) continue;
            String key = entry.substring(PENDING.length());
            JSONObject event = new JSONObject().put("key", key)
                .put("at", ((Number) snapshot.get(AT + key)).longValue())
                .put("position", ((Number) snapshot.get(key)).longValue() / 1000.0);
            if (snapshot.get(EPISODE + key) instanceof String) {
                try { event.put("episode", new JSONObject((String) snapshot.get(EPISODE + key))); }
                catch (JSONException ignored) { /* Position still syncs without metadata. */ }
            }
            events.put(event);
            if (events.length() == 50) break;
        }
        return events;
    }

    static void acknowledge(Context context, JSONArray events) throws JSONException {
        SharedPreferences prefs = prefs(context);
        SharedPreferences.Editor edit = prefs.edit();
        for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.getJSONObject(i);
            String key = event.getString("key");
            if (prefs.getLong(AT + key, 0) == event.getLong("at")) edit.remove(PENDING + key);
        }
        edit.apply();
    }

    static long chooseResume(Context context, String key, JSONObject data) {
        long local = position(context, key);
        long localAt = time(context, key);
        long remoteAt = data.optLong("resumeAt", 0);
        long remote = Math.max(0, (long) (data.optDouble("resume", 0) * 1000));
        if (data.has("resume") && (remoteAt > localAt || (remoteAt == 0 && localAt == 0 && remote > local))) {
            return remote;
        }
        return local;
    }
}
