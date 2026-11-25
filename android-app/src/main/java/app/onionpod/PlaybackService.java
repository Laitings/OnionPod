package app.onionpod;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionResult;
import androidx.media3.session.SessionError;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class PlaybackService extends MediaSessionService {
    static final SessionCommand LOAD_EPISODE = new SessionCommand("app.onionpod.LOAD_EPISODE", Bundle.EMPTY);
    private MediaSession session;
    private ExoPlayer player;
    private SyncTransport transport;
    private PlaybackQueue queue;
    private final ExecutorService syncIo = Executors.newSingleThreadExecutor();
    private boolean uploading;
    private long lastUpload;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable advance = this::advanceQueue;
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
        queue = new PlaybackQueue(this);
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
                    handler.post(advance);
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
        session = new MediaSession.Builder(this, player).setSessionActivity(open).setCallback(new MediaSession.Callback() {
            @OptIn(markerClass = UnstableApi.class)
            @Override public MediaSession.ConnectionResult onConnect(MediaSession session, MediaSession.ControllerInfo controller) {
                if (!controller.getPackageName().equals(getPackageName())) {
                    return MediaSession.Callback.super.onConnect(session, controller);
                }
                return new MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                    .setAvailableSessionCommands(MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS
                        .buildUpon().add(LOAD_EPISODE).build()).build();
            }

            @OptIn(markerClass = UnstableApi.class)
            @Override public ListenableFuture<SessionResult> onCustomCommand(MediaSession session,
                    MediaSession.ControllerInfo controller, SessionCommand command, Bundle args) {
                if (!LOAD_EPISODE.equals(command) || !controller.getPackageName().equals(getPackageName())) {
                    return Futures.immediateFuture(new SessionResult(SessionError.ERROR_PERMISSION_DENIED));
                }
                try {
                    JSONObject episode = EpisodeMedia.validate(new JSONObject(args.getString("episode", "")));
                    play(episode, args.getFloat("rate", 1f));
                    return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
                } catch (Exception error) {
                    return Futures.immediateFuture(new SessionResult(SessionError.ERROR_BAD_VALUE));
                }
            }
        }).build();
        handler.post(checkpoint);
    }

    private void saveProgress() {
        MediaItem item = player.getCurrentMediaItem();
        if (item != null && (player.getPlaybackState() == Player.STATE_READY || player.getPlaybackState() == Player.STATE_ENDED)) {
            long position = player.getPlaybackState() == Player.STATE_ENDED ? 0 : player.getCurrentPosition();
            PlaybackProgress.save(this, item.mediaId, position, EpisodeMedia.from(item));
        }
    }

    private void play(JSONObject episode, float rate) throws Exception {
        MediaItem item = EpisodeMedia.playable(this, episode);
        long position = PlaybackProgress.chooseResume(this, item.mediaId, episode);
        saveProgress();
        queue.remove(item.mediaId);
        player.setMediaItem(item, position);
        player.setPlaybackSpeed(rate);
        player.prepare();
        player.play();
    }

    private void advanceQueue() {
        if (player.getPlaybackState() != Player.STATE_ENDED || !player.getPlayWhenReady()) return;
        try {
            JSONObject next = queue.first();
            if (next != null) play(next, player.getPlaybackParameters().speed);
        } catch (Exception error) {
            android.util.Log.w("OnionPod", "Could not start the next queued episode.", error);
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
        handler.removeCallbacks(advance);
        saveProgress();
        flushProgress();
        session.release();
        player.release();
        syncIo.shutdown();
        super.onDestroy();
    }
}
