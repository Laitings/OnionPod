package app.onionpod;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;

public final class PlaybackService extends MediaSessionService {
    private MediaSession session;
    private ExoPlayer player;
    private SyncTransport transport;
    private final ExecutorService syncIo = Executors.newSingleThreadExecutor();
    private boolean uploading;
    private long lastUpload;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable checkpoint = new Runnable() {
        @Override public void run() {
            saveProgress();
            if (SystemClock.elapsedRealtime() - lastUpload >= 20_000) flushProgress();
            handler.postDelayed(this, 3000);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        transport = new SyncTransport(this);
        player = new ExoPlayer.Builder(this).setSeekBackIncrementMs(15000)
            .setSeekForwardIncrementMs(30000).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.addListener(new Player.Listener() {
            @Override public void onIsPlayingChanged(boolean playing) {
                saveProgress();
                if (!playing) flushProgress();
            }
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    saveProgress();
                    flushProgress();
                }
            }
            @Override public void onPositionDiscontinuity(Player.PositionInfo previous,
                    Player.PositionInfo current, int reason) {
                if (reason == Player.DISCONTINUITY_REASON_SEEK) saveProgress();
            }
        });
        PendingIntent open = PendingIntent.getActivity(this, 0,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, player).setSessionActivity(open).build();
        handler.post(checkpoint);
    }

    private void saveProgress() {
        MediaItem item = player.getCurrentMediaItem();
        if (item != null && (player.getPlaybackState() == Player.STATE_READY || player.getPlaybackState() == Player.STATE_ENDED)) {
            long position = player.getPlaybackState() == Player.STATE_ENDED ? 0 : player.getCurrentPosition();
            PlaybackProgress.save(this, item.mediaId, position);
        }
    }

    private void flushProgress() {
        if (uploading || !transport.hasSession()) return;
        lastUpload = SystemClock.elapsedRealtime();
        try {
            JSONArray events = PlaybackProgress.pending(this);
            if (events.length() == 0) return;
            uploading = true;
            syncIo.execute(() -> {
                try {
                    JSONArray accepted = transport.uploadProgress(events);
                    handler.post(() -> {
                        try { PlaybackProgress.acknowledge(this, accepted); }
                        catch (JSONException ignored) { /* Keep pending on disk. */ }
                    });
                } catch (Exception ignored) { /* Keep pending until connectivity returns. */ }
                finally { handler.post(() -> uploading = false); }
            });
        } catch (JSONException ignored) { /* Keep pending on disk. */ }
    }

    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(checkpoint);
        saveProgress();
        flushProgress();
        session.release();
        player.release();
        syncIo.shutdown();
        super.onDestroy();
    }
}
