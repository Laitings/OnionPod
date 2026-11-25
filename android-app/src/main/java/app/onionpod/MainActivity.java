package app.onionpod;

import android.app.DownloadManager;
import android.content.ComponentName;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Environment;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import androidx.media3.session.SessionResult;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends ComponentActivity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private final ExecutorService io = Executors.newFixedThreadPool(2);
    private final ExecutorService syncIo = Executors.newSingleThreadExecutor();
    private SyncTransport syncTransport;
    private PlaybackQueue queue;
    private ListenableFuture<MediaController> controllerFuture;
    private MediaController player;
    private WebView view;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        syncTransport = new SyncTransport(this);
        queue = new PlaybackQueue(this);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/app/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
                && WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
                @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return assets.shouldInterceptRequest(request.getUrl());
                }
            });
        }
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(21, 23, 19));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((element, insets) -> {
                android.graphics.Insets edges = insets.getInsets(android.view.WindowInsets.Type.systemBars()
                    | android.view.WindowInsets.Type.displayCutout() | android.view.WindowInsets.Type.ime());
                element.setPadding(edges.left, edges.top, edges.right, edges.bottom);
                return android.view.WindowInsets.CONSUMED;
            });
        }
        view = new WebView(this);
        view.setBackgroundColor(Color.rgb(17, 19, 16));
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView web, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) {
                return !request.getUrl().toString().equals(ORIGIN + "/app/index.html");
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(view, "OnionNative", java.util.Collections.singleton(ORIGIN),
                (web, message, origin, main, reply) -> {
                    if (!main) return;
                    try {
                        JSONObject input = new JSONObject(message.getData());
                        if (input.optString("action").equals("load")) {
                            loadEpisode(input, reply);
                            return;
                        }
                        Runnable handle = () -> {
                            JSONObject result = new JSONObject();
                            try {
                                result.put("id", input.getInt("id"));
                                result.put("value", execute(input));
                            } catch (Exception error) {
                                try { result.put("error", error.getMessage() == null ? "Android operation failed." : error.getMessage()); }
                                catch (Exception ignored) { }
                            }
                            runOnUiThread(() -> { if (!isDestroyed()) reply.postMessage(result.toString()); });
                        };
                        String action = input.optString("action");
                        if (action.equals("fetch")) io.execute(handle);
                        else if (action.startsWith("sync-")) syncIo.execute(handle);
                        else handle.run();
                    } catch (Exception ignored) { }
                });
        }
        controllerFuture = new MediaController.Builder(this,
            new SessionToken(this, new ComponentName(this, PlaybackService.class))).buildAsync();
        controllerFuture.addListener(() -> {
            try { player = controllerFuture.get(); } catch (Exception ignored) { }
        }, command -> runOnUiThread(command));
        root.addView(view, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        root.requestApplyInsets();
        view.loadUrl(ORIGIN + "/app/index.html");
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (view.canGoBack()) view.goBack();
                else if (!moveTaskToBack(false)) finish();
            }
        });
    }

    private void loadEpisode(JSONObject input, JavaScriptReplyProxy reply) throws Exception {
        int id = input.getInt("id");
        if (player == null) {
            reply.postMessage(new JSONObject().put("id", id).put("error", "The Android player is still connecting.").toString());
            return;
        }
        JSONObject data = input.getJSONObject("data");
        Bundle args = new Bundle();
        args.putString("episode", data.toString());
        args.putFloat("rate", (float) data.getDouble("rate"));
        ListenableFuture<SessionResult> command = player.sendCustomCommand(PlaybackService.LOAD_EPISODE, args);
        command.addListener(() -> {
            if (isDestroyed()) return;
            try {
                JSONObject result = new JSONObject().put("id", id);
                if (command.get().resultCode == SessionResult.RESULT_SUCCESS) result.put("value", queue.snapshot());
                else result.put("error", "Android could not open this episode.");
                reply.postMessage(result.toString());
            } catch (Exception ignored) { }
        }, commandResult -> runOnUiThread(commandResult));
    }

    private Object execute(JSONObject request) throws Exception {
        String action = request.getString("action");
        JSONObject data = request.getJSONObject("data");
        if (action.startsWith("sync-")) return syncTransport.request(action.substring(5), data);
        if (action.equals("local-progress")) return PlaybackProgress.pending(this);
        if (action.equals("played-episodes")) {
            JSONArray keys = data.getJSONArray("keys");
            JSONArray played = new JSONArray();
            for (int index = 0; index < keys.length(); index++) {
                String key = keys.getString(index);
                if (PlaybackProgress.time(this, key) > 0) played.put(key);
            }
            return played;
        }
        if (action.equals("local-progress-ack")) {
            PlaybackProgress.acknowledge(this, data.getJSONArray("events"));
            return true;
        }
        if (action.equals("queue")) return queue.edit(data);
        if (action.equals("fetch")) return fetch(data.getString("url"));
        if (action.equals("download") || action.equals("offline") || action.equals("remove")) {
            return downloads(action, data);
        }
        if (player == null) throw new IllegalStateException("The Android player is still connecting.");
        switch (action) {
            case "toggle":
                if (player.getPlayWhenReady() && player.getPlaybackState() != Player.STATE_ENDED) player.pause();
                else {
                    MediaItem current = player.getCurrentMediaItem();
                    if (current != null && data.has("resume") && data.optLong("resumeAt", 0) > PlaybackProgress.time(this, current.mediaId)) {
                        player.seekTo(PlaybackProgress.chooseResume(this, current.mediaId, data));
                    } else if (player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0);
                    player.play();
                }
                return true;
            case "seek": player.seekTo(Math.max(0, (long) (data.getDouble("position") * 1000))); return true;
            case "rate": player.setPlaybackSpeed((float) data.getDouble("rate")); return true;
            case "status":
                MediaItem active = player.getCurrentMediaItem();
                JSONObject status = new JSONObject().put("key", active == null ? "" : active.mediaId)
                    .put("episode", EpisodeMedia.from(active))
                    .put("at", active == null ? 0 : PlaybackProgress.time(this, active.mediaId))
                    .put("duration", player.getDuration() == C.TIME_UNSET ? 0 : player.getDuration() / 1000.0)
                    .put("position", player.getCurrentPosition() / 1000.0)
                    .put("started", player.isPlaying())
                    .put("playing", player.getPlayWhenReady() && player.getPlaybackState() != Player.STATE_ENDED && player.getPlayerError() == null)
                    .put("ended", player.getPlaybackState() == Player.STATE_ENDED)
                    .put("error", player.getPlayerError() == null ? "" : "This episode could not be played.");
                if (queue.revision() != data.optInt("queueRevision", -1)) status.put("queue", queue.snapshot());
                String previousKey = data.optString("previousKey");
                if (active != null && !previousKey.isEmpty() && !previousKey.equals(active.mediaId)) {
                    status.put("previousPosition", PlaybackProgress.position(this, previousKey) / 1000.0);
                }
                return status;
            default: throw new IllegalArgumentException("Unsupported operation.");
        }
    }

    private SharedPreferences files() { return getSharedPreferences("downloads", MODE_PRIVATE); }
    private DownloadManager manager() { return (DownloadManager) getSystemService(DOWNLOAD_SERVICE); }
    private long downloadId(String key) { return files().getLong(key, -1); }

    private int downloadStatus(long id) {
        if (id < 0) return 0;
        try (Cursor cursor = manager().query(new DownloadManager.Query().setFilterById(id))) {
            return cursor != null && cursor.moveToFirst()
                ? cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) : 0;
        }
    }

    private Uri offlineUri(long id) {
        return id < 0 ? null : manager().getUriForDownloadedFile(id);
    }

    private String downloads(String action, JSONObject data) throws Exception {
        String key = data.getString("key");
        long id = downloadId(key);
        if (action.equals("remove")) {
            if (id >= 0) manager().remove(id);
            files().edit().remove(key).apply();
            return "none";
        }
        int status = downloadStatus(id);
        if (action.equals("download") && (status == 0 || status == DownloadManager.STATUS_FAILED)) {
            if (id >= 0) manager().remove(id);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(https(data.getString("audio")).toString()))
                .setTitle(data.getString("title")).setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_PODCASTS, UUID.randomUUID() + ".audio");
            files().edit().putLong(key, manager().enqueue(request)).apply();
            return "pending";
        }
        if (status == DownloadManager.STATUS_SUCCESSFUL) return "ready";
        if (status == DownloadManager.STATUS_FAILED) return "failed";
        return status == 0 ? "none" : "pending";
    }

    private static URL https(String value) throws Exception {
        URL address = new URL(value);
        if (!"https".equals(address.getProtocol()) || address.getHost().isEmpty()
                || address.getUserInfo() != null || (address.getPort() != -1 && address.getPort() != 443)) {
            throw new IllegalArgumentException("Use a public HTTPS address.");
        }
        return address;
    }

    private static JSONObject fetch(String value) throws Exception {
        URL url = https(value);
        for (int redirects = 0; redirects <= 4; redirects++) {
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            try {
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(7000);
                connection.setReadTimeout(7000);
                connection.setRequestProperty("User-Agent", "OnionPod/0.1");
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400 && connection.getHeaderField("Location") != null) {
                    url = https(new URL(url, connection.getHeaderField("Location")).toString());
                    continue;
                }
                if (status != 200) throw new IllegalStateException("The feed host returned HTTP " + status + ".");
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (out.size() + count > 10_000_000) throw new IllegalStateException("This feed is too large.");
                        out.write(buffer, 0, count);
                    }
                    return new JSONObject().put("url", url.toString()).put("body", new String(out.toByteArray(), StandardCharsets.UTF_8));
                }
            } finally { connection.disconnect(); }
        }
        throw new IllegalStateException("The feed redirected too many times.");
    }

    @Override public void onDestroy() {
        MediaController.releaseFuture(controllerFuture);
        io.shutdownNow();
        syncIo.shutdownNow();
        view.destroy();
        super.onDestroy();
    }
}
