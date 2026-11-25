package app.onionpod;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

final class SyncTransport {
    private final SharedPreferences prefs;

    SyncTransport(Context context) {
        prefs = context.getSharedPreferences("sync-session", Context.MODE_PRIVATE);
    }

    boolean hasSession() { return !prefs.getString("token", "").isEmpty(); }

    JSONArray uploadProgress(JSONArray events) throws Exception {
        JSONArray changes = new JSONArray();
        for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.getJSONObject(i);
            changes.put(new JSONObject().put("type", "progress").put("key", event.getString("key"))
                .put("at", event.getLong("at")).put("value", event.getDouble("position"))
                .put("episode", event.optJSONObject("episode")));
        }
        JSONObject response = request("exchange", new JSONObject().put("cursor", 0)
            .put("pushOnly", true).put("changes", changes));
        JSONArray acknowledged = new JSONArray();
        if (response.getInt("status") != 200) return acknowledged;
        JSONArray accepted = response.getJSONObject("body").getJSONArray("accepted");
        for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.getJSONObject(i);
            JSONObject record = accepted.getJSONObject(i);
            if (record.getString("key").equals(event.getString("key"))
                    && record.getLong("at") == event.getLong("at")
                    && record.getDouble("value") == event.getDouble("position")) acknowledged.put(event);
        }
        return acknowledged;
    }

    JSONObject request(String action, JSONObject data) throws Exception {
        if (!action.equals("session") && !action.equals("login")
                && !action.equals("exchange") && !action.equals("logout")) {
            throw new IllegalArgumentException("Unsupported sync operation.");
        }
        if (BuildConfig.SYNC_ORIGIN.isEmpty()) {
            return new JSONObject().put("status", action.equals("session") ? 200 : 503)
                .put("body", new JSONObject().put("enabled", false).put("signedIn", false));
        }
        String token = prefs.getString("token", "");
        HttpURLConnection connection = (HttpURLConnection) new URL(BuildConfig.SYNC_ORIGIN
            + "/api/sync/" + action).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(6500);
            connection.setReadTimeout(6500);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("X-OnionPod-Client", "android");
            if (!token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (!action.equals("session")) {
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setDoOutput(true);
                byte[] payload = data.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(payload.length);
                try (OutputStream output = connection.getOutputStream()) { output.write(payload); }
            }
            int status = connection.getResponseCode();
            JSONObject body = readBody(connection, status);
            if (status == 200 && action.equals("login")) {
                String session = body.getString("token");
                if (!session.matches("[A-Za-z0-9_-]{43}")) throw new IllegalStateException("Invalid sync session.");
                prefs.edit().putString("token", session).apply();
                body.remove("token");
            } else if ((status == 401 && !action.equals("login"))
                    || (status == 200 && (action.equals("logout") || action.equals("session") && !body.optBoolean("signedIn")))) {
                if (prefs.getString("token", "").equals(token)) prefs.edit().remove("token").apply();
            }
            return new JSONObject().put("status", status).put("body", body);
        } finally { connection.disconnect(); }
    }

    private static JSONObject readBody(HttpURLConnection connection, int status) throws Exception {
        String type = connection.getContentType();
        if (type == null || !type.startsWith("application/json")) return new JSONObject();
        InputStream source = status < 400 ? connection.getInputStream() : connection.getErrorStream();
        if (source == null) return new JSONObject();
        try (InputStream input = source; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (out.size() + count > 2_000_000) throw new IllegalStateException("The sync response is too large.");
                out.write(buffer, 0, count);
            }
            return new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
        }
    }
}
