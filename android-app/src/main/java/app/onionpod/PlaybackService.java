package app.onionpod;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

public final class PlaybackService extends MediaSessionService {
    private MediaSession session;
    private ExoPlayer player;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable checkpoint = new Runnable() {
        @Override public void run() {
            saveProgress();
            handler.postDelayed(this, 3000);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        player = new ExoPlayer.Builder(this).setSeekBackIncrementMs(15000)
            .setSeekForwardIncrementMs(30000).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.addListener(new Player.Listener() {
            @Override public void onIsPlayingChanged(boolean playing) { saveProgress(); }
        });
        PendingIntent open = PendingIntent.getActivity(this, 0,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, player).setSessionActivity(open).build();
        handler.post(checkpoint);
    }

    private void saveProgress() {
        MediaItem item = player.getCurrentMediaItem();
        if (item != null && player.getPlaybackState() != Player.STATE_IDLE) {
            long position = player.getPlaybackState() == Player.STATE_ENDED ? 0 : player.getCurrentPosition();
            getSharedPreferences("progress", MODE_PRIVATE).edit().putLong(item.mediaId, position).apply();
        }
    }

    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(checkpoint);
        saveProgress();
        session.release();
        player.release();
        super.onDestroy();
    }
}
