package app.onionpod;

import android.app.PendingIntent;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
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
    private boolean heldForCall;
    // The audio mode can change just after focus is lost, so it is checked for as long as playback is held.
    private final Runnable watchForCall = new Runnable() {
        @Override public void run() {
            if (player.getPlaybackSuppressionReason() != Player.PLAYBACK_SUPPRESSION_REASON_TRANSIENT_AUDIO_FOCUS_LOSS) return;
            // Ringing, phone calls, and internet calls all leave the normal mode. Alerts do not.
            if (getSystemService(AudioManager.class).getMode() != AudioManager.MODE_NORMAL) heldForCall = true;
            handler.postDelayed(this, 500);
        }
    };
    private final Runnable checkpoint = new Runnable() {
        @Override public void run() {
            if (SleepTimer.expire()) player.pause();
            saveProgress();
            if (SystemClock.elapsedRealtime() - lastUpload >= 20_000) flushProgress();
            handler.postDelayed(this, 3000);
        }
    };

    @OptIn(markerClass = UnstableApi.class)
    @Override public void onCreate() {
        super.onCreate();
        transport = new SyncTransport(this);
        queue = new PlaybackQueue(this);
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.addListener(new Player.Listener() {
            @Override public void onPlayWhenReadyChanged(boolean ready, int reason) {
                if (!ready && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY) {
                    rewind(AppSettings.disconnectRewindMs(PlaybackService.this));
                }
            }
            @Override public void onPlaybackSuppressionReasonChanged(int reason) {
                handler.removeCallbacks(watchForCall);
                if (reason == Player.PLAYBACK_SUPPRESSION_REASON_TRANSIENT_AUDIO_FOCUS_LOSS) handler.post(watchForCall);
                else if (heldForCall && reason == Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
                    heldForCall = false;
                    rewind(AppSettings.callRewindMs(PlaybackService.this));
                }
            }
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
        // Headset, notification, and car controls skip by the lengths chosen in Settings.
        Player controls = new ForwardingPlayer(player) {
            @Override public long getSeekBackIncrement() { return AppSettings.skipBackMs(PlaybackService.this); }
            @Override public long getSeekForwardIncrement() { return AppSettings.skipForwardMs(PlaybackService.this); }
            @Override public void seekBack() { seekTo(Math.max(0, getCurrentPosition() - getSeekBackIncrement())); }
            @Override public void seekForward() {
                long target = getCurrentPosition() + getSeekForwardIncrement();
                long length = getDuration();
                seekTo(length == C.TIME_UNSET ? target : Math.min(target, length));
            }
        };
        session = new MediaSession.Builder(this, controls).setSessionActivity(open).setCallback(new MediaSession.Callback() {
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

    private void rewind(long amount) {
        if (amount <= 0) return;
        MediaItem item = player.getCurrentMediaItem();
        if (item == null || !player.isCurrentMediaItemSeekable() || player.getPlaybackState() == Player.STATE_ENDED) return;
        long resumePosition = Math.max(0, player.getCurrentPosition() - amount);
        player.seekTo(resumePosition);
        PlaybackProgress.save(this, item.mediaId, resumePosition, EpisodeMedia.from(item));
        flushProgress();
    }

    private void saveProgress() {
        MediaItem item = player.getCurrentMediaItem();
        if (item != null && (player.getPlaybackState() == Player.STATE_READY || player.getPlaybackState() == Player.STATE_ENDED)) {
            long position = player.getCurrentPosition();
            long duration = player.getDuration();
            // Position zero means listened. Matches savedPosition in web/model.js.
            boolean nearEnd = duration != C.TIME_UNSET && duration > 60_000 && duration - position <= 30_000;
            if (nearEnd || player.getPlaybackState() == Player.STATE_ENDED) position = 0;
            PlaybackProgress.save(this, item.mediaId, position, EpisodeMedia.from(item));
        }
    }

    private void play(JSONObject episode, float rate) throws Exception {
        MediaItem item = EpisodeMedia.playable(this, episode);
        long position = PlaybackProgress.chooseResume(this, item.mediaId, episode);
        // Starting an episode from the beginning skips the intro chosen for its podcast.
        if (position < 1000) position = Math.max(position, ShowSettings.introMs(this, episode.getString("feed")));
        saveProgress();
        queue.remove(item.mediaId);
        player.setMediaItem(item, position);
        player.setPlaybackSpeed(rate);
        player.prepare();
        player.play();
    }

    private void advanceQueue() {
        if (player.getPlaybackState() != Player.STATE_ENDED || !player.getPlayWhenReady()) return;
        if (SleepTimer.consumeEnd()) {
            player.pause();
            return;
        }
        try {
            JSONObject next = queue.first();
            if (next != null) play(next, ShowSettings.rate(this, next.getString("feed")));
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
        handler.removeCallbacks(watchForCall);
        saveProgress();
        flushProgress();
        session.release();
        player.release();
        syncIo.shutdown();
        super.onDestroy();
    }
}
