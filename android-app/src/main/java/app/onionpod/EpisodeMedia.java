package app.onionpod;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

final class EpisodeMedia {
    private static final String EPISODE = "onionpod.episode";

    static JSONObject from(MediaItem item) {
        Bundle extras = item == null ? null : item.mediaMetadata.extras;
        if (extras == null) return null;
        try { return new JSONObject(extras.getString(EPISODE, "")); }
        catch (Exception ignored) { return null; }
    }

    static JSONObject validate(JSONObject data) throws Exception {
        String key = data.getString("key");
        JSONArray identity = new JSONArray(key);
        String feed = data.getString("feed");
        if (identity.length() != 2 || !identity.getString(0).equals(feed) || identity.getString(1).isEmpty()) {
            throw new IllegalArgumentException("Invalid episode identity.");
        }
        publicUrl(feed);
        publicUrl(data.getString("audio"));
        JSONObject episode = new JSONObject().put("key", key).put("feed", feed).put("audio", data.getString("audio"))
            .put("title", clipped(data.optString("title", "Untitled episode"), 300))
            .put("show", clipped(data.optString("show", "Podcast"), 200))
            .put("artwork", clipped(data.optString("artwork"), 2048)).put("date", clipped(data.optString("date"), 100));
        if (data.has("resume")) episode.put("resume", data.getDouble("resume"));
        if (data.has("resumeAt")) episode.put("resumeAt", data.getLong("resumeAt"));
        return episode;
    }

    static MediaItem playable(Context context, JSONObject episode) throws Exception {
        String key = episode.getString("key");
        long id = context.getSharedPreferences("downloads", Context.MODE_PRIVATE).getLong(key, -1);
        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        Uri downloaded = id < 0 ? null : manager.getUriForDownloadedFile(id);
        Bundle extras = new Bundle();
        extras.putString(EPISODE, episode.toString());
        MediaMetadata.Builder metadata = new MediaMetadata.Builder().setTitle(episode.getString("title"))
            .setArtist(episode.getString("show")).setExtras(extras);
        return new MediaItem.Builder().setMediaId(key)
            .setUri(downloaded == null ? Uri.parse(publicUrl(episode.getString("audio")).toString()) : downloaded)
            .setMediaMetadata(metadata.build()).build();
    }

    private static URL publicUrl(String value) throws Exception {
        URL url = new URL(value);
        if (!"https".equals(url.getProtocol()) || url.getHost().isEmpty() || url.getUserInfo() != null
                || (url.getPort() != -1 && url.getPort() != 443)) throw new IllegalArgumentException("Use an HTTPS episode URL.");
        return url;
    }

    private static String clipped(String value, int size) { return value.substring(0, Math.min(size, value.length())); }
}
