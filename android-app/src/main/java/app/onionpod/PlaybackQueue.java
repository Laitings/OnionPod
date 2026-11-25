package app.onionpod;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class PlaybackQueue {
    private final SharedPreferences prefs;

    PlaybackQueue(Context context) {
        prefs = context.getSharedPreferences("playback-queue", Context.MODE_PRIVATE);
    }

    int revision() { return prefs.getInt("revision", 0); }

    private JSONArray items() throws JSONException { return new JSONArray(prefs.getString("items", "[]")); }

    JSONObject snapshot() throws JSONException {
        return new JSONObject().put("revision", revision()).put("items", items());
    }

    JSONObject first() throws JSONException { return items().optJSONObject(0); }

    void remove(String key) throws JSONException {
        JSONArray items = items();
        int index = indexOf(items, key);
        if (index >= 0) {
            items.remove(index);
            save(items);
        }
    }

    JSONObject edit(JSONObject command) throws Exception {
        JSONArray items = items();
        switch (command.getString("op")) {
            case "initialize":
                if (prefs.contains("items")) break;
                JSONArray legacy = command.getJSONArray("items");
                for (int i = 0; i < legacy.length(); i++) {
                    JSONObject episode = legacy.optJSONObject(i);
                    if (episode == null) continue;
                    try { append(items, EpisodeMedia.validate(episode)); }
                    catch (Exception ignored) { /* An unusable legacy entry does not block migration. */ }
                }
                save(items);
                break;
            case "add":
                if (append(items, EpisodeMedia.validate(command.getJSONObject("episode")))) save(items);
                break;
            case "remove":
                remove(command.getString("key"));
                break;
            case "move-up":
                int index = indexOf(items, command.getString("key"));
                if (index > 0) {
                    JSONObject previous = items.getJSONObject(index - 1);
                    items.put(index - 1, items.getJSONObject(index));
                    items.put(index, previous);
                    save(items);
                }
                break;
            default: throw new IllegalArgumentException("Unknown queue operation.");
        }
        return snapshot();
    }

    private boolean append(JSONArray items, JSONObject episode) throws JSONException {
        if (indexOf(items, episode.getString("key")) >= 0) return false;
        items.put(episode);
        return true;
    }

    private int indexOf(JSONArray items, String key) throws JSONException {
        for (int i = 0; i < items.length(); i++) {
            if (items.getJSONObject(i).getString("key").equals(key)) return i;
        }
        return -1;
    }

    private void save(JSONArray items) {
        prefs.edit().putString("items", items.toString()).putInt("revision", revision() + 1).apply();
    }
}
